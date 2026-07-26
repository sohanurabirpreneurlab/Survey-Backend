# Database Schema Overview

This folder documents the current database structure in one place.

- `../schema/current-schema.sql` is the current-state SQL reference.
- `../../src/database/migrations/` is the executable migration history and remains the deployment source of truth.
- Supabase-generated TypeScript types belong in `src/database/generated/database.types.ts` and should not be edited by hand.

## Core Versioning Rules

- `app_users` stores authentication identity and password hash data for local email/password auth.
- `user_profiles` stores business-owner profile information and manual approval status.
- `surveys` stores the long-lived survey identity and operational lifecycle.
- `survey_versions` stores an exact historical survey definition.
- `survey_sections`, `questions`, and `question_options` belong to one specific survey version.
- Published versions are immutable.
- Draft versions are editable.
- Stable keys stay the same across cloned versions.
- Database row IDs change when a version is cloned.
- `current-schema.sql` should be regenerated from a migrated database whenever possible.

## Relationships

```text
app_users.id
  `-- user_profiles.user_id

organizations.id
  |-- organization_members.organization_id
  `-- surveys.organization_id

surveys.id
  `-- survey_versions.survey_id

survey_versions.id
  |-- surveys.current_draft_version_id
  |-- surveys.published_version_id
  `-- survey_sections.survey_version_id

survey_sections.id
  `-- questions.section_id

questions.id
  `-- question_options.question_id
```

## organizations

Stores the permanent identity of an organization that owns surveys.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Organization identifier |
| name | text | No | — | Display name |
| slug | text | No | — | Unique organization slug |
| created_by | uuid | No | — | Supabase user who created the organization |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |
| deleted_at | timestamptz | Yes | `null` | Soft-delete marker |

Relationships:
`organizations.id` -> `organization_members.organization_id`
`organizations.id` -> `surveys.organization_id`

Constraints and indexes:
`organizations_slug_unique` on `slug`

Mutability:
Mutable while active; soft delete uses `deleted_at`.

Used by:
Organizations module, surveys module authorization checks.

## user_profiles

Stores application-specific business-owner profile data and manual approval status. Authentication credentials remain in `app_users`.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| user_id | uuid | No | — | References local auth user |
| full_name | text | No | — | User display name |
| role | text | No | `business_owner` | Application role |
| account_status | text | No | `pending` | Manual approval state |
| approved_at | timestamptz | Yes | `null` | Approval timestamp |
| rejected_at | timestamptz | Yes | `null` | Rejection timestamp |
| suspended_at | timestamptz | Yes | `null` | Suspension timestamp |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |

Relationships:
`user_profiles.user_id` -> `app_users.id`

Constraints and indexes:
Primary key on `user_id`
Check `role in ('business_owner')`
Check `account_status in ('pending', 'approved', 'rejected', 'suspended')`
RLS enabled with self-read policy for authenticated users

Mutability:
Readable by the owning authenticated user. Approval fields are intended for trusted administrative updates, not public browser writes.

Used by:
Auth module and approved-account middleware.

## organization_members

Links users to organizations and stores the role used for authorization.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Membership identifier |
| organization_id | uuid | No | — | Owning organization |
| user_id | uuid | No | — | Local auth user |
| role | text | No | — | One of `owner`, `admin`, `editor`, `analyst`, `viewer` |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |

Relationships:
`organization_members.organization_id` -> `organizations.id`

Constraints and indexes:
Unique on `(organization_id, user_id)`
Check constraint on allowed role values
Indexes on `user_id` and `organization_id`

Mutability:
Mutable; role changes are expected over time.

Used by:
Organizations service, survey authorization rules.

## surveys

Stores the permanent survey identity and operational state.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Survey identifier |
| organization_id | uuid | No | — | Owning organization |
| slug | text | No | — | URL-friendly survey identifier unique within the organization |
| status | text | No | — | Lifecycle state: `draft`, `published`, `closed`, `archived` |
| access_mode | text | No | — | Access policy: `public`, `invite_only`, `authenticated`, `organization_only` |
| current_draft_version_id | uuid | Yes | `null` | Editable draft version |
| published_version_id | uuid | Yes | `null` | Version visible to respondents |
| opens_at | timestamptz | Yes | `null` | Survey open time |
| closes_at | timestamptz | Yes | `null` | Survey close time |
| response_limit | integer | Yes | `null` | Optional max response count |
| created_by | uuid | No | — | Creator user ID |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |
| deleted_at | timestamptz | Yes | `null` | Soft-delete marker |

Relationships:
`surveys.organization_id` -> `organizations.id`
`surveys.current_draft_version_id` -> `survey_versions.id`
`surveys.published_version_id` -> `survey_versions.id`
`surveys.id` -> `survey_versions.survey_id`

Constraints and indexes:
Unique on `(organization_id, slug)`
Check `response_limit > 0` when present
Check `closes_at > opens_at` when both are present

Mutability:
Operational fields are mutable. The row is not a version snapshot.

Used by:
Surveys module lifecycle and routing metadata.

## survey_versions

Stores exact survey definitions for drafts and published history.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Version row identifier |
| survey_id | uuid | No | — | Parent survey |
| version_number | integer | No | — | Incrementing version number per survey |
| status | text | No | — | `draft`, `published`, or `archived` |
| created_from_version_id | uuid | Yes | `null` | Published version cloned into this draft |
| title | text | No | — | Survey title for this version |
| description | text | Yes | `null` | Version description |
| settings | jsonb | No | `'{}'::jsonb` | Typed survey presentation settings |
| change_summary | text | Yes | `null` | Optional admin summary of changes |
| created_by | uuid | No | — | User who created the version |
| published_by | uuid | Yes | `null` | User who published the version |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |
| published_at | timestamptz | Yes | `null` | Publish time |
| archived_at | timestamptz | Yes | `null` | Archive time |

Relationships:
`survey_versions.survey_id` -> `surveys.id`
`survey_versions.created_from_version_id` -> `survey_versions.id`
`survey_versions.id` -> `survey_sections.survey_version_id`

Constraints and indexes:
Unique on `(survey_id, version_number)`
Partial unique index `survey_versions_one_active_draft_per_survey_idx` enforcing one active draft per survey

Mutability:
Draft rows are editable. Published rows are treated as immutable.

Used by:
Survey creation, draft lifecycle, publish flow, version history, version comparison.

## survey_sections

Stores survey sections within one version snapshot.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Section row identifier for this version only |
| survey_version_id | uuid | No | — | Parent survey version |
| stable_key | text | No | — | Logical section identity preserved across versions |
| title | text | No | — | Section title |
| description | text | Yes | `null` | Section description |
| position | integer | No | — | Zero-based section order |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |

Relationships:
`survey_sections.survey_version_id` -> `survey_versions.id`
`survey_sections.id` -> `questions.section_id`

Constraints and indexes:
Unique on `(survey_version_id, stable_key)`
Unique on `(survey_version_id, position)`
Check `position >= 0`

Mutability:
Mutable only while the parent version is a draft.

Used by:
Survey draft editing and version cloning.

## questions

Stores survey questions within a section of one survey version.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Question row identifier for this version only |
| survey_version_id | uuid | No | — | Parent survey version |
| section_id | uuid | No | — | Parent section |
| stable_key | text | No | — | Logical question identity preserved across versions |
| type | text | No | — | `short_text`, `long_text`, `single_choice`, `multiple_choice`, `yes_no`, `rating`, `vote` |
| title | text | No | — | Question title |
| description | text | Yes | `null` | Question description |
| required | boolean | No | `false` | Whether the respondent must answer |
| position | integer | No | — | Zero-based order within the section |
| validation | jsonb | No | `'{}'::jsonb` | Type-specific validation rules |
| display_logic | jsonb | No | `'{}'::jsonb` | Conditional visibility rules |
| settings | jsonb | No | `'{}'::jsonb` | Question-specific UI settings |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |

Relationships:
`questions.survey_version_id` -> `survey_versions.id`
`questions.section_id` -> `survey_sections.id`
`questions.id` -> `question_options.question_id`

Constraints and indexes:
Unique on `(survey_version_id, stable_key)`
Unique on `(section_id, position)`
Check allowed question type values
Check `position >= 0`

Mutability:
Mutable only while the parent version is a draft.

Used by:
Survey draft editing, publish validation, version comparison.

## question_options

Stores explicit options for option-based questions.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| id | uuid | No | `gen_random_uuid()` | Option row identifier for this version only |
| question_id | uuid | No | — | Parent question |
| stable_key | text | No | — | Logical option identity preserved across versions |
| label | text | No | — | Display label |
| value | text | No | — | Stored option value unique within the question |
| position | integer | No | — | Zero-based order within the question |
| settings | jsonb | No | `'{}'::jsonb` | Option-specific settings |
| created_at | timestamptz | No | `now()` | Creation time |
| updated_at | timestamptz | No | `now()` | Last update time |

Relationships:
`question_options.question_id` -> `questions.id`

Constraints and indexes:
Unique on `(question_id, stable_key)`
Unique on `(question_id, value)`
Unique on `(question_id, position)`
Check `position >= 0`

Mutability:
Mutable only while the parent version is a draft.

Used by:
Choice-question editing, cloning, publish validation, future results aggregation.

## Helper Functions

### create_survey_with_initial_draft

Creates the `surveys` row and version 1 draft atomically. This prevents the application from ever seeing a survey without its initial editable draft.

### create_draft_from_published_version

Clones the published version into a new draft, preserving stable keys while generating new row IDs.

### publish_survey_draft

Promotes the draft to the published version and clears the active draft pointer.

## RLS, Policies, and Triggers

Current status:

| Feature | Status | Notes |
|---|---|---|
| Row Level Security | Partially enabled | `user_profiles` has RLS enabled |
| RLS policies | Partial | Authenticated users can read only their own `user_profiles` row |
| Integrity triggers | None yet | Current schema relies on constraints and application/service checks |

## Manual Approval

Temporary approval happens directly in Supabase.

Approve:

```sql
update public.user_profiles
set
  account_status = 'approved',
  approved_at = now(),
  rejected_at = null,
  suspended_at = null,
  updated_at = now()
where user_id = 'AUTH_USER_UUID';
```

List pending users:

```sql
select
  user_id,
  full_name,
  role,
  account_status,
  created_at
from public.user_profiles
where account_status = 'pending'
order by created_at asc;
```

## Verification Workflow

When database work changes:

1. Apply migrations successfully using the migration command for the repo.
2. Regenerate `database/schema/current-schema.sql` from the migrated database.
3. Regenerate Supabase TypeScript types.
4. Confirm every public table and helper function appears in the schema snapshot.
5. Confirm foreign keys, constraints, and documented relationships still match the actual SQL.

Suggested commands:

```bash
supabase migration up
supabase db dump --schema public --file database/schema/current-schema.sql
supabase gen types typescript --local > src/database/generated/database.types.ts
```

If the Supabase CLI is unavailable, use a schema-only PostgreSQL dump for the snapshot and then review the output against the migrations before committing it.
