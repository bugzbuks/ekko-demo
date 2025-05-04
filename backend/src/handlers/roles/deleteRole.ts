// src/handlers/roles/deleteRole.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, queryRolesByParent, getRoleById } from '../../lib/dynamo';

const ROLES_TABLE = process.env.ROLES_TABLE!;

// Define the constant for the root role ID, matching the seed script
const ROOT_ROLE_ID = "SYSTEM_ROOT";

// Helper for API responses
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
 * Deletes a role.
 * Prevents deletion if the role has child roles or if it's the root role.
 * Requires caller to be root admin or have a role higher in the hierarchy.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const roleIdToDelete = event.pathParameters?.id;
        if (!roleIdToDelete) {
            return respond(400, { error: 'Role ID required in path' });
        }

        // --- Prevent Root Role Deletion ---
        if (roleIdToDelete === ROOT_ROLE_ID) {
            console.log(`Attempt to delete the root role (${ROOT_ROLE_ID}) blocked.`);
            return respond(403, { error: 'Cannot delete the root system role.' });
        }
        // --- End Root Role Check ---

        // --- Permission Check ---
        const claims = (event.requestContext.authorizer as any)?.claims;
        const callerRolesJson = claims?.['custom:roles'] ?? '[]';
        const isCallerRootAdmin = claims?.['custom:isRootAdmin'] === 'true';
        let callerRoles: string[];
        try {
            callerRoles = JSON.parse(callerRolesJson);
        } catch {
            return respond(400, { error: 'Invalid caller roles claim format' });
        }

        // Fetch the target role to check its parent for permission validation
        const targetRole = await getRoleById(roleIdToDelete); // Needs implementation in lib/dynamo.ts
        if (!targetRole) {
             return respond(404, { error: 'Role not found' });
        }

        // Root admins can delete any non-root role (subject to child check below)
        if (!isCallerRootAdmin) {
             // Non-root admin check: Caller must have authority over the target role
             // This means the target role must be downstream from one of the caller's roles.
             console.log(`Calculating roles downstream from caller roles: ${JSON.stringify(callerRoles)} for deleting ${roleIdToDelete}`);
             const allowed = new Set<string>();
             const visited = new Set<string>();
             const buildAllowed = async (roleId: string) => {
                 if (visited.has(roleId)) return;
                 visited.add(roleId);
                 const children = await queryRolesByParent(roleId);
                 for (const child of children) {
                     allowed.add(child.id); // Add child role itself
                     await buildAllowed(child.id); // Recurse
                 }
             };
             for (const rid of callerRoles) {
                 await buildAllowed(rid);
             }
             console.log(`Caller can manage roles: ${JSON.stringify(Array.from(allowed))}`);

             if (!allowed.has(roleIdToDelete)) {
                 console.log(`Permission denied: Caller cannot manage target role ${roleIdToDelete}.`);
                 return respond(403, { error: 'Permission denied: Cannot delete role outside your management hierarchy' });
             }
              console.log(`Permission granted for non-root admin to delete role ${roleIdToDelete}.`);
        } else {
             console.log(`Permission granted: Caller is root admin.`);
        }
        // --- End Permission Check ---


        // --- Safety Check: Prevent deletion if role has children ---
        console.log(`Checking for children of role ${roleIdToDelete}`);
        const children = await queryRolesByParent(roleIdToDelete);
        if (children.length > 0) {
             console.log(`Deletion blocked: Role ${roleIdToDelete} has children: ${children.map(c=>c.id).join(', ')}`);
            return respond(409, { // 409 Conflict is appropriate here
                error: 'Cannot delete role: It has child roles associated with it.',
                childRoleIds: children.map(c => c.id), // Optionally list children
            });
        }
         console.log(`Safety check passed: Role ${roleIdToDelete} has no children.`);
        // --- End Safety Check ---


        // --- Deletion ---
        // Note: We are NOT currently handling removal of this role from users' roles arrays.
        // This would require scanning/updating users and adds significant complexity/cost.
        // The application logic should handle cases where a user has an orphaned role ID.
        console.log(`Attempting to delete role ${roleIdToDelete} from DynamoDB table ${ROLES_TABLE}`);
        await ddb.send(new DeleteCommand({
            TableName: ROLES_TABLE,
            Key: { id: roleIdToDelete },
        }));
        console.log(`Role ${roleIdToDelete} deleted from DynamoDB.`);
        // --- End Deletion ---

        return respond(200, { message: `Role ${roleIdToDelete} deleted successfully` });

    } catch (err: any) {
        console.error('deleteRole error:', err);
        return respond(500, { error: 'Internal server error during role deletion' });
    }
};

// --- Helper function needed in src/lib/dynamo.ts ---
/*
async function getRoleById(roleId: string) {
  const command = new GetCommand({
    TableName: process.env.ROLES_TABLE!,
    Key: { id: roleId },
  });
  const res = await ddb.send(command);
  return res.Item;
}
*/
