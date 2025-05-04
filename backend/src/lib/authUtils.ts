// src/lib/authUtils.ts
import { APIGatewayProxyEvent } from 'aws-lambda';
import { jwtDecode } from 'jwt-decode';

const IS_OFFLINE = process.env.IS_OFFLINE === 'true'; // Check if running locally

// Define expected structure of the dummy token payload (or real claims)
interface CallerClaims {
    email?: string; // Optional, might be in 'sub' depending on config
    sub?: string; // Subject, often used as user ID
    'custom:roles'?: string; // JSON string array
    'custom:isRootAdmin'?: 'true' | 'false';
    [key: string]: any; // Allow other properties
}

export interface CallerDetails {
    email: string | undefined;
    roles: string[];
    isRootAdmin: boolean;
    isAuthenticated: boolean; // Flag to indicate if we successfully got details
    error?: string; // Optional error message
}

/**
 * Extracts caller details (email, roles, root status) from either the
 * API Gateway authorizer context (deployed) or a dummy JWT (local).
 *
 * @param event The APIGatewayProxyEvent object.
 * @returns CallerDetails object.
 */
export function getCallerDetails(event: APIGatewayProxyEvent): CallerDetails {
    let email: string | undefined = undefined;
    let roles: string[] = [];
    let isRootAdmin = false;
    let isAuthenticated = false;
    let error: string | undefined = undefined;

    if (IS_OFFLINE) {
        // --- LOCAL MODE ---
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn("[AuthUtils - Local] Missing or invalid Authorization header.");
            error = 'Missing or invalid Authorization header';
            // Return minimal permissions if no token locally
        } else {
            const dummyToken = authHeader.split(' ')[1];
            try {
                const decoded = jwtDecode<CallerClaims>(dummyToken);
                email = decoded.email || decoded.sub; // Prefer email, fallback to sub
                isRootAdmin = decoded['custom:isRootAdmin'] === 'true';
                // Safely parse roles
                try {
                    const rolesClaim = decoded['custom:roles'];
                    if (rolesClaim) {
                        const parsedRoles = JSON.parse(rolesClaim);
                        if (Array.isArray(parsedRoles)) {
                            roles = parsedRoles.filter(r => typeof r === 'string'); // Ensure only strings
                        } else {
                             console.warn("[AuthUtils - Local] 'custom:roles' claim is not a valid JSON array:", rolesClaim);
                        }
                    }
                } catch (parseError) {
                    console.error("[AuthUtils - Local] Error parsing custom:roles from dummy token:", parseError);
                    // roles remains empty array
                }
                isAuthenticated = true; // Successfully decoded token
                console.log(`[AuthUtils - Local] Decoded User: ${email}, IsRoot: ${isRootAdmin}, Roles: ${JSON.stringify(roles)}`);
            } catch (decodeError) {
                console.error("[AuthUtils - Local] Error decoding dummy token:", decodeError);
                error = 'Invalid dummy token format';
                // Return minimal permissions if token is invalid
            }
        }
    } else {
        // --- DEPLOYED MODE ---
        const claims = (event.requestContext.authorizer as any)?.claims as CallerClaims | undefined;
        if (!claims) {
            console.error("[AuthUtils - Prod] Claims missing from authorizer context!");
            error = 'Unauthorized: Missing claims';
            // Return minimal permissions if claims somehow missing
        } else {
            email = claims.email || claims.sub;
            isRootAdmin = claims['custom:isRootAdmin'] === 'true';
            // Safely parse roles
            try {
                 const rolesClaim = claims['custom:roles'];
                 if (rolesClaim) {
                     const parsedRoles = JSON.parse(rolesClaim);
                     if (Array.isArray(parsedRoles)) {
                         roles = parsedRoles.filter(r => typeof r === 'string'); // Ensure only strings
                     } else {
                          console.warn("[AuthUtils - Prod] 'custom:roles' claim is not a valid JSON array:", rolesClaim);
                     }
                 }
            } catch (parseError) {
                console.error("[AuthUtils - Prod] Error parsing custom:roles claim:", parseError);
                // roles remains empty array
            }
            isAuthenticated = true; // Claims were present
            console.log(`[AuthUtils - Prod] Claims User: ${email}, IsRoot: ${isRootAdmin}, Roles: ${JSON.stringify(roles)}`);
        }
    }

    return { email, roles, isRootAdmin, isAuthenticated, error };
}
