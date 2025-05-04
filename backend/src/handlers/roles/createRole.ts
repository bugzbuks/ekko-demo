// src/handlers/roles/createRole.ts
import { v4 as uuid } from 'uuid';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../lib/dynamo';

const ROLES_TABLE = process.env.ROLES_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const { roleType, name, parentId } = JSON.parse(event.body || '{}');
  if (!roleType || !name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'roleType and name required' }) };
  }

  const id = uuid();  // your new UUID primary key

  const item = {
    id,            // PK
    roleType,      // e.g. "City"
    name,          // e.g. "Cape Town"
    parentId: parentId || null  // parent’s UUID or null
  };

  await ddb.send(new PutCommand({
    TableName: ROLES_TABLE,
    Item: item,
  }));

  return {
    statusCode: 201,
    body: JSON.stringify({ message: 'Role created', role: item }),
  };
};
