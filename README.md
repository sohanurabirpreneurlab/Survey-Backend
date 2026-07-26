# Survey Backend

This backend lives in `survey-backend` and uses `express-validator` for request validation.
It is configured to use `DATABASE_URL` for the PostgreSQL connection, including Supabase session-pooler connection strings.

## Stack

- Node.js
- TypeScript
- Express
- Supabase PostgreSQL
- local database-backed auth
- Brevo
- `express-validator`

## Quick start

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your Supabase session-pooler connection string.
3. Install dependencies with `npm install`.
4. Run the dev server with `npm run dev`.
5. Type-check with `npm run typecheck`.
6. Apply database tables with `npm run db:migrate`.

## Current scope

The backend currently includes:

- app bootstrap
- centralized environment loading
- request IDs
- structured error responses
- consistent success responses
- reusable `express-validator` middleware
- a health route
- business-owner authentication through local email/password credentials
- manual approval status through `user_profiles`
- approved-account middleware for business APIs
- survey, invitation, respondent, response, and result modules

## Business-owner auth flow

1. `POST /api/v1/auth/register` creates a local `app_users` row and a `user_profiles` row with `account_status = pending`.
2. `POST /api/v1/auth/login` validates the stored password hash, creates a refresh-backed auth session, and returns an `accessState`.
3. Pending users can call `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`, but cannot access approved-only business routes.
4. Business routes require both authentication and an approved account.
5. Approval is updated manually in the database for now.

To promote a user to admin after account creation:

```sql
update public.user_profiles
set role = 'admin'
where user_id = 'YOUR_USER_ID';
```

## Core auth env

Required:

```env
FRONTEND_URL=http://localhost:4000
DATABASE_URL=postgresql://...
```

Recommended:

```env
AUTH_JWT_SECRET=replace-with-a-long-random-secret
```
