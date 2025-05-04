# Ekko-demo

Monorepo for a hierarchical role-based user management demo application.

This project contains two parts:

1. **backend/** — Serverless AWS API (Node.js + TypeScript) managing users, roles, and permissions
2. **frontend/** — React + Tailwind + Shadcn UI dashboard for managing and querying users and roles (scaffold)

---

## Prerequisites

* **Node.js** v18 or higher
* **NPM** (or Yarn)
* **AWS Credentials** (for deploying, not required for local development)

---

## Environment Variables (backend)

The backend reads the following from a `.env` file in `backend/` (demo only — do **not** commit real secrets):

```ini
# backend/.env
LOCAL=true                  # enable local stub mode
API_KEY=<your-api-key>      # simple API key for registration endpoint
```

The Cognito User Pool ID is configured directly in `serverless.yml`:

```yaml
provider:
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

# 4. Start locally\ n npm run dev
#    • Launches serverless-offline at http://localhost:3000
#    • Uses real AWS DynamoDB or local stub if configured
```

### Seed Root Admin User

To bootstrap the system with a **root admin** account, run the minimal seed script:

```bash
cd backend
npx ts-node scripts/seed.ts
```

### API Endpoints

| Method | Path                | Description                        |
| ------ | ------------------- | ---------------------------------- |
| POST   | `/roles`            | Create a new role in the hierarchy |
| GET    | `/roles/assignable` | List roles current user can assign |
| POST   | `/users`            | Pre-create an approved user        |
| GET    | `/users`            | List accessible users              |
| POST   | `/auth/register`    | Self-register approved user        |

---

## Frontend Quick Start (scaffold)

> *Coming soon*: a React + Tailwind dashboard in `frontend/` to manage roles and users.

```bash
cd ekko-demo/frontend
npm install
npm start
```

---

## Notes

* **API Key**: Include `x-api-key` header on requests to `/auth/register`.
* **Cognito Integration**: Pre-token Lambda injects `custom:roles` and `custom:isRootAdmin` into JWT.
* **Local Mode**: When `LOCAL=true`, Cognito calls are stubbed for fully offline use.

---

## Future Enhancements

* Seed script for roles/users on deploy
* Unit & integration tests (Vitest)
* Complete frontend implementation
* CI/CD pipeline with automated linting & testing

---

