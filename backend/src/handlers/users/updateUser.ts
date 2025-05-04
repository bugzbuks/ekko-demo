// src/handlers/users/updateUser.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'; // Use UpdateCommand for targeted updates
import { ddb, getUserByEmail, queryRolesByParent } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils'; // Import the helper

const USERS_TABLE = process.env.USERS_TABLE!;
const ROOT_ADMIN_EMAIL = "root@system.app"; // Prevent modifying root admin roles/status

// Helper for API responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
    statusCode,
    headers: { // Add CORS headers
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(payload),
});

/**
 * Handler to update an existing user record (name and roles).
 * Expects JSON body: { name: string, roles: string[] }
 * - Requires caller to be root admin OR manage all *current* roles of the target user.
 * - Requires caller to be root admin OR manage all *new* roles being assigned.
 * - Prevents changing roles or root status of the primary root admin.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // --- Get Target User Email ---
    const targetEmail = event.pathParameters?.email;
    if (!targetEmail) {
        return respond(400, { error: 'User email required in path parameter' });
    }
    // Decode email as API Gateway URL encodes path parameters
    const decodedEmail = decodeURIComponent(targetEmail);
    console.log(`[updateUser] Attempting to update user: ${decodedEmail}`);

    // --- Get Caller Details ---
    const caller = getCallerDetails(event);
    // Check if we could successfully determine the caller's identity
    if (!caller.isAuthenticated) {
        // If not authenticated (e.g., missing token locally, or authorizer failed)
        return respond(401, { error: caller.error || 'Unauthorized' });
    }
    const { roles: callerRoles, isRootAdmin: isCallerRootAdmin } = caller;
    console.log(`[updateUser] Caller: ${caller.email}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
    // --- End Get Caller Details ---


    // --- Parse Request Body ---
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }
    const { name: newName, roles: newRoles } = body; // Extract new name and roles from body

    // Validate input payload structure and types
    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
        return respond(400, { error: 'User name (string) is required' });
    }
    if (!Array.isArray(newRoles) || newRoles.some(r => typeof r !== 'string')) {
        // Ensure 'roles' is an array of strings
        return respond(400, { error: 'roles (string array) are required' });
    }
    if (newRoles.length === 0) {
        // Enforce that at least one role must be assigned
        return respond(400, { error: 'At least one role must be assigned' });
    }
    // --- End Parse Request Body ---


    // --- Fetch Existing User ---
    console.log(`[updateUser] Fetching existing user ${decodedEmail} from table ${USERS_TABLE}`);
    const existingUser = await getUserByEmail(decodedEmail);
    if (!existingUser) {
        // Cannot update a user that doesn't exist
        return respond(404, { error: 'User not found' });
    }
    const currentRoles: string[] = existingUser.roles || []; // Get current roles, default to empty array
    console.log(`[updateUser] Existing user found. Current Roles: ${JSON.stringify(currentRoles)}`);
    // --- End Fetch Existing User ---


    // --- Prevent Modifying Root Admin ---
    // Check if the target user is the designated root admin
    if (decodedEmail === ROOT_ADMIN_EMAIL) {
        // Compare current roles with new roles (ignoring order)
        const rolesChanged = JSON.stringify(currentRoles.sort()) !== JSON.stringify([...newRoles].sort());
        if (rolesChanged) {
             // Block attempts to change the roles of the root admin
             console.log(`[updateUser] Blocked: Attempt to change roles of root admin ${ROOT_ADMIN_EMAIL}`);
             return respond(403, { error: 'Cannot change roles of the primary root admin user.' });
        }
        // Note: We don't allow changing the isRootAdmin flag via this endpoint,
        // so no check needed for that. Name changes are allowed.
    }
    // --- End Prevent Modifying Root Admin ---


    // --- Permission Checks ---
    let canManageCurrentUser = false; // Can the caller manage the user based on current roles?
    let canAssignNewRoles = false;    // Can the caller assign all the requested new roles?
    let assignableRoles = new Set<string>(); // Set of role IDs the caller can assign/manage

    // Only perform detailed checks if the caller is NOT a root admin
    if (!isCallerRootAdmin) {
        console.log(`[updateUser] Non-root admin permission checks for caller roles: ${JSON.stringify(callerRoles)}`);

        // Calculate roles the caller can manage (downstream roles)
        const visited = new Set<string>(); // Prevent infinite loops in hierarchy
        const buildAssignable = async (roleId: string) => {
            if (!roleId || visited.has(roleId)) return; // Skip null/undefined/visited
            visited.add(roleId);
            const children = await queryRolesByParent(roleId); // Fetch direct children
            for (const child of children) {
                assignableRoles.add(child.id); // Add the child role ID to the manageable set
                await buildAssignable(child.id); // Recurse down the hierarchy
            }
        };
        // Build the set of assignable roles starting from each role the caller possesses
        for (const rid of callerRoles) {
            // Decide if caller can manage roles at their own level. Assuming only below for now.
            // assignableRoles.add(rid); // Uncomment if users can manage peers
            await buildAssignable(rid);
        }
        console.log(`[updateUser] Caller can manage/assign roles: ${JSON.stringify(Array.from(assignableRoles))}`);

        // Check 1: Can caller manage the user based on their *current* roles?
        // All existing roles of the target user must be within the caller's manageable set.
        if (currentRoles.length === 0) {
             // Define policy: Can non-root manage users with no roles? Assume no for safety.
             canManageCurrentUser = false;
             console.log(`[updateUser] Permission Check 1 Failed: Non-root cannot manage user with no current roles.`);
        } else {
             canManageCurrentUser = currentRoles.every(role => assignableRoles.has(role));
             console.log(`[updateUser] Permission Check 1 (Manage Current): ${canManageCurrentUser}`);
        }

        // Check 2: Can caller assign all the *new* roles requested?
        // All roles in the input 'newRoles' array must be within the caller's manageable set.
        canAssignNewRoles = newRoles.every(role => assignableRoles.has(role));
        console.log(`[updateUser] Permission Check 2 (Assign New): ${canAssignNewRoles}`);

        // Final Permission Decision: Must satisfy both checks
        if (!canManageCurrentUser || !canAssignNewRoles) {
             console.log(`[updateUser] Permission denied. ManageCurrent=${canManageCurrentUser}, AssignNew=${canAssignNewRoles}`);
             return respond(403, { error: 'Permission denied: Cannot manage this user or assign the requested roles.' });
        }
         console.log(`[updateUser] Permission granted for non-root admin.`);

    } else {
        // Caller is root admin, grant permissions
        console.log(`[updateUser] Permission granted: Caller is root admin.`);
        canManageCurrentUser = true;
        canAssignNewRoles = true;
    }
    // --- End Permission Checks ---


    // --- Update User in DynamoDB ---
    // Only proceed if permissions were granted
    if (!canManageCurrentUser || !canAssignNewRoles) {
         // This is a safeguard; the code should have returned 403 earlier if permissions failed.
         console.error("[updateUser] Reached update block without sufficient permissions. This indicates a logic error.");
         return respond(500, { error: 'Internal permission check error.' });
    }

    console.log(`[updateUser] Updating user ${decodedEmail} in ${USERS_TABLE} with Name: ${newName}, Roles: ${JSON.stringify(newRoles)}`);

    // Use DynamoDB UpdateCommand for efficient partial updates
    const updateParams = {
        TableName: USERS_TABLE,
        Key: { email: decodedEmail }, // Specify the primary key of the item to update
        // Define the update operation using SET action
        UpdateExpression: "SET #nm = :n, #rl = :r", // Update 'name' and 'roles' attributes
        ExpressionAttributeNames: {
            // Use placeholders for attribute names that might be reserved words
            "#nm": "name",
            "#rl": "roles",
        },
        ExpressionAttributeValues: {
            // Provide the new values for the attributes
            ":n": newName,   // New name value
            ":r": newRoles,  // New roles array value
        },
        ReturnValues: "UPDATED_NEW" as const, // Optional: Return the values of the updated attributes
    };

    // Send the UpdateCommand to DynamoDB
    const updateCommand = new UpdateCommand(updateParams);
    const updateResult = await ddb.send(updateCommand);
    console.log(`[updateUser] User ${decodedEmail} updated successfully. Result:`, updateResult.Attributes);
    // --- End Update User ---

    // Construct the updated user object to return in the response
    // We use the new values and retain the existing isRootAdmin status
    const updatedUser = {
        email: decodedEmail,
        name: newName,
        roles: newRoles,
        isRootAdmin: existingUser.isRootAdmin // Keep the original root status
    };

    // Return a success response
    return respond(200, { message: 'User updated successfully', user: updatedUser });

  } catch (err: any) {
    // Catch any unexpected errors during the process
    console.error('[updateUser] Unhandled error:', err);
    // Check for specific DynamoDB errors if needed (e.g., ConditionalCheckFailedException)
    return respond(500, { error: 'Internal server error during user update' });
  }
};
