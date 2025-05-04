// src/handlers/auth/registerUser.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getUserByEmail } from '../../lib/dynamo';

// Ensure required environment variables
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
if (!USER_POOL_ID) {
  throw new Error('Missing COGNITO_USER_POOL_ID env var');
}
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error('Missing API_KEY env var');
}

const cognito = new CognitoIdentityProviderClient({});

// Helper for API responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(payload),
});

export const handler: APIGatewayProxyHandler = async (event) => {
  // Simple API key check
  const incomingKey = event.headers['x-api-key'] || event.headers['X-API-KEY'];
  if (incomingKey !== API_KEY) {
    return respond(401, { error: 'Unauthorized' });
  }

  // Parse body
  let email: string;
  let password: string;
  try {
    const body = JSON.parse(event.body || '{}');
    email = body.email;
    password = body.password;
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  // Validate inputs
  if (!email || !password) {
    return respond(400, { error: 'email and password required' });
  }

  // Check user pre-approval in DynamoDB
  const approvedUser = await getUserByEmail(email);
  if (!approvedUser) {
    return respond(403, { error: 'User not approved for registration' });
  }

  // Check if already exists in Cognito
  try {
    await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email }),
    );
    return respond(200, { message: 'User already registered' });
  } catch {
    // not found, proceed
  }

  // Create user with temporary password
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      TemporaryPassword: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    }),
  );

  // Set permanent password so user can login directly
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );

  return respond(201, { message: 'User registered and verified' });
};
