// src/handlers/roles/getAssignableRoles.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { queryRolesByParent } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils'; // Import the helper

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
 * Handler for retrieving all descendant roles assignable by the current user.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // --- Get Caller Details ---
    const caller = getCallerDetails(event);
    // This endpoint requires authentication details to determine assignable roles
    if (!caller.isAuthenticated) {
        return respond(401, { error: caller.error || 'Unauthorized' });
    }
    // Root admins can assign any role, but the concept of "assignable" might
    // still mean roles *below* root for selection UI, or maybe all roles?
    // Let's assume for now root admin sees all roles as assignable.
    // If root admin should only see roles below root, adjust logic.
    const { roles: callerRoles, isRootAdmin: isCallerRootAdmin } = caller;
    console.log(`[getAssignableRoles] Caller: ${caller.email}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
    // --- End Get Caller Details ---


    // --- Calculate Assignable Roles ---
    const assignable: any[] = []; // Array to hold the role objects
    const visited = new Set<string>(); // Keep track of visited roles to prevent infinite loops

    // Recursive function to find all roles downstream from a given role ID
    const findDownstreamRoles = async (roleId: string | null) => { 
        // Base case: If roleId is null/undefined or already visited, stop recursion
        if (!roleId || visited.has(roleId)) return;
        visited.add(roleId);

        // Query for direct children of the current roleId
        const children = await queryRolesByParent(roleId);

        // Add children to the assignable list and recurse
        for (const child of children) {
            // Ensure we don't add duplicates if hierarchy allows multiple paths to same node
            if (!assignable.some(r => r.id === child.id)) {
                 assignable.push(child);
            }
            await findDownstreamRoles(child.id); // Recurse deeper
        }
    };


    if (isCallerRootAdmin) {
         // Root Admin Case: Fetch all roles starting from the effective top-level parent
         // Assumes queryRolesByParent handles finding top-level roles (e.g., parentId='ROOT')
         console.log("[getAssignableRoles] Root admin: Fetching all roles starting from root.");
         await findDownstreamRoles('ROOT'); // Start recursion from the sentinel parent ID
         // Note: This still relies on queryRolesByParent and recursion.
         // A more direct "fetch all roles" might be needed if that's the desired behavior for root.
         // This could involve a Scan on RolesTable or a dedicated GSI if performance is key.
         // For now, using recursion mirrors the non-root logic.

    } else {
        // Non-Root Admin Case: Recurse starting from each role the user is directly assigned
        console.log(`[getAssignableRoles] Non-root admin: Fetching roles downstream from ${JSON.stringify(callerRoles)}`);
        for (const userRoleId of callerRoles) {
            // Find roles directly below the user's assigned roles
            await findDownstreamRoles(userRoleId);
        }
    }
    // --- End Calculate Assignable Roles ---

    console.log(`[getAssignableRoles] Found ${assignable.length} assignable roles.`);
    return respond(200, { roles: assignable });

  } catch (err: any) {
    console.error('[getAssignableRoles] Unhandled error:', err);
    return respond(500, { error: 'Internal server error retrieving assignable roles' });
  }
};
