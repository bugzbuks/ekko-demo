// src/handlers/users/createUser.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, queryRolesByParent } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils'; // Import the helper

const USERS_TABLE = process.env.USERS_TABLE!;

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
 * Handler to pre-create or update a user record (approved users)
 * Expects JSON body: { email: string, name: string, roles: string[] }
 * Only allows assignment of roles downstream of caller's roles (unless root admin)
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // --- Get Caller Details ---
    const caller = getCallerDetails(event);
    if (!caller.isAuthenticated) {
        // Handle cases where authentication details couldn't be determined (e.g., missing token locally)
        return respond(401, { error: caller.error || 'Unauthorized' });
    }
    const { roles: callerRoles, isRootAdmin: isCallerRootAdmin } = caller;
    console.log(`[createUser] Caller: ${caller.email}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
    // --- End Get Caller Details ---


    // Parse request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }
    const { email: targetEmail, name, roles: targetRoles } = body; // Renamed email to targetEmail for clarity

    // Validate input payload
    if (!targetEmail || !name || !Array.isArray(targetRoles) || targetRoles.some(r => typeof r !== 'string')) {
      return respond(400, { error: 'email (string), name (string), and roles (string array) are required' });
    }
    if (targetRoles.length === 0) {
        // Decide if creating users with no roles is allowed. Let's require at least one for now.
         return respond(400, { error: 'At least one role must be assigned' });
    }


    // --- Permission Check: Can caller assign these roles? ---
    if (!isCallerRootAdmin) {
      console.log(`[createUser] Non-root admin check. Caller roles: ${JSON.stringify(callerRoles)}, Target roles: ${JSON.stringify(targetRoles)}`);
      // Determine roles assignable by the caller (downstream roles)
      const assignableRoles = new Set<string>();
      const visited = new Set<string>();
      const buildAssignable = async (roleId: string) => {
        if (!roleId || visited.has(roleId)) return;
        visited.add(roleId);
        const children = await queryRolesByParent(roleId);
        for (const child of children) {
          assignableRoles.add(child.id); // Add the child role ID
          await buildAssignable(child.id); // Recurse
        }
      };
      for (const rid of callerRoles) {
        // Decide if caller can assign their *own* roles. Let's assume yes for now.
        // assignableRoles.add(rid); // Uncomment if needed
        await buildAssignable(rid); // Find roles below the caller
      }

      console.log(`[createUser] Caller can assign roles: ${JSON.stringify(Array.from(assignableRoles))}`);

      // Validate that ALL requested target roles are within the assignable set
      for (const requestedRole of targetRoles) {
        if (!assignableRoles.has(requestedRole)) {
           console.log(`[createUser] Permission denied: Caller cannot assign role ${requestedRole}.`);
          return respond(403, { error: `Permission denied: Cannot assign role '${requestedRole}' outside your management hierarchy` });
        }
      }
       console.log(`[createUser] Permission granted for non-root admin.`);
    } else {
         console.log(`[createUser] Permission granted: Caller is root admin.`);
    }
    // --- End Permission Check ---


    // Build user item for DynamoDB
    // Ensure isRootAdmin for the *created* user is always false unless specifically intended
    const userItem = {
        email: targetEmail,
        name,
        roles: targetRoles,
        isRootAdmin: false // Default new users to non-root
    };

    // Save (upsert) into DynamoDB
    console.log(`[createUser] Saving user item to ${process.env.USERS_TABLE}:`, userItem);
    await ddb.send(new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: userItem,
    }));
     console.log(`[createUser] User ${targetEmail} saved successfully.`);

    return respond(201, { message: 'User created/updated successfully', user: userItem });

  } catch (err: any) {
    console.error('[createUser] Unhandled error:', err);
    return respond(500, { error: 'Internal server error during user creation' });
  }
};

