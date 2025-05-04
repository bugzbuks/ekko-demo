// src/handlers/roles/getRoles.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb'; // Use Scan for simplicity now
import { ddb } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils';

const ROLES_TABLE = process.env.ROLES_TABLE!;

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
 * Handler to list all roles.
 * Requires the user to be authenticated.
 * WARNING: Uses Scan, inefficient for a very large number of roles.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // --- Authentication Check ---
        const caller = getCallerDetails(event);
        if (!caller.isAuthenticated) {
            return respond(401, { error: caller.error || 'Unauthorized' });
        }
        console.log(`[getRoles] Caller authenticated: ${caller.email}`);
        // --- End Authentication Check ---


        // --- Scan Roles ---
        // WARNING: Inefficient Scan operation. OK for few roles, bad for many.
        // TODO: Implement pagination or a more efficient query if needed.
        console.warn(`[getRoles] WARNING: Using inefficient Scan operation on ${ROLES_TABLE}.`);
        const params = { TableName: ROLES_TABLE };
        let allRoles: any[] = [];
        let lastKey;

        do {
            const command: ScanCommand = new ScanCommand({ ...params, ExclusiveStartKey: lastKey });
            const result = await ddb.send(command);
            allRoles = allRoles.concat(result.Items ?? []);
            lastKey = result.LastEvaluatedKey;
            console.log(`[getRoles] Scanned page. Total roles fetched: ${allRoles.length}. Has more pages: ${!!lastKey}`);
        } while (lastKey);
        // --- End Scan Roles ---

        console.log(`[getRoles] Fetched ${allRoles.length} total roles.`);
        // Return the list of roles
        return respond(200, { roles: allRoles });

    } catch (err: any) {
        console.error('[getRoles] Unhandled error:', err);
        return respond(500, { error: 'Internal server error fetching roles' });
    }
};
