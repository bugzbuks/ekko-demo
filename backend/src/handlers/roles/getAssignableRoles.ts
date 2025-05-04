// src/handlers/roles/getAssignableRoles.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { queryRolesByParent } from '../../lib/dynamo';

// Handler for retrieving all descendant roles assignable by the current user
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Extract custom roles (UUIDs) from Cognito token claims
    const claims = (event.requestContext.authorizer as any)?.claims;
    const rolesJson = claims?.['custom:roles'] ?? '[]';
    let userRoleIds: string[];
    try {
      userRoleIds = JSON.parse(rolesJson);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid roles claim format' }),
      };
    }

    const visited = new Set<string>();
    const assignable: any[] = [];

    const recurse = async (roleId: string) => {
      if (visited.has(roleId)) return;
      visited.add(roleId);
      const children = await queryRolesByParent(roleId);
      for (const child of children) {
        assignable.push(child);
        await recurse(child.id);
      }
    };

    // Recurse from each role the user has
    for (const roleId of userRoleIds) {
      await recurse(roleId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ roles: assignable }),
    };
  } catch (err) {
    console.error('getAssignableRoles error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
