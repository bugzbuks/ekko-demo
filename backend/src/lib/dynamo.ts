// src/lib/dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client);

export async function getUserByEmail(email: string) {
  const command = new GetCommand({
    TableName: process.env.USERS_TABLE!,
    Key: { email },
  });
  return ddb.send(command).then(res => res.Item);
}

export async function putUser(user: any) {
  const command = new PutCommand({
    TableName: process.env.USERS_TABLE!,
    Item: user,
  });
  await ddb.send(command);
}

export async function queryRolesByParent(parentId: string) {
  const command = new QueryCommand({
    TableName: process.env.ROLES_TABLE!,
    IndexName: 'ParentIndex',
    KeyConditionExpression: 'parentId = :pid',
    ExpressionAttributeValues: {
      ':pid': parentId,
    },
  });
  const res = await ddb.send(command);
  return res.Items ?? [];
}