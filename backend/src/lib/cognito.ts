// src/lib/cognito.ts  – tiny helper
import jwt from 'jsonwebtoken';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const LOCAL = process.env.LOCAL === 'true';

export async function ensureCognitoUser(email: string, password: string) {
  if (LOCAL) {
    // skip real Cognito, just return a dummy token payload
    return jwt.sign({ email, 'custom:roles': '["Admin"]' }, 'shhh', {
      expiresIn: '1h',
    });
  }

  const cognito = new CognitoIdentityProviderClient({});
  try {
    await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: email,
      }),
    );
  } catch {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: email,
        TemporaryPassword: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      }),
    );
  }
  return 'created';
}
