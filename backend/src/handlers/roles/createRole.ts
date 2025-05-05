// src/handlers/roles/createRole.ts
import { v4 as uuid } from 'uuid';
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'; // Added APIGatewayProxyResult
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../lib/dynamo';
import { getCallerDetails } from '../../lib/authUtils'; // Import for permission check

const ROLES_TABLE = process.env.ROLES_TABLE!;
const TOP_LEVEL_PARENT_ID = "ROOT"; // Sentinel value matching other handlers

// Helper for API responses
const respond = (statusCode: number, payload: any): APIGatewayProxyResult => ({
    statusCode,
    headers: { // Add CORS headers
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(payload),
});

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
      // --- Get Caller Details (for permission check) ---
      const caller = getCallerDetails(event);
      if (!caller.isAuthenticated) {
          return respond(401, { error: caller.error || 'Unauthorized' });
      }
      const { roles: callerRoles, isRootAdmin: isCallerRootAdmin } = caller;
      console.log(`[createRole] Caller: ${caller.email}, IsRoot: ${isCallerRootAdmin}, Roles: ${JSON.stringify(callerRoles)}`);
      // --- End Get Caller Details ---

      // --- Parse Request Body ---
      let body: any;
      try {
          body = JSON.parse(event.body || '{}');
      } catch {
          return respond(400, { error: 'Invalid JSON body' });
      }
      const { roleType, name, parentId: inputParentId } = body; // Use inputParentId to avoid shadowing

      // Validate required fields
      if (!roleType || typeof roleType !== 'string' || roleType.trim() === '') {
          return respond(400, { error: 'roleType (string) is required' });
      }
      if (!name || typeof name !== 'string' || name.trim() === '') {
          return respond(400, { error: 'name (string) is required' });
      }
       // Validate parentId type if provided
       if (inputParentId !== undefined && inputParentId !== null && typeof inputParentId !== 'string') {
             return respond(400, { error: 'parentId must be a string or null/omitted' });
       }
      // --- End Parse Request Body ---

      // --- Determine Effective Parent ID ---
      // If inputParentId is null, undefined, or an empty string, treat it as top-level ('ROOT')
      // Otherwise, use the provided string ID.
      const effectiveParentId = (!inputParentId || inputParentId === '') ? TOP_LEVEL_PARENT_ID : inputParentId;
      console.log(`[createRole] Effective Parent ID for new role: ${effectiveParentId}`);
      // --- End Determine Effective Parent ID ---


      // --- Permission Check ---
      // Can the caller create a role under the specified parent?
      if (!isCallerRootAdmin) {
          // Non-root admins cannot create top-level roles
          if (effectiveParentId === TOP_LEVEL_PARENT_ID) {
              console.log(`[createRole] Permission denied: Non-root admin cannot create top-level roles.`);
              return respond(403, { error: 'Permission denied: Only root admins can create top-level roles.' });
          }
          // Non-root admins must possess the parent role they are assigning under
          if (!callerRoles.includes(effectiveParentId)) {
               console.log(`[createRole] Permission denied: Caller does not possess parent role ${effectiveParentId}. Caller roles: ${JSON.stringify(callerRoles)}`);
               return respond(403, { error: `Permission denied: You do not possess the parent role (${effectiveParentId}) needed to create this role.` });
          }
           console.log(`[createRole] Permission granted: Caller possesses parent role ${effectiveParentId}.`);
      } else {
           console.log(`[createRole] Permission granted: Caller is root admin.`);
      }
      // --- End Permission Check ---


      // --- Create Role Item ---
      const id = uuid(); // Generate new UUID for the role

      const item = {
        id,                       // PK
        roleType: roleType.trim(), // Trim whitespace
        name: name.trim(),         // Trim whitespace
        parentId: effectiveParentId // Use the processed parent ID ('ROOT' or actual ID)
      };
      console.log(`[createRole] Creating role item:`, item);
      // --- End Create Role Item ---


      // --- Save to DynamoDB ---
      await ddb.send(new PutCommand({
        TableName: ROLES_TABLE,
        Item: item,
        // Optional: Add ConditionExpression: 'attribute_not_exists(id)' if needed, though UUID collision is highly unlikely
      }));
      console.log(`[createRole] Role ${id} created successfully.`);
      // --- End Save to DynamoDB ---

      // Return success response
      return respond(201, { message: 'Role created successfully', role: item });

  } catch (err: any) {
       console.error('[createRole] Unhandled error:', err);
       // Check for specific DynamoDB errors if needed
       if (err.name === 'ValidationException') {
           return respond(400, { error: `Invalid data: ${err.message}` });
       }
       return respond(500, { error: 'Internal server error during role creation' });
  }
};
