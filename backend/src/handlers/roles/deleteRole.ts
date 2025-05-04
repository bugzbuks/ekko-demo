// src/handlers/roles/deleteRole.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
// Assuming getRoleById and queryRolesByParent helpers exist in dynamo lib
import { ddb, getRoleById, queryRolesByParent } from '../../lib/dynamo';
// Import the authentication helper
import { getCallerDetails } from '../../lib/authUtils';

// Ensure ROLES_TABLE environment variable is set
const ROLES_TABLE = process.env.ROLES_TABLE;
if (!ROLES_TABLE) {
    throw new Error('Missing ROLES_TABLE env var');
}

// Constants defined in the seed script
const ROOT_ROLE_ID = "SYSTEM_ROOT";
const TOP_LEVEL_PARENT_ID = "ROOT"; // Value representing top-level parent in DB

// Helper function for creating API Gateway responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
    statusCode,
    headers: { // Add CORS headers for consistency
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(payload),
});

/**
 * Lambda handler to delete an existing role.
 * - Cannot delete the root role (SYSTEM_ROOT).
 * - Cannot delete a role that has child roles.
 * - Requires caller to be root admin OR the target role must be downstream
 * in the hierarchy from one of the caller's assigned roles.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // --- Get Target Role ID ---
        const roleIdToDelete = event.pathParameters?.id;
        if (!roleIdToDelete) {
            return respond(400, { error: 'Role ID required in path parameter' });
        }
        console.log(`[deleteRole] Attempting to delete role: ${roleIdToDelete}`);

        // --- Prevent Deleting Root Role ---
        if (roleIdToDelete === ROOT_ROLE_ID) {
            console.log(`[deleteRole] Blocked: Attempt to delete the root role (${ROOT_ROLE_ID}).`);
            return respond(403, { error: 'Cannot delete the root system role.' });
        }
        // --- End Root Role Check ---


        // --- Get Caller Details ---
        const caller = getCallerDetails(event);
        // Ensure caller details could be determined
        if (!caller.isAuthenticated) {
            return respond(401, { error: caller.error || 'Unauthorized' });
        }
        const { roles: callerRoles, isRootAdmin: isCallerRootAdmin } = caller;
        console.log(`[deleteRole] Caller: ${caller.email}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
        // --- End Get Caller Details ---


        // --- Fetch Existing Role to be Deleted (Optional but good practice) ---
        // We don't strictly *need* the role details for the downstream check,
        // but fetching it confirms existence before attempting delete.
        console.log(`[deleteRole] Fetching role to delete: ${roleIdToDelete}`);
        const targetRole = await getRoleById(roleIdToDelete); // Uses helper from lib/dynamo.ts
        if (!targetRole) {
            // Role doesn't exist, return 404
            return respond(404, { error: 'Role not found' });
        }
        console.log(`[deleteRole] Role found. Name: ${targetRole.name}, ParentId: ${targetRole.parentId || TOP_LEVEL_PARENT_ID}`);
        // --- End Fetch Existing Role ---


        // --- Permission Check ---
        let canDelete = false;
        if (isCallerRootAdmin) {
            // Root admin can delete any non-root role (subject to child check)
            canDelete = true;
            console.log(`[deleteRole] Permission granted: Caller is root admin.`);
        } else {
            // Non-root admin check:
            // Calculate all roles downstream from the caller's roles.
            // The role to be deleted must be in this set.
            console.log(`[deleteRole] Non-root admin check. Calculating downstream roles from: ${JSON.stringify(callerRoles)}`);
            const manageableRoles = new Set<string>(); // Roles the caller can manage (downstream)
            const visited = new Set<string>();

            const buildManageableRoles = async (roleId: string) => {
                // Skip if roleId is falsy or already visited
                if (!roleId || visited.has(roleId)) return;
                visited.add(roleId);
                // Fetch direct children using the efficient query
                const children = await queryRolesByParent(roleId);
                for (const child of children) {
                    manageableRoles.add(child.id); // Add the child role ID to the manageable set
                    await buildManageableRoles(child.id); // Recurse down the hierarchy
                }
            };

            // Build the set of manageable roles starting from each role the caller possesses
            for (const rid of callerRoles) {
                await buildManageableRoles(rid);
            }
            console.log(`[deleteRole] Caller can manage roles (downstream): ${JSON.stringify(Array.from(manageableRoles))}`);

            // Check if the role to be deleted is in the manageable set
            if (manageableRoles.has(roleIdToDelete)) {
                canDelete = true;
                console.log(`[deleteRole] Permission granted: Target role ${roleIdToDelete} is downstream.`);
            } else {
                canDelete = false;
                console.log(`[deleteRole] Permission denied: Target role ${roleIdToDelete} is not downstream.`);
            }
        }

        if (!canDelete) {
            return respond(403, { error: 'Permission denied: You do not have permission to delete this role.' });
        }
        // --- End Permission Check ---


        // --- Safety Check: Prevent deletion if role has children ---
        console.log(`[deleteRole] Checking for children of role ${roleIdToDelete}`);
        const children = await queryRolesByParent(roleIdToDelete);
        if (children.length > 0) {
             console.log(`[deleteRole] Deletion blocked: Role ${roleIdToDelete} has children: ${children.map(c=>c.id).join(', ')}`);
            return respond(409, { // 409 Conflict is appropriate here
                error: 'Cannot delete role: It has child roles associated with it.',
                childRoleIds: children.map(c => c.id), // Optionally list children
            });
        }
         console.log(`[deleteRole] Safety check passed: Role ${roleIdToDelete} has no children.`);
        // --- End Safety Check ---


        // --- Deletion ---
        // Note: Does not clean up role ID from assigned users (see README TODO)
        console.log(`[deleteRole] Attempting to delete role ${roleIdToDelete} from DynamoDB table ${ROLES_TABLE}`);
        await ddb.send(new DeleteCommand({
            TableName: ROLES_TABLE,
            Key: { id: roleIdToDelete }, // 'id' is the primary key
        }));
        console.log(`[deleteRole] Role ${roleIdToDelete} deleted from DynamoDB.`);
        // --- End Deletion ---

        return respond(200, { message: `Role ${roleIdToDelete} deleted successfully` });

    } catch (err: any) {
        // Catch any unexpected errors
        console.error('[deleteRole] Unhandled error:', err);
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
