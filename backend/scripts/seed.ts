// scripts/seed.ts
/**
 * Minimal “root admin” seeder for a local DynamoDB-Local running on localhost:8000.
 * Ignores AWS and points directly at your Docker container.
 */

import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// NOTE: we hard-code endpoint + dummy creds here so we never drift back to AWS.
const ddbClient = new DynamoDBClient({
  region: 'us-east-1',               // any valid AWS region string
  endpoint: 'http://localhost:8000', // <— ensure this matches your Docker port
  credentials: {
    accessKeyId: 'DUMMY',            // DynamoDB-Local doesn't validate these
    secretAccessKey: 'DUMMY',
  },
});

const ddb = DynamoDBDocumentClient.from(ddbClient);

const USERS_TABLE = process.env.USERS_TABLE;
if (!USERS_TABLE) {
  console.error('❌  Missing USERS_TABLE in .env');
  process.exit(1);
}

async function main() {
  console.log('👉  Seeding root admin user…');
  await ddb.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      email:       'root@system.app',
      name:        'Root Admin',
      roles:       [],
      isRootAdmin: true,
    },
  }));
  console.log('✅  Root admin seeded');
}

main().catch(err => {
  console.error('❌  Seed script error:', err);
  process.exit(1);
});
