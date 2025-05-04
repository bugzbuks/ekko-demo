// src/lib/dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'; // Added UpdateCommand, DeleteCommand

// Determine if running locally via serverless-offline
const IS_OFFLINE = process.env.IS_OFFLINE === 'true';
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'; // Use env var or default

console.log(`[DynamoDB Lib] Initializing DynamoDB Client. IS_OFFLINE=${IS_OFFLINE}, Endpoint=${IS_OFFLINE ? DYNAMODB_ENDPOINT : 'AWS Default'}`);

// Conditionally configure the DynamoDB Client
const clientConfig = IS_OFFLINE
  ? {
      // Configuration for DynamoDB Local
      endpoint: DYNAMODB_ENDPOINT,
      region: 'localhost', // Use a placeholder region for local
      credentials: {
        accessKeyId: 'dummyKeyId', // Value doesn't matter for local
        secretAccessKey: 'dummySecretKey', // Value doesn't matter for local
      },
    }
  : {
      // Configuration for deployed environment (uses default SDK credential chain)
      // region: process.env.AWS_REGION // Optionally set region from env
    };

const client = new DynamoDBClient(clientConfig);

// Export the DocumentClient instance for use in handlers
export const ddb = DynamoDBDocumentClient.from(client);

// --- Helper Functions ---

/**
 * Fetches a user item from the Users table by email (primary key).
 * @param email The email of the user to fetch.
 * @returns The user item if found, otherwise undefined.
 */
export async function getUserByEmail(email: string) {
  const tableName = process.env.USERS_TABLE;
  if (!tableName) throw new Error("USERS_TABLE environment variable is not set.");

  const command = new GetCommand({
    TableName: tableName,
    Key: { email },
  });
  console.log(`[getUserByEmail] Fetching user: ${email} from ${tableName}`);
  try {
      const result = await ddb.send(command);
      return result.Item;
  } catch (error) {
       console.error(`[getUserByEmail] Error fetching user ${email}:`, error);
       throw error; // Re-throw after logging
  }
}

/**
 * Fetches a role item from the Roles table by ID (primary key).
 * @param roleId The ID of the role to fetch.
 * @returns The role item if found, otherwise undefined.
 */
export async function getRoleById(roleId: string) {
  const tableName = process.env.ROLES_TABLE;
  if (!tableName) throw new Error("ROLES_TABLE environment variable is not set.");

  const command = new GetCommand({
    TableName: tableName,
    Key: { id: roleId },
  });
   console.log(`[getRoleById] Fetching role: ${roleId} from ${tableName}`);
   try {
       const result = await ddb.send(command);
       return result.Item;
   } catch (error) {
        console.error(`[getRoleById] Error fetching role ${roleId}:`, error);
        throw error; // Re-throw after logging
   }
}


/**
 * Creates or replaces a user item in the Users table.
 * @param user The user object to put into the table.
 */
export async function putUser(user: any) {
   const tableName = process.env.USERS_TABLE;
   if (!tableName) throw new Error("USERS_TABLE environment variable is not set.");

  const command = new PutCommand({
    TableName: tableName,
    Item: user,
  });
   console.log(`[putUser] Putting user: ${user.email} into ${tableName}`);
   try {
        await ddb.send(command);
   } catch (error) {
        console.error(`[putUser] Error putting user ${user.email}:`, error);
        throw error;
   }
}

/**
 * Queries the Roles table's ParentIndex GSI to find direct children of a given parent role ID.
 * @param parentId The ID of the parent role, or null to query for top-level roles (assumes parentId='ROOT').
 * @returns An array of child role items.
 */
export async function queryRolesByParent(parentId: string | null): Promise<any[]> {
  const tableName = process.env.ROLES_TABLE;
  if (!tableName) throw new Error("ROLES_TABLE environment variable is not set.");

  const TOP_LEVEL_PARENT_ID = "ROOT"; // Sentinel value for top-level roles
  const effectiveParentId = parentId === null ? TOP_LEVEL_PARENT_ID : parentId;

  const command = new QueryCommand({
    TableName: tableName,
    IndexName: 'ParentIndex', // Assumes GSI is named 'ParentIndex'
    KeyConditionExpression: 'parentId = :pid',
    ExpressionAttributeValues: {
      ':pid': effectiveParentId,
    },
  });
   console.log(`[queryRolesByParent] Querying roles with parentId: ${effectiveParentId} on index ParentIndex`);
   try {
        const res = await ddb.send(command);
        return res.Items ?? [];
   } catch (error) {
        console.error(`[queryRolesByParent] Error querying roles for parent ${effectiveParentId}:`, error);
        throw error;
   }
}

// Note: Update/Delete commands are often called directly in handlers
// as they might involve more complex parameters (UpdateExpression, ConditionExpression etc.)
// but you could add helpers here if desired.

