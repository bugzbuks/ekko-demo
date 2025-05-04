// src/handlers/roles/getRole.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getRoleById } from '../../lib/dynamo'; // Use the existing helper
import { getCallerDetails } from '../../lib/authUtils'; // To check if authenticated

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
 * Lambda handler to get details for a single role by its ID.
 * Requires the user to be authenticated (via Cognito token or dummy local token).
 *
 * Path Parameter: {id} - The ID of the role to fetch.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // --- Get Target Role ID ---
        const roleId = event.pathParameters?.id;
        if (!roleId) {
            return respond(400, { error: 'Role ID required in path parameter' });
        }
        console.log(`[getRole] Attempting to fetch role: ${roleId}`);

        // --- Authentication Check ---
        // We need to ensure the caller is logged in, even if specific role permissions
        // aren't checked for this simple GET operation.
        const caller = getCallerDetails(event);
        if (!caller.isAuthenticated) {
             console.warn(`[getRole] Unauthenticated attempt to fetch role ${roleId}. Error: ${caller.error}`);
            return respond(401, { error: caller.error || 'Unauthorized' });
        }
        console.log(`[getRole] Caller authenticated: ${caller.email}`);
        // --- End Authentication Check ---

        // --- Fetch Role ---
        console.log(`[getRole] Calling getRoleById helper for ID: ${roleId}`);
        const role = await getRoleById(roleId); // Uses helper from lib/dynamo.ts

        // Check if the role was found
        if (!role) {
            console.log(`[getRole] Role not found for ID: ${roleId}`);
            return respond(404, { error: 'Role not found' });
        }
        console.log(`[getRole] Found role:`, role);
        // --- End Fetch Role ---

        // Return the role data, wrapping it in a 'role' object for consistency
        // with how EditRolePage expects the data from its useQuery hook.
        return respond(200, { role: role });

    } catch (err: any) {
        // Catch any unexpected errors during the process
        console.error('[getRole] Unhandled error:', err);
        return respond(500, { error: 'Internal server error fetching role' });
    }
};
