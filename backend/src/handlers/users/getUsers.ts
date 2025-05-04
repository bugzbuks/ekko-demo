// src/handlers/users/getUsers.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import { ddb, queryRolesByParent } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils'; // Import the helper

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
 * Handler to list users accessible to the caller with pagination,
 * EXCLUDING the caller themselves.
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
    if (!caller.isAuthenticated || !caller.email) { // Ensure we have caller email for filtering
        console.warn("[getUsers] Could not determine authenticated caller's email.");
        return respond(401, { error: caller.error || 'Unauthorized or missing email claim' });
    }
    const { roles: callerRoles, isRootAdmin: isCallerRootAdmin, email: callerEmail } = caller;
    console.log(`[getUsers] Caller: ${callerEmail}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
    // --- End Determine Caller Identity ---


    // --- Pagination Parameters ---
    const qs = event.queryStringParameters || {};
    // Adjust limit slightly higher internally to account for filtering self out later
    // This helps ensure a page isn't unexpectedly small if the caller is on it.
    const requestedLimit = qs.limit ? parseInt(qs.limit, 10) : 50;
    const internalLimit = requestedLimit + 1; // Fetch one extra item potentially
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
        Limit: internalLimit, // Use internal limit
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      };
    } else {
      // Non-root admin: Find accessible roles and build filter
      console.log("[getUsers] Non-root admin. Calculating accessible roles.");
      const accessibleRoles = new Set<string>();
      const visited = new Set<string>();

      const buildAccessible = async (roleId: string | null) => {
          if (!roleId || visited.has(roleId)) return;
          visited.add(roleId);
          accessibleRoles.add(roleId);
          const children = await queryRolesByParent(roleId);
          for (const child of children) {
              await buildAccessible(child.id);
          }
      };
      for (const rid of callerRoles) {
          await buildAccessible(rid);
      }

      const accessibleRoleIds = Array.from(accessibleRoles);
      console.log(`[getUsers] Accessible Role IDs: ${JSON.stringify(accessibleRoleIds)}`);

      if (accessibleRoleIds.length === 0) {
          console.log("[getUsers] No accessible roles found for user. Returning empty list.");
          executeScan = false;
      } else {
          console.warn("[getUsers] WARNING: Using inefficient Scan + Filter operation. Needs optimization for scale.");

          // Build DynamoDB Scan filter for roles containment
          const filterParts: string[] = [];
          const eav: Record<string, any> = {}; // ExpressionAttributeValues
          const ean: Record<string, string> = { '#rolesAttr': 'roles' }; // Placeholder for reserved keyword

          accessibleRoleIds.forEach((rid, idx) => {
            const key = `:r${idx}`;
            filterParts.push(`contains(#rolesAttr, ${key})`);
            eav[key] = rid;
          });
          const filterExp = filterParts.join(' OR ');

          params = {
            TableName: USERS_TABLE,
            FilterExpression: filterExp,
            ExpressionAttributeValues: eav,
            ExpressionAttributeNames: ean,
            Limit: internalLimit, // Use internal limit
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
        const command = new ScanCommand(params!);
        const res = await ddb.send(command);
        // *** FIX: Filter out the current caller from the results ***
        items = (res.Items ?? []).filter(user => user.email !== callerEmail);
        lastEvaluatedKey = res.LastEvaluatedKey;
        console.log(`[getUsers] Scan successful. Fetched: ${res.Items?.length ?? 0}, Filtered (excluding self): ${items.length}, ScannedCount: ${res.ScannedCount}`);

        // Adjust pagination if we filtered out the caller and now have fewer items than requested limit
        // Note: This simple adjustment might still result in slightly uneven page sizes if the caller
        // appears frequently in results near page boundaries. More complex pagination logic
        // could re-fetch if needed, but this is often sufficient.
        if (items.length > requestedLimit) {
            // If we fetched extra and still have more than requested after filtering,
            // keep the lastEvaluatedKey, but only return the requested number of items.
            items = items.slice(0, requestedLimit);
             console.log(`[getUsers] Sliced results to requested limit: ${requestedLimit}`);
        } else if (items.length < requestedLimit && lastEvaluatedKey) {
             // If we fetched extra, filtered out the caller, and now have *less* than requested,
             // but there *was* a lastEvaluatedKey from the DB, we should still return that key
             // so the frontend knows there *might* be more data, even if this page is short.
             console.log(`[getUsers] Page is short after filtering self, but retaining lastEvaluatedKey.`);
        } else if (items.length === requestedLimit && lastEvaluatedKey) {
             // If we fetched extra, filtered out the caller, and now have *exactly* the requested limit,
             // we still keep the lastEvaluatedKey.
             console.log(`[getUsers] Page matches limit after filtering self, retaining lastEvaluatedKey.`);
        } else {
            // If the original scan didn't return a lastEvaluatedKey, or if we didn't fetch extra,
            // then the lastEvaluatedKey remains as it was (likely undefined).
             lastEvaluatedKey = res.LastEvaluatedKey; // Ensure it's correctly set from the response
        }


    } else {
        // If scan was skipped (no accessible roles), items is already [] and lastKey is undefined
        items = [];
        lastEvaluatedKey = undefined;
    }
    // --- End Execute Scan ---

    return respond(200, { users: items, lastKey: lastEvaluatedKey });

  } catch (err: any) {
    console.error('[getUsers] Unhandled error:', err);
    if (err.name === 'ValidationException') {
         return respond(400, { error: `Invalid request: ${err.message}` });
     }
    return respond(500, { error: 'Internal server error' });
  }
};
