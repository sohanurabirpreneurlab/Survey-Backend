# Backend Architecture

## Layer shape

```text
Route
  -> Middleware
  -> Controller
  -> Service
  -> Repository
  -> Supabase PostgreSQL
```

## Validation choice

The backend uses `express-validator`, not Zod.

Why:

- it stays close to Express middleware
- request body, params, and query validation can be declared directly on routes
- validation failures can be normalized into the shared API error format

## Database connection

The backend uses `DATABASE_URL` for PostgreSQL access.

For Supabase:

- use the session-pooler connection string in `DATABASE_URL`
- keep SSL enabled
- use direct Postgres access for repositories and migrations
- keep Supabase keys available separately for Auth and platform APIs when those modules are added

## Proposed file tree

```text
survey-backend/
├── docs/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── common/
│   └── modules/
└── package.json
```

## Request flow

```text
HTTP request
  -> requestId middleware
  -> route validators
  -> validateRequest middleware
  -> authenticateUser / requireApprovedAccount when needed
  -> controller
  -> service
  -> repository
  -> response helper
```

## Authentication Split

```text
Local access-token authentication
  -> proves identity

user_profiles.account_status
  -> controls business-application access
```

Pending users may authenticate successfully but remain blocked from approved-only business APIs until `user_profiles.account_status` becomes `approved`.

## Error flow

```text
Thrown AppError or unexpected error
  -> centralized error handler
  -> structured API error payload
```
