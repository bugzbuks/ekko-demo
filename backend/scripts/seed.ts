// Import necessary modules from AWS SDK v3
import {
  DynamoDBClient,
  CreateTableCommand,
  waitUntilTableExists, // Utility to wait for table readiness
  ListTablesCommand, // To list tables
  ResourceInUseException,
  AttributeDefinition,
  KeySchemaElement,
  ScalarAttributeType,
  KeyType,
  BillingMode,
} from "@aws-sdk/client-dynamodb";
// Import DocumentClient for easier item handling (Scan)
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";


// --- Configuration ---
const DYNAMODB_ENDPOINT = "http://localhost:8000";
const TABLE_NAME = "dev-users";
const USER_EMAIL_TO_ADD = "root@system.app";

// --- User Data ---
const rootUser = {
  email: USER_EMAIL_TO_ADD,
  name: "Root Admin",
  roles: [], // DocumentClient handles JS types directly
  isRootAdmin: true,
};

// --- Initialize Base DynamoDB Client ---
const baseClient = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  // No region specified
  credentials: {
    accessKeyId: "dummyAccessKeyId",
    secretAccessKey: "dummySecretAccessKey",
  },
});

// --- Initialize Document Client ---
// Wrap the base client for easier item manipulation
const docClient = DynamoDBDocumentClient.from(baseClient);


// --- Main Script Logic ---
async function setupDynamoDB() {
  let tableExists = false;

  // --- Step 1: Ensure Table Exists ---
  console.log(`Checking if table '${TABLE_NAME}' exists...`);
  try {
    // Use waitUntilTableExists for a robust check and wait
    await waitUntilTableExists({ client: baseClient, maxWaitTime: 30 }, { TableName: TABLE_NAME });
    console.log(`Table '${TABLE_NAME}' exists and is active.`);
    tableExists = true;
  } catch (error: any) {
    // waitUntilTableExists throws an error if the table doesn't exist after waiting
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('timed out')) {
      console.log(`Table '${TABLE_NAME}' does not exist. Attempting creation...`);
      tableExists = false;
    } else {
        console.error("Error checking table status:", error);
        process.exit(1); // Exit on unexpected errors during check
    }
  }

  // Create table if it didn't exist
  if (!tableExists) {
    const tableParams = {
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: "email", AttributeType: "S" as ScalarAttributeType },
      ],
      KeySchema: [
        { AttributeName: "email", KeyType: "HASH" as KeyType },
      ],
      BillingMode: "PAY_PER_REQUEST" as BillingMode,
    };
    try {
      const createTableCommand = new CreateTableCommand(tableParams);
      await baseClient.send(createTableCommand); // Use baseClient for table operations
      console.log(`Table '${TABLE_NAME}' creation initiated. Waiting for it to become active...`);
      // Wait until the newly created table is active
      await waitUntilTableExists({ client: baseClient, maxWaitTime: 60 }, { TableName: TABLE_NAME });
      console.log(`Table '${TABLE_NAME}' created and active.`);
      tableExists = true; // Mark as existing now
    } catch (error) {
       // Handle potential race condition if another process created it meanwhile
       if (error instanceof ResourceInUseException) {
         console.log(`Table '${TABLE_NAME}' was created by another process. Proceeding.`);
         tableExists = true;
       } else {
         console.error("Error creating table:", error);
         process.exit(1);
       }
    }
  }

  // --- Step 2: Add/Update User (only if table exists) ---
  if (tableExists) {
      console.log(`\nAttempting to add/update user '${USER_EMAIL_TO_ADD}'...`);
      // Use PutCommand with DocumentClient for simpler item syntax
      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: rootUser, // Use the JS object directly
      });

      try {
        console.log(`Sending PutCommand for ${USER_EMAIL_TO_ADD}...`);
        await docClient.send(putCommand); // Use docClient here
        console.log(`User '${USER_EMAIL_TO_ADD}' ensured in table.`);
      } catch (error: any) {
        console.error(`Error putting item for user '${USER_EMAIL_TO_ADD}':`, error);
        // Optionally exit if user add fails critically
        // process.exit(1);
      }
  } else {
      console.error("Table does not exist after creation attempt. Cannot add user.");
      process.exit(1);
  }

  // --- Step 3: Verification Reads ---
  console.log("\n--- Verification Step ---");

  // 3a: List Tables via SDK
  try {
    console.log("Listing tables via SDK...");
    const listCommand = new ListTablesCommand({});
    const listResponse = await baseClient.send(listCommand); // Use baseClient
    console.log("SDK ListTables Response:", listResponse.TableNames || []);
  } catch (error) {
    console.error("Error listing tables via SDK during verification:", error);
  }

  // 3b: Scan the specific table via SDK (if it was supposed to exist)
  if (tableExists) {
      try {
          console.log(`Scanning table '${TABLE_NAME}' via SDK...`);
          const scanCommand = new ScanCommand({
              TableName: TABLE_NAME,
          });
          const scanResponse = await docClient.send(scanCommand); // Use docClient
          console.log(`SDK Scan Response for '${TABLE_NAME}':`);
          console.log(`  Count: ${scanResponse.Count}`);
          console.log(`  Items:`, JSON.stringify(scanResponse.Items, null, 2)); // Pretty print items
      } catch (error) {
          console.error(`Error scanning table '${TABLE_NAME}' via SDK during verification:`, error);
          // This might throw ResourceNotFoundException if the table *still* isn't found by the SDK
      }
  }


  console.log("\nDynamoDB setup script finished.");
}

// --- Execute the script ---
setupDynamoDB().catch((error) => {
  console.error("Unhandled error during script execution:", error);
  process.exit(1);
});
