// src/handlers/users/getUsers.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import { ddb, queryRolesByParent } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils'; // Import the helper
// Note: jwt-decode is only needed if decoding token *within* this handler,
// which is now handled by getCallerDetails. Keep if needed elsewhere.
// import { jwtDecode } from 'jwt-decode';

// USERS_TABLE defined in serverless.yml under provider.environment
const USERS_TABLE = process.env.USERS_TABLE!;
const IS_OFFLINE = process.env.IS_OFFLINE === 'true'; // Check if running locally

// Helper for API responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        'Access-Control-Allow-Origin': '*', // Adjust for specific origins in production
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(payload),
});

/**
 * Handler to list users accessible to the caller with pagination.
 * Handles both real Cognito JWTs (production) and dummy JWTs (local).
 *
 * Query parameters:
 * - limit: number of items to return (default: 50)
 * - lastKey: JSON string of the DynamoDB LastEvaluatedKey to continue scanning
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // --- Determine Caller Identity and Roles ---
    const caller = getCallerDetails(event);
    if (!caller.isAuthenticated) {
        // If authentication details couldn't be determined, deny access.
        return respond(401, { error: caller.error || 'Unauthorized' });
    }
    const { roles: callerRoles, isRootAdmin: isCallerRootAdmin, email: callerEmail } = caller;
    console.log(`[getUsers] Caller: ${callerEmail}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
    // --- End Determine Caller Identity ---


    // --- Pagination Parameters ---
    const qs = event.queryStringParameters || {};
    const limit = qs.limit ? parseInt(qs.limit, 10) : 50;
    let exclusiveStartKey: Record<string, any> | undefined;
    if (qs.lastKey) {
      try {
        exclusiveStartKey = JSON.parse(qs.lastKey);
      } catch {
        return respond(400, { error: 'Invalid lastKey format' });
      }
    }
    // --- End Pagination Parameters ---


    // --- Build Query/Scan Parameters ---
    let params: ScanCommandInput; // Use ScanCommandInput type
    let executeScan = true; // Flag to determine if scan should run

    if (isCallerRootAdmin) {
      // Root admin: Scan all users with pagination
       console.log("[getUsers] Root admin detected. Scanning all users.");
      params = {
        TableName: USERS_TABLE,
        Limit: limit,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      };
    } else {
      // Non-root admin: Find accessible roles and build filter
      console.log("[getUsers] Non-root admin. Calculating accessible roles.");
      // Build full downstream set of role IDs the caller can access
      const accessibleRoles = new Set<string>();
      const visited = new Set<string>();

      const buildAccessible = async (roleId: string | null) => { // Allow null for top-level roles if applicable
          // Skip if roleId is falsy (null, undefined, empty string) or already visited
          if (!roleId || visited.has(roleId)) return;
          visited.add(roleId);
          accessibleRoles.add(roleId); // User can access users with their *own* roles too
          const children = await queryRolesByParent(roleId);
          for (const child of children) {
              await buildAccessible(child.id); // Recurse
          }
      };
      // Start building from each role the user is directly assigned
      for (const rid of callerRoles) {
          await buildAccessible(rid);
      }

      const accessibleRoleIds = Array.from(accessibleRoles);
      console.log(`[getUsers] Accessible Role IDs: ${JSON.stringify(accessibleRoleIds)}`);

      // *** FIX: Check if accessibleRoleIds is empty ***
      if (accessibleRoleIds.length === 0) {
          // If the user has no roles or their roles grant access to no downstream roles,
          // they can see no users (based on role filtering). Return empty list immediately.
          console.log("[getUsers] No accessible roles found for user. Returning empty list.");
          executeScan = false; // Set flag to skip scan
          // We'll return the empty list after the 'if (executeScan)' block
      } else {
          // --- IMPORTANT: SCALABILITY TODO ---
          // The following Scan + Filter is INEFFICIENT for large tables.
          // TODO: Replace this with an efficient Query strategy (e.g., path denormalization + GSI).
          console.warn("[getUsers] WARNING: Using inefficient Scan + Filter operation. Needs optimization for scale.");
          // --- END SCALABILITY TODO ---

          // Build DynamoDB Scan filter for roles containment
          const filterParts: string[] = [];
          const eav: Record<string, any> = {}; // ExpressionAttributeValues
          accessibleRoleIds.forEach((rid, idx) => {
            const key = `:r${idx}`;
            filterParts.push(`contains(roles, ${key})`); // Check if 'roles' list contains the role ID
            eav[key] = rid;
          });
          const filterExp = filterParts.join(' OR ');

          params = {
            TableName: USERS_TABLE,
            FilterExpression: filterExp,
            ExpressionAttributeValues: eav, // eav will not be empty here because accessibleRoleIds is not empty
            Limit: limit,
            ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
          };
      }
    }
    // --- End Build Query/Scan Parameters ---


    // --- Execute Scan (if applicable) ---
    let items: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    if (executeScan) {
        console.log("[getUsers] Executing DynamoDB Scan command with params:", JSON.stringify(params!));
        const command = new ScanCommand(params!); // params will be defined if executeScan is true
        const res = await ddb.send(command);
        items = res.Items ?? [];
        lastEvaluatedKey = res.LastEvaluatedKey;
        console.log(`[getUsers] Scan successful. Count: ${res.Count}, ScannedCount: ${res.ScannedCount}`);
    }
    // --- End Execute Scan ---

    // Return the results (either from scan or the empty list if scan was skipped)
    return respond(200, { users: items, lastKey: lastEvaluatedKey });

  } catch (err: any) {
    console.error('[getUsers] Unhandled error:', err);
    return respond(500, { error: 'Internal server error' });
  }
};
