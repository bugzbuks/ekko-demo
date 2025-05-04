// src/handlers/users/createUser.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../lib/dynamo';
import { queryRolesByParent } from '../../lib/dynamo';

// Tables configured in serverless.yml
const USERS_TABLE = process.env.USERS_TABLE!;

// Helper for API responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(payload),
});

/**
 * Handler to pre-create or update a user record (approved users)
 * Expects JSON body: { email: string, name: string, roles: string[] }
 * Only allows assignment of roles downstream of caller's roles (unless root admin)
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

    // Parse request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, { error: 'Invalid JSON' });
    }
    const { email, name, roles } = body;
    if (!email || !name || !Array.isArray(roles) || roles.length === 0) {
      return respond(400, { error: 'email, name, and at least one role are required' });
    }

    // Determine allowed role IDs for this caller
    const allowed = new Set<string>();
    if (!isRootAdmin) {
      const visited = new Set<string>();
      const recurse = async (roleId: string) => {
        if (visited.has(roleId)) return;
        visited.add(roleId);
        const children = await queryRolesByParent(roleId);
        for (const child of children) {
          allowed.add(child.id);
          await recurse(child.id);
        }
      };
      // Build allowed set from each of the caller's roles
      for (const rid of callerRoles) {
        await recurse(rid);
      }
      // Validate requested roles
      for (const rid of roles) {
        if (!allowed.has(rid)) {
          return respond(403, { error: 'Cannot assign role outside your hierarchy' });
        }
      }
    }

    // Build user item
    const userItem = { email, name, roles, isRootAdmin: false };

    // Save (upsert) into DynamoDB
    await ddb.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: userItem,
    }));

    return respond(201, { message: 'User created/updated', user: userItem });
  } catch (err) {
    console.error('createUser error:', err);
    return respond(500, { error: 'Internal server error' });
  }
};
