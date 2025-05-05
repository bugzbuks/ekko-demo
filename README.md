# Ekko-demo

Monorepo for a hierarchical role-based user management demo application.

This project contains two parts:

1. **backend/** — Serverless AWS API (Node.js + TypeScript) managing users, roles, and permissions
2. **frontend/** — React + Tailwind + Shadcn UI dashboard for managing and querying users and roles (scaffold)

---

## Prerequisites

* **Node.js** v18 or higher
* **NPM** (or Yarn)
* **Docker Desktop** (for local development)
* **AWS Credentials** (for deploying, not required for local development)
* **AWS CLI** (optional, for manual interaction with local DynamoDB)

---

## Environment Variables (backend)

The backend reads the following from a `.env` file in `backend/` (demo only — do **not** commit real secrets):

```ini
# backend/.env
VITE_IS_LOCAL_MODE=true # enable local stub mode
VITE_API_KEY=<your-api-key>  # simple API key for registration endpoint

```

The Cognito User Pool ID is configured directly in `serverless.yml`:

```yaml
environment:
  COGNITO_USER_POOL_ID: af-south-1_qvirSXTxw
```

---

## Backend Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/bugzbuks/ekko-demo.git

# 2. Bootstrap backend
cd ekko-demo/backend
npm install

# 3. Create .env (demo-only)
echo "LOCAL=true" > .env
echo "API_KEY=demo1234567890" >> .env

# 4. Start locally
npm run dev
# - Launches serverless-offline at http://localhost:3000
# - Uses real AWS DynamoDB or local stub if configured
```

---

## Local Development Setup (Docker + DynamoDB)

This setup allows you to run the backend entirely offline, using a local DynamoDB instance managed by Docker.

### Step 1: Start DynamoDB Local via Docker

Make sure Docker Desktop is running, then run:

```bash
docker run -p 8000:8000 --name ekko-dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
```

Explanation:

* `-p 8000:8000`: Maps port 8000 on your host to the container
* `--name ekko-dynamodb`: Names the container
* `-sharedDb`: Ensures a shared DB instance for all clients

To verify:

```bash
curl http://localhost:8000
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

### Step 2: Seed Database (Create Table & User)

```bash
cd backend
npx ts-node scripts/seed.ts
```

What this does:

* Creates the `dev-users` table if it doesn't exist
* Inserts or updates a `root@system.app` user

To verify:

```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000
aws dynamodb scan --table-name dev-users --endpoint-url http://localhost:8000
```

---

## API Endpoints

| Method | Path              | Description                        |
| ------ | ----------------- | ---------------------------------- |
| POST   | /roles            | Create a new role in the hierarchy |
| GET    | /roles/assignable | List roles current user can assign |
| POST   | /users            | Pre-create an approved user        |
| GET    | /users            | List accessible users              |
| POST   | /auth/register    | Self-register approved user        |
| DELETE | /roles/{id}       | Self-register approved user        |
| DELETE | /users/{email}    | Self-register approved user        |

---

## Frontend Quick Start (scaffold)

Coming soon: a React + Tailwind dashboard in `frontend/` to manage roles and users.

```bash
cd ekko-demo/frontend
npm install
npm run dev
```

Note, the default admin login created is *root@system.app*. 
During local mode the auth always passes. 
This is because cognito cannot be simulated in offline mode.
---

## Notes

* **API Key:** Include `x-api-key` header on requests to `/auth/register`
* **Cognito Integration:** Pre-token Lambda injects `custom:roles` and `custom:isRootAdmin` into JWT
* **Local Mode:** When `LOCAL=true`, Cognito calls are stubbed in `src/lib/cognito.ts`

  * This stub assigns hardcoded `['Admin']` roles and skips pre-token logic

---

## Future Enhancements

* **Improve Query Scalability**

  * Current `getUsers` and `summary` use inefficient `Scan` operations
  * Add `path` to Role items and `hierarchyPath` to User items
  * Create GSI on `UsersTable` using `hierarchyPath`
  * Use `begins_with` in GSI Queries to get downstream users efficiently
  * Handle users with roles in multiple branches
  * Role Deletion Cleanup: The current deleteRole implementation only deletes the role item itself. It does not remove the deleted role ID from the roles array of users who were assigned that role. See "Future Enhancements".up

* **Seed script** for roles/users on deploy

* **Unit & integration tests** (Vitest)

* **Complete frontend implementation**

* **CI/CD pipeline** with linting & testing

* **Implement missing Update/Delete operations** for Roles and Users

* **Refine local Cognito stub** to simulate permission logic more accurately
