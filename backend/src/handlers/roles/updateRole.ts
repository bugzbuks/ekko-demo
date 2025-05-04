// src/handlers/roles/updateRole.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, getRoleById, queryRolesByParent } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils';

const ROLES_TABLE = process.env.ROLES_TABLE!;
const ROOT_ROLE_ID = "SYSTEM_ROOT"; // Matches seed script
const TOP_LEVEL_PARENT_ID = "ROOT"; // Sentinel value for top-level roles

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
 * Handler to update an existing role (name, roleType, parentId).
 * Expects JSON body: { name: string, roleType: string, parentId: string | null }
 * - Cannot update the root role.
 * - Cannot make a role its own parent.
 * - Requires caller to be root admin OR manage the role's *current* parent (if not top-level).
 * - Requires caller to be root admin OR manage the *new* parent role being assigned (if not top-level).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // --- Get Target Role ID ---
        const roleIdToUpdate = event.pathParameters?.id;
        if (!roleIdToUpdate) {
            return respond(400, { error: 'Role ID required in path parameter' });
        }
        console.log(`[updateRole] Attempting to update role: ${roleIdToUpdate}`);

        // --- Prevent Updating Root Role ---
        if (roleIdToUpdate === ROOT_ROLE_ID) {
            console.log(`[updateRole] Blocked: Attempt to update the root role (${ROOT_ROLE_ID}).`);
            return respond(403, { error: 'Cannot modify the root system role.' });
        }
        // --- End Root Role Check ---


        // --- Get Caller Details ---
        const caller = getCallerDetails(event);
        if (!caller.isAuthenticated) {
            return respond(401, { error: caller.error || 'Unauthorized' });
        }
        const { roles: callerRoles, isRootAdmin: isCallerRootAdmin } = caller;
        console.log(`[updateRole] Caller: ${caller.email}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
        // --- End Get Caller Details ---


        // --- Parse Request Body ---
        let body: any;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return respond(400, { error: 'Invalid JSON body' });
        }
        const { name: newName, roleType: newRoleType, parentId: newParentIdInput } = body;

        // Validate input payload structure and types
        if (!newName || typeof newName !== 'string' || newName.trim() === '') {
            return respond(400, { error: 'Role name (string) is required' });
        }
        if (!newRoleType || typeof newRoleType !== 'string' || newRoleType.trim() === '') {
            return respond(400, { error: 'Role roleType (string) is required' });
        }
        // Validate parentId: must be a string or explicitly null (or omitted -> becomes null)
        if (newParentIdInput !== undefined && newParentIdInput !== null && typeof newParentIdInput !== 'string') {
             return respond(400, { error: 'parentId must be a string or null/omitted' });
        }
        // Use TOP_LEVEL_PARENT_ID ('ROOT') if parentId is null or empty string from input
        const newParentId = (newParentIdInput === null || newParentIdInput === undefined || newParentIdInput === '') ? TOP_LEVEL_PARENT_ID : newParentIdInput;

        // --- End Parse Request Body ---


        // --- Hierarchy Sanity Checks ---
        // 1. Cannot make a role its own parent
        if (roleIdToUpdate === newParentId) {
            console.log(`[updateRole] Blocked: Attempt to make role ${roleIdToUpdate} its own parent.`);
            return respond(400, { error: 'A role cannot be its own parent.' });
        }
        // 2. TODO (Advanced): Prevent circular dependencies (e.g., A -> B -> C -> A).
        //    This requires traversing up the hierarchy from the newParentId, which can be complex/slow. Deferring for now.
        // --- End Hierarchy Sanity Checks ---


        // --- Fetch Existing Role ---
        console.log(`[updateRole] Fetching existing role ${roleIdToUpdate} from table ${ROLES_TABLE}`);
        const existingRole = await getRoleById(roleIdToUpdate);
        if (!existingRole) {
            return respond(404, { error: 'Role not found' });
        }
        const currentParentId = existingRole.parentId || TOP_LEVEL_PARENT_ID; // Assume TOP_LEVEL_PARENT_ID if null/missing
        console.log(`[updateRole] Existing role found. Current ParentId: ${currentParentId}`);
        // --- End Fetch Existing Role ---


        // --- Check if New Parent Exists (if not ROOT) ---
        if (newParentId !== TOP_LEVEL_PARENT_ID) {
            console.log(`[updateRole] Verifying new parent role exists: ${newParentId}`);
            const newParentRole = await getRoleById(newParentId);
            if (!newParentRole) {
                 console.log(`[updateRole] Blocked: New parent role ${newParentId} does not exist.`);
                 return respond(400, { error: `Specified parent role (${newParentId}) does not exist.` });
            }
             console.log(`[updateRole] New parent role ${newParentId} verified.`);
        }
        // --- End Check if New Parent Exists ---


        // --- Permission Checks ---
        let canManageCurrentParent = false;
        let canManageNewParent = false;
        let assignableRoles = new Set<string>(); // Roles the caller can manage/assign

        if (!isCallerRootAdmin) {
            console.log(`[updateRole] Non-root admin permission checks for caller roles: ${JSON.stringify(callerRoles)}`);
            // Calculate roles caller can manage (downstream)
            const visited = new Set<string>();
            const buildAssignable = async (roleId: string) => {
                if (!roleId || visited.has(roleId)) return;
                visited.add(roleId);
                const children = await queryRolesByParent(roleId);
                for (const child of children) {
                    assignableRoles.add(child.id);
                    await buildAssignable(child.id);
                }
            };
            for (const rid of callerRoles) {
                await buildAssignable(rid);
            }
            console.log(`[updateRole] Caller can manage/assign roles: ${JSON.stringify(Array.from(assignableRoles))}`);

            // Check 1: Can caller manage the role based on its *current* parent?
            // If current parent is ROOT, only root can manage (already handled by isCallerRootAdmin check).
            // If current parent is another role, that parent ID must be in caller's roles OR in their assignableRoles.
            if (currentParentId === TOP_LEVEL_PARENT_ID) {
                canManageCurrentParent = false; // Non-root cannot manage top-level roles
                console.log(`[updateRole] Permission Check 1 Failed: Non-root cannot manage top-level role.`);
            } else {
                // Check if currentParentId is one of the caller's own roles OR assignable by them
                canManageCurrentParent = callerRoles.includes(currentParentId) || assignableRoles.has(currentParentId);
                 console.log(`[updateRole] Permission Check 1 (Manage Current Parent ${currentParentId}): ${canManageCurrentParent}`);
            }

            // Check 2: Can caller manage the *new* parent role they are assigning?
            // If new parent is ROOT, only root can assign (already handled).
            // If new parent is another role, that parent ID must be in caller's roles OR assignableRoles.
            if (newParentId === TOP_LEVEL_PARENT_ID) {
                canManageNewParent = false; // Non-root cannot assign role to top-level
                 console.log(`[updateRole] Permission Check 2 Failed: Non-root cannot assign role to top-level.`);
            } else {
                 // Check if newParentId is one of the caller's own roles OR assignable by them
                 canManageNewParent = callerRoles.includes(newParentId) || assignableRoles.has(newParentId);
                  console.log(`[updateRole] Permission Check 2 (Manage New Parent ${newParentId}): ${canManageNewParent}`);
            }

            // Must satisfy both checks
            if (!canManageCurrentParent || !canManageNewParent) {
                console.log(`[updateRole] Permission denied. ManageCurrentParent=${canManageCurrentParent}, ManageNewParent=${canManageNewParent}`);
                return respond(403, { error: 'Permission denied: Cannot manage this role or assign it to the requested parent.' });
            }
            console.log(`[updateRole] Permission granted for non-root admin.`);

        } else {
            console.log(`[updateRole] Permission granted: Caller is root admin.`);
            canManageCurrentParent = true; // Root can manage any parent relationship change
            canManageNewParent = true;
        }
        // --- End Permission Checks ---


        // --- Update Role in DynamoDB ---
        if (!canManageCurrentParent || !canManageNewParent) {
             console.error("[updateRole] Reached update block without sufficient permissions. Logic error.");
             return respond(500, { error: 'Internal permission check error.' });
        }

        console.log(`[updateRole] Updating role ${roleIdToUpdate} in ${ROLES_TABLE} with Name: ${newName}, Type: ${newRoleType}, ParentId: ${newParentId}`);

        // Use UpdateCommand for targeted updates
        const updateParams = {
            TableName: ROLES_TABLE,
            Key: { id: roleIdToUpdate },
            // Update name, roleType, and parentId
            UpdateExpression: "SET #nm = :n, #rt = :t, #pid = :p",
            ExpressionAttributeNames: {
                "#nm": "name",
                "#rt": "roleType",
                "#pid": "parentId",
            },
            ExpressionAttributeValues: {
                ":n": newName,
                ":t": newRoleType,
                ":p": newParentId, // Use the processed parent ID ('ROOT' or actual ID)
            },
            ReturnValues: "ALL_NEW" as const, // Return the entire updated item
        };

        const updateCommand = new UpdateCommand(updateParams);
        const updateResult = await ddb.send(updateCommand);
        console.log(`[updateRole] Role ${roleIdToUpdate} updated successfully.`);
        // --- End Update Role ---

        // Return the updated role data
        return respond(200, { message: 'Role updated successfully', role: updateResult.Attributes });

    } catch (err: any) {
        console.error('[updateRole] Unhandled error:', err);
        return respond(500, { error: 'Internal server error during role update' });
    }
};
