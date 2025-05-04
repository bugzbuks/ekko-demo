// src/handlers/users/getUserDetails.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getUserByEmail } from '../../lib/dynamo'; // Import the existing helper

// Ensure required environment variables are set
const USERS_TABLE = process.env.USERS_TABLE;
if (!USERS_TABLE) {
    throw new Error('Missing USERS_TABLE env var');
}

// Helper function for creating API Gateway responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
    statusCode,
    // Allow requests from any origin for this local helper endpoint
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true, // Usually needed with Allow-Origin *
    },
    body: JSON.stringify(payload),
});

/**
 * Lambda handler to get basic user details (name, roles, root status) by email.
 * INTENDED FOR LOCAL DEVELOPMENT LOGIN SIMULATION ONLY.
 * Does not require authentication.
 *
 * Path Parameter: {email} - The URL-encoded email of the user to fetch details for.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const targetEmail = event.pathParameters?.email;
        if (!targetEmail) {
            return respond(400, { error: 'User email required in path parameter' });
        }
        const decodedEmail = decodeURIComponent(targetEmail);
        console.log(`[getUserDetails] Fetching details for: ${decodedEmail}`);

        const user = await getUserByEmail(decodedEmail);

        if (!user) {
            console.log(`[getUserDetails] User not found: ${decodedEmail}`);
            // Return a default structure indicating user not found
            return respond(200, { // Return 200 OK but with data indicating not found
                email: decodedEmail,
                name: '', // Include name field even if empty
                roles: [],
                isRootAdmin: false,
                found: false, // Add a flag
            });
        }

        // User found, return their details including the name
        console.log(`[getUserDetails] Found user: ${decodedEmail}, Name: ${user.name}, Roles: ${JSON.stringify(user.roles)}, IsRoot: ${user.isRootAdmin}`);
        return respond(200, {
            email: user.email,
            name: user.name || '', // *** ADDED user.name HERE *** (default to empty string if missing)
            roles: user.roles || [], // Ensure roles is always an array
            isRootAdmin: user.isRootAdmin || false, // Ensure boolean
            found: true,
        });

    } catch (err: any) {
        // Handle any unexpected errors during the process
        console.error('[getUserDetails] Error:', err);
        return respond(500, { error: 'Internal server error fetching user details' });
    }
};
