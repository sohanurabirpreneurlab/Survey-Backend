alter table if exists public.organizations
  add column if not exists deletion_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.surveys
  add column if not exists deletion_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.user_profiles
  add column if not exists deleted_at timestamptz null,
  add column if not exists deletion_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.survey_responses
  add column if not exists deleted_at timestamptz null,
  add column if not exists deletion_metadata jsonb not null default '{}'::jsonb,
  add column if not exists previous_status text null;

alter table if exists public.survey_responses
  drop constraint if exists survey_responses_previous_status_check;

alter table if exists public.survey_responses
  add constraint survey_responses_previous_status_check
  check (previous_status is null or previous_status in ('in_progress', 'submitted', 'invalidated'));

update public.survey_responses
set deleted_at = coalesce(deleted_at, updated_at),
    deletion_metadata = deletion_metadata || jsonb_strip_nulls(jsonb_build_object(
      'deletedAt', metadata->>'deletedAt',
      'deletedBy', metadata->>'deletedBy'
    )),
    previous_status = coalesce(previous_status, 'invalidated')
where status = 'deleted';

create index if not exists organizations_deleted_at_idx
  on public.organizations (deleted_at desc)
  where deleted_at is not null;

create index if not exists surveys_deleted_at_idx
  on public.surveys (deleted_at desc)
  where deleted_at is not null;

create index if not exists user_profiles_deleted_at_idx
  on public.user_profiles (deleted_at desc)
  where deleted_at is not null;

create index if not exists survey_responses_deleted_at_idx
  on public.survey_responses (deleted_at desc)
  where deleted_at is not null;
