// src/handlers/summary.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, ScanCommandOutput } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'af-south-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const USERS_TABLE = process.env.USERS_TABLE!;
const ROLES_TABLE = process.env.ROLES_TABLE!;
const PARENT_INDEX = 'ParentIndex';

export const handler: APIGatewayProxyHandler = async (event) => {
  // Extract custom claims injected by PreToken Lambda
  const claims = (event.requestContext.authorizer as any).claims as Record<string,string>;
  const isRootAdmin = claims['custom:isRootAdmin'] === 'true';
  const userRoles: string[] = JSON.parse(claims['custom:roles'] || '[]');

  // Helper: count all items in a table
  async function countAll(table: string) {
    let total = 0;
    let lastKey;
    do {
      const resp: ScanCommandOutput = await ddb.send(new ScanCommand({
        TableName: table,
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      }));
      total += resp.Count ?? 0;
      lastKey = resp.LastEvaluatedKey;
    } while (lastKey);
    return total;
  }

  // Helper: recursively find all descendant role IDs
  async function getDescendants(roleIds: string[]) {
    const visited = new Set<string>();
    const stack = [...roleIds];
    while (stack.length) {
      const parentId = stack.pop()!;
      if (visited.has(parentId)) continue;
      visited.add(parentId);

      const resp = await ddb.send(new QueryCommand({
        TableName: ROLES_TABLE,
        IndexName: PARENT_INDEX,
        KeyConditionExpression: 'parentId = :p',
        ExpressionAttributeValues: { ':p': parentId },
        ProjectionExpression: 'id',
      }));

      for (const item of resp.Items ?? []) {
        stack.push(item.id as string);
      }
    }
    // Remove the original roles from descendants
    userRoles.forEach(r => visited.delete(r));
    return Array.from(visited);
  }

  // Helper: count users whose `roles` array contains any of these IDs
  async function countUsersBy(roleIds: string[]) {
    if (roleIds.length === 0) return 0;
    // build FilterExpression: contains(roles,:r0) OR contains(roles,:r1) …
    const exprVals: Record<string, any> = {};
    const filters: string[] = roleIds.map((r, i) => {
      exprVals[`:r${i}`] = r;
      return `contains(roles, :r${i})`;
    });
    let total = 0;
    let lastKey;
    do {
      const resp: ScanCommandOutput = await ddb.send(new ScanCommand({
        TableName: USERS_TABLE,
        Select: 'COUNT',
        FilterExpression: filters.join(' OR '),
        ExpressionAttributeValues: exprVals,
        ExclusiveStartKey: lastKey,
      }));
      total += resp.Count ?? 0;
      lastKey = resp.LastEvaluatedKey;
    } while (lastKey);
    return total;
  }

  // Compute metrics
  let roleCount: number;
  let userCount: number;

  if (isRootAdmin) {
    roleCount = await countAll(ROLES_TABLE);
    userCount = await countAll(USERS_TABLE);
  } else {
    const descendants = await getDescendants(userRoles);
    roleCount = descendants.length;
    // include the user’s own roles too
    userCount = await countUsersBy([...userRoles, ...descendants]);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ roleCount, userCount }),
  };
};
