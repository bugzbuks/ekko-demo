// src/handlers/auth/preTokenHandler.ts
import { getUserByEmail } from '../../lib/dynamo';
import { PreTokenGenerationTriggerHandler } from 'aws-lambda';

/**
 * Pre Token Generation trigger
 * - Fetches the user record from DynamoDB (created by an admin)
 * - Injects `custom:roles` (JSON string) and `custom:isRootAdmin` flags
 *   into the ID and access tokens so downstream Lambdas can enforce ACL.
 */
interface User {
  roles?: string[];
  isRootAdmin?: boolean;
}

interface Event {
  userName: string;
  response: {
    claimsOverrideDetails?: {
      claimsToAddOrOverride?: {
        [key: string]: string;
      };
    };
  };
}

export const handler:PreTokenGenerationTriggerHandler  = async (event: Event): Promise<Event> => {
  const email: string = event.userName; // Cognito uses email as username in our setup

  try {
    if (!email) {
      throw new Error('Email is undefined');
    }
    const result = await getUserByEmail(email);
    const user: User | null = result ? { 
      roles: result.roles, 
      isRootAdmin: result.isRootAdmin 
    } : null;
    const roles: string[] = user?.roles ?? [];
    const isRootAdmin: string = user?.isRootAdmin ? 'true' : 'false';

    event.response = {
      ...event.response,
      claimsOverrideDetails: {
        ...event.response.claimsOverrideDetails,
        claimsToAddOrOverride: {
          ...event.response.claimsOverrideDetails?.claimsToAddOrOverride,
          'custom:roles': JSON.stringify(roles),
          'custom:isRootAdmin': isRootAdmin,
        },
      },
    };
  } catch (err) {
    console.error('preTokenHandler error:', err);
    // If the lookup fails, allow Cognito to proceed without custom claims
    // to avoid blocking login, but downstream services will treat the user as minimal privileges
  }

  return event;
};
