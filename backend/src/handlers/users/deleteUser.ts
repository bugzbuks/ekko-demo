// src/handlers/users/deleteUser.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, getUserByEmail, queryRolesByParent } from '../../lib/dynamo'; // Assuming these helpers exist in dynamo lib

// Ensure required environment variables are set
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
if (!USER_POOL_ID) {
  throw new Error('Missing COGNITO_USER_POOL_ID env var');
}
const USERS_TABLE = process.env.USERS_TABLE;
if (!USERS_TABLE) {
    throw new Error('Missing USERS_TABLE env var');
}

// Define the specific email of the root admin user that should not be deleted
const ROOT_ADMIN_EMAIL = "root@system.app"; // Match the email used in the seed script

// Initialize Cognito client
const cognito = new CognitoIdentityProviderClient({});

// Helper function for creating API Gateway responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
    statusCode,
    // Ensure CORS headers if needed, matching serverless.yml config
    headers: {
        'Access-Control-Allow-Origin': '*', // Adjust for specific origins in production
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(payload),
});

/**
 * Lambda handler to delete a user.
 * - Prevents deletion of the designated ROOT_ADMIN_EMAIL.
 * - Deletes the user record from DynamoDB.
 * - Deletes the user from the Cognito User Pool.
 * - Requires the caller to be a root admin OR have a role that manages
 * ALL roles assigned to the target user.
 *
 * Path Parameter: {email} - The URL-encoded email of the user to delete.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // --- Input Validation ---
        const targetEmail = event.pathParameters?.email;
        if (!targetEmail) {
            return respond(400, { error: 'User email required in path parameter' });
        }
        // Decode email as API Gateway URL encodes path parameters
        const decodedEmail = decodeURIComponent(targetEmail);
        console.log(`Attempting to delete user: ${decodedEmail}`);

        // --- Prevent Root Admin Deletion ---
        if (decodedEmail === ROOT_ADMIN_EMAIL) {
            console.log(`Attempt to delete the root admin user (${ROOT_ADMIN_EMAIL}) blocked.`);
            return respond(403, { error: 'Cannot delete the primary root admin user.' });
        }
        // --- End Root Admin Check ---

        // --- Permission Check ---
        // Extract claims from the authorizer context provided by API Gateway
        const claims = (event.requestContext.authorizer as any)?.claims;
        if (!claims) {
             console.error("Authorization claims missing from request context.");
             return respond(401, { error: 'Unauthorized: Missing authorization claims.' });
        }
        const callerRolesJson = claims?.['custom:roles'] ?? '[]';
        const isCallerRootAdmin = claims?.['custom:isRootAdmin'] === 'true';
        let callerRoles: string[];

        try {
            callerRoles = JSON.parse(callerRolesJson);
        } catch (parseError) {
            console.error("Error parsing caller roles claim:", callerRolesJson, parseError);
            return respond(400, { error: 'Invalid caller roles claim format' });
        }

        console.log(`Caller Info: Email=${claims?.email}, IsRoot=${isCallerRootAdmin}, Roles=${callerRolesJson}`);

        // Fetch the target user from DynamoDB to check their roles for permission validation
        console.log(`Fetching target user ${decodedEmail} from table ${USERS_TABLE}`);
        const targetUser = await getUserByEmail(decodedEmail);

        if (!targetUser) {
            // If user not found in DynamoDB, they might still exist in Cognito.
            // We'll proceed to try deleting from Cognito, but log this inconsistency.
            console.log(`Target user ${decodedEmail} not found in DynamoDB table ${USERS_TABLE}. Proceeding to Cognito deletion attempt.`);
            // Skip further permission checks based on DynamoDB roles if the user isn't there
        } else {
             console.log(`Found target user ${decodedEmail}. Roles: ${JSON.stringify(targetUser.roles)}`);
             const targetUserRoles: string[] = targetUser.roles || [];

             // Perform permission check ONLY if the caller is NOT a root admin
             if (!isCallerRootAdmin) {
                 // If target has no roles, only root should delete? Or specific permission needed?
                 // Current logic: Non-root cannot delete users without roles.
                 if (targetUserRoles.length === 0) {
                     console.log(`Permission denied: Non-root admin cannot delete user ${decodedEmail} with no roles.`);
                     return respond(403, { error: 'Permission denied: Cannot delete user with no roles assigned (requires root)' });
                 }

                 // Get all roles downstream from the caller's roles
                 console.log(`Calculating roles downstream from caller roles: ${JSON.stringify(callerRoles)}`);
                 const manageableRoles = new Set<string>(); // Roles the caller can manage
                 const visited = new Set<string>();
                 const buildManageableRoles = async (roleId: string) => {
                     if (visited.has(roleId)) return;
                     visited.add(roleId);
                     // Fetch direct children using the efficient query
                     const children = await queryRolesByParent(roleId);
                     for (const child of children) {
                         manageableRoles.add(child.id); // Add the child role ID
                         await buildManageableRoles(child.id); // Recurse to find grandchildren etc.
                     }
                 };
                 // Build the set of manageable roles for the caller
                 for (const rid of callerRoles) {
                     // Decide if a caller can manage users with their *own* role ID.
                     // Assuming NO for now (can only manage strictly below). Adjust if needed.
                     // manageableRoles.add(rid);
                     await buildManageableRoles(rid);
                 }
                 console.log(`Caller can manage roles: ${JSON.stringify(Array.from(manageableRoles))}`);

                 // Check if ALL of the target user's roles are within the manageable set
                 const canDelete = targetUserRoles.every(targetRole => manageableRoles.has(targetRole));

                 if (!canDelete) {
                     console.log(`Permission denied: Caller cannot manage one or more roles of target user ${decodedEmail}. Target roles: ${JSON.stringify(targetUserRoles)}`);
                     return respond(403, { error: 'Permission denied: Cannot delete user outside your management hierarchy' });
                 }
                 console.log(`Permission granted for non-root admin to delete user ${decodedEmail}.`);
             } else {
                 console.log(`Permission granted: Caller is root admin.`);
             }
        }
        // --- End Permission Check ---

        // --- Deletion Process ---
        let dynamoDeleted = false;
        let cognitoDeleted = false;

        // 1. Delete from DynamoDB (if user existed there)
        if (targetUser) {
            try {
                console.log(`Attempting to delete user ${decodedEmail} from DynamoDB table ${USERS_TABLE}`);
                await ddb.send(new DeleteCommand({
                    TableName: USERS_TABLE,
                    Key: { email: decodedEmail }, // 'email' is the primary key
                }));
                dynamoDeleted = true;
                console.log(`User ${decodedEmail} deleted from DynamoDB.`);
            } catch (dynamoError: any) {
                 console.error(`Error deleting user ${decodedEmail} from DynamoDB:`, dynamoError);
                 // If DynamoDB delete fails, stop before trying Cognito to avoid leaving an orphaned Cognito user.
                 return respond(500, { error: 'Failed to delete user from database' });
            }
        } else {
             // User wasn't in DynamoDB, so nothing to delete there.
             // Consider it "successfully" deleted in the sense that it's not present.
             dynamoDeleted = true;
        }


        // 2. Delete from Cognito (proceed only if DynamoDB part was successful or user wasn't there)
        if (dynamoDeleted) {
            try {
                console.log(`Attempting to delete user ${decodedEmail} from Cognito pool ${USER_POOL_ID}`);
                await cognito.send(new AdminDeleteUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: decodedEmail, // Cognito Username is the email in this setup
                }));
                cognitoDeleted = true;
                console.log(`User ${decodedEmail} deleted from Cognito.`);
            } catch (cognitoError: any) {
                // Log Cognito error but don't necessarily fail the whole request if Dynamo delete succeeded
                console.warn(`Could not delete user ${decodedEmail} from Cognito: ${cognitoError.message} (Code: ${cognitoError.name})`);
                if (cognitoError.name === 'UserNotFoundException') {
                    console.log(`User ${decodedEmail} was not found in Cognito (already deleted?). Setting cognitoDeleted=true.`);
                    cognitoDeleted = true; // Treat as success if already gone
                } else {
                    // For other Cognito errors, log but still report overall success
                    // if the primary goal (DynamoDB deletion) succeeded.
                    console.error("Unexpected Cognito error during deletion:", cognitoError);
                    // Keep cognitoDeleted as false to indicate partial failure
                }
            }
        }
        // --- End Deletion Process ---

        // Determine final response based on success of both steps
        if (dynamoDeleted && cognitoDeleted) {
            return respond(200, { message: `User ${decodedEmail} deleted successfully from all systems` });
        } else if (dynamoDeleted && !cognitoDeleted) {
             // This case implies an unexpected Cognito error occurred after successful DynamoDB deletion
             return respond(207, { // 207 Multi-Status might be appropriate
                 message: `User ${decodedEmail} deleted from database, but failed to delete from Cognito. Manual cleanup may be required.`,
                 detail: "Check logs for Cognito error details."
             });
        } else {
             // This case should theoretically be caught earlier if dynamo delete failed.
             console.error("Reached unexpected final state in deleteUser handler.");
             return respond(500, { error: 'An unexpected error occurred during user deletion.' });
        }
    } catch (err: any) {
        // Catch-all for unexpected errors during setup/permission checks
        console.error('Unhandled deleteUser error:', err);
        return respond(500, { error: 'Internal server error during user deletion process' });
    }
};
