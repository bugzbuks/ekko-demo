// scripts/seed.ts
import {
  DynamoDBClient,
  CreateTableCommand,
  waitUntilTableExists,
  ListTablesCommand,
  ResourceInUseException,
  AttributeDefinition,
  KeySchemaElement,
  ScalarAttributeType,
  KeyType,
  BillingMode,
  GlobalSecondaryIndex, // Import GSI type
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

// --- Configuration ---
const DYNAMODB_ENDPOINT = "http://localhost:8000";
const USERS_TABLE_NAME = "dev-users";
const ROLES_TABLE_NAME = "dev-roles";
const ROLES_PARENT_INDEX_NAME = 'ParentIndex'; // Match serverless.yml

const ROOT_USER_EMAIL = "root@system.app";
const ROOT_ROLE_ID = "SYSTEM_ROOT"; 
const TOP_LEVEL_PARENT_ID = "ROOT"; 

// --- Root User Data ---
const rootUser = {
  email: ROOT_USER_EMAIL,
  name: "Root Admin",
  roles: [ROOT_ROLE_ID], // Assign the ROOT_ROLE_ID
  isRootAdmin: true, // Explicitly mark as root admin
};

// --- Root Role Data ---
const rootRole = {
    id: ROOT_ROLE_ID,
    roleType: "System",
    name: "System Root Access",
    parentId: TOP_LEVEL_PARENT_ID 
};

// --- Initialize Base DynamoDB Client ---
const baseClient = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: "dummyAccessKeyId",
    secretAccessKey: "dummySecretAccessKey",
  },
});
const docClient = DynamoDBDocumentClient.from(baseClient);

// --- Helper Function ---
async function ensureTableExists(tableName: string, params: any) {
    let tableExists = false;
    console.log(`Checking if table '${tableName}' exists...`);
    try {
        await waitUntilTableExists({ client: baseClient, maxWaitTime: 30 }, { TableName: tableName });
        console.log(`Table '${tableName}' exists and is active.`);
        tableExists = true;
    } catch (error: any) {
        if (error.name === 'ResourceNotFoundException' || error.message?.includes('timed out')) {
            console.log(`Table '${tableName}' does not exist. Attempting creation...`);
            tableExists = false;
        } else {
            console.error(`Error checking table status for ${tableName}:`, error);
            throw error; // Rethrow unexpected errors
        }
    }

    if (!tableExists) {
        try {
            const createTableCommand = new CreateTableCommand(params);
            await baseClient.send(createTableCommand);
            console.log(`Table '${tableName}' creation initiated. Waiting for it to become active...`);
            await waitUntilTableExists({ client: baseClient, maxWaitTime: 60 }, { TableName: tableName });
            console.log(`Table '${tableName}' created and active.`);
            tableExists = true;
        } catch (error) {
            if (error instanceof ResourceInUseException) {
                console.log(`Table '${tableName}' was created by another process. Proceeding.`);
                tableExists = true;
            } else {
                console.error(`Error creating table ${tableName}:`, error);
                throw error; // Rethrow unexpected errors
            }
        }
    }
    return tableExists;
}


// --- Main Script Logic ---
async function setupDynamoDB() {
  // --- Step 1: Ensure Users Table Exists ---
  const usersTableParams = {
      TableName: USERS_TABLE_NAME,
      AttributeDefinitions: [
          { AttributeName: "email", AttributeType: "S" as ScalarAttributeType },
      ],
      KeySchema: [
          { AttributeName: "email", KeyType: "HASH" as KeyType },
      ],
      BillingMode: "PAY_PER_REQUEST" as BillingMode,
  };
  const usersTableOk = await ensureTableExists(USERS_TABLE_NAME, usersTableParams);
  if (!usersTableOk) {
      console.error(`Failed to ensure ${USERS_TABLE_NAME} exists. Exiting.`);
      process.exit(1);
  }


  // --- Step 2: Ensure Roles Table Exists ---
  const rolesTableParams = {
      TableName: ROLES_TABLE_NAME,
      AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" as ScalarAttributeType },
          { AttributeName: "parentId", AttributeType: "S" as ScalarAttributeType }, // Must define GSI keys
      ],
      KeySchema: [
          { AttributeName: "id", KeyType: "HASH" as KeyType },
      ],
      GlobalSecondaryIndexes: [ // Define the GSI to match serverless.yml
          {
              IndexName: ROLES_PARENT_INDEX_NAME,
              KeySchema: [
                  { AttributeName: "parentId", KeyType: "HASH" as KeyType },
              ],
              Projection: { // Match projection in serverless.yml
                  ProjectionType: 'ALL', // Or KEYS_ONLY / INCLUDE
              },
              // BillingMode for GSIs is tied to the table's BillingMode if PAY_PER_REQUEST
              // Or specify ProvisionedThroughput if table uses that
          } as GlobalSecondaryIndex, // Cast to assert type
      ],
      BillingMode: "PAY_PER_REQUEST" as BillingMode,
  };
   const rolesTableOk = await ensureTableExists(ROLES_TABLE_NAME, rolesTableParams);
   if (!rolesTableOk) {
       console.error(`Failed to ensure ${ROLES_TABLE_NAME} exists. Exiting.`);
       process.exit(1);
   }

  // --- Step 3: Add/Update Root Role ---
  console.log(`\nAttempting to add/update root role '${ROOT_ROLE_ID}'...`);
  try {
      const putRoleCommand = new PutCommand({
          TableName: ROLES_TABLE_NAME,
          Item: rootRole, // Use the defined root role object
          // No condition expression - we always want this role present/updated
      });
      await docClient.send(putRoleCommand);
      console.log(`Root role '${ROOT_ROLE_ID}' ensured in table.`);
  } catch (error: any) {
      console.error(`Error putting root role '${ROOT_ROLE_ID}':`, error);
      process.exit(1); // Exit if we can't ensure the root role
  }


  // --- Step 4: Add/Update Root User ---
  console.log(`\nAttempting to add/update root user '${ROOT_USER_EMAIL}'...`);
  try {
      const putUserCommand = new PutCommand({
          TableName: USERS_TABLE_NAME,
          Item: rootUser, // Use the root user object with the assigned root role ID
          // No condition expression - we always want this user present/updated
      });
      await docClient.send(putUserCommand);
      console.log(`Root user '${ROOT_USER_EMAIL}' ensured in table.`);
  } catch (error: any) {
      console.error(`Error putting root user '${ROOT_USER_EMAIL}':`, error);
      process.exit(1); // Exit if we can't ensure the root user
  }


  // --- Step 5: Verification Reads (Optional but Recommended) ---
  console.log("\n--- Verification Step ---");
  try {
      console.log("Listing tables via SDK...");
      const listResponse = await baseClient.send(new ListTablesCommand({}));
      console.log("SDK ListTables Response:", listResponse.TableNames || []);

      console.log(`Scanning table '${ROLES_TABLE_NAME}' via SDK...`);
      const scanRolesResponse = await docClient.send(new ScanCommand({ TableName: ROLES_TABLE_NAME, Limit: 10 }));
      console.log(`SDK Scan Response for '${ROLES_TABLE_NAME}' (Limit 10):`);
      console.log(`  Count: ${scanRolesResponse.Count}`);
      console.log(`  Items:`, JSON.stringify(scanRolesResponse.Items, null, 2));

      console.log(`Scanning table '${USERS_TABLE_NAME}' via SDK...`);
      const scanUsersResponse = await docClient.send(new ScanCommand({ TableName: USERS_TABLE_NAME, Limit: 10 }));
      console.log(`SDK Scan Response for '${USERS_TABLE_NAME}' (Limit 10):`);
      console.log(`  Count: ${scanUsersResponse.Count}`);
      console.log(`  Items:`, JSON.stringify(scanUsersResponse.Items, null, 2));

  } catch (error) {
      console.error("Error during verification:", error);
  }

  console.log("\nDynamoDB setup script finished.");
}

// --- Execute the script ---
setupDynamoDB().catch((error) => {
  console.error("Unhandled error during script execution:", error);
  process.exit(1);
});
