// src/handlers/users/getUsers.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import { ddb, queryRolesByParent } from '../../lib/dynamo';

// USERS_TABLE defined in serverless.yml under provider.environment
const USERS_TABLE = process.env.USERS_TABLE!;

// Helper for API responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(payload),
});

/**
 * Handler to list users accessible to the caller with pagination
 * Query parameters:
 *  - limit: number of items to return (default: 50)
 *  - lastKey: JSON string of the DynamoDB LastEvaluatedKey to continue scanning
 *
 * Authentication via Cognito custom claims:
 *  - custom:roles: JSON array of role UUIDs
 *  - custom:isRootAdmin: "true" or "false"
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Extract Cognito custom claims
    const claims = (event.requestContext.authorizer as any)?.claims;
    const rolesJson = claims?.['custom:roles'] ?? '[]';
    const isRootAdmin = claims?.['custom:isRootAdmin'] === 'true';
    let callerRoles: string[];
    try {
      callerRoles = JSON.parse(rolesJson);
    } catch {
      return respond(400, { error: 'Invalid roles claim format' });
    }

    // Parse pagination parameters
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

    // If root admin: scan all users with pagination
    if (isRootAdmin) {
      const params: ScanCommandInput = {
        TableName: USERS_TABLE,
        Limit: limit,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      };
      const res = await ddb.send(new ScanCommand(params));
      return respond(200, { users: res.Items, lastKey: res.LastEvaluatedKey });
    }

    // Build full downstream set of role IDs
    const visited = new Set<string>();
    const build = async (roleId: string) => {
      if (visited.has(roleId)) return;
      visited.add(roleId);
      const children = await queryRolesByParent(roleId);
      for (const child of children) {
        await build(child.id);
      }
    };
    for (const rid of callerRoles) await build(rid);

    const accessibleRoles = Array.from(visited);

    // Build DynamoDB Scan filter for roles containment
    const filterParts: string[] = [];
    const eav: Record<string, any> = {};
    accessibleRoles.forEach((rid, idx) => {
      const key = `:r${idx}`;
      filterParts.push(`contains(roles, ${key})`);
      eav[key] = rid;
    });
    const filterExp = filterParts.join(' OR ');

    const params: ScanCommandInput = {
      TableName: USERS_TABLE,
      FilterExpression: filterExp,
      ExpressionAttributeValues: eav,
      Limit: limit,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    };

    const res = await ddb.send(new ScanCommand(params));

    return respond(200, { users: res.Items, lastKey: res.LastEvaluatedKey });
  } catch (err) {
    console.error('getUsers error:', err);
    return respond(500, { error: 'Internal server error' });
  }
};
