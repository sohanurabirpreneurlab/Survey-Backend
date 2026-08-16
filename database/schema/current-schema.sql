-- Central current-state schema snapshot for the survey backend.
-- Migrations remain the deployment source of truth.
-- This file is a developer reference showing what the public schema should look
-- like after all migrations have been applied.
--
-- In this workspace, the snapshot was derived from the current migration set in
-- src/database/migrations because a live schema dump was not executed here.
-- Regenerate from a migrated database when the Supabase CLI or pg_dump is
-- available:
--
--   supabase db dump --schema public --file database/schema/current-schema.sql

create extension if not exists "pgcrypto";

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint organizations_slug_unique unique (slug)
);

comment on table public.organizations is
'Stores the long-lived identity of an organization that owns surveys and members.';

comment on column public.organizations.slug is
'Human-friendly organization identifier that must stay unique across active organizations.';

comment on column public.organizations.deleted_at is
'Soft-delete marker so historical references can remain valid without treating the organization as active.';

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'editor', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id)
);

comment on table public.organization_members is
'Links authenticated users to organizations and records the role used for authorization decisions.';

comment on column public.organization_members.role is
'Organization-scoped authorization role used by services to decide survey access and lifecycle permissions.';

create index organization_members_user_id_idx
  on public.organization_members (user_id);

create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

create table public.user_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  full_name text not null,
  role text not null default 'business_owner',
  account_status text not null default 'pending',
  approved_at timestamptz null,
  rejected_at timestamptz null,
  suspended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_role_check
    check (role in ('business_owner')),
  constraint user_profiles_account_status_check
    check (account_status in ('pending', 'approved', 'rejected', 'suspended'))
);

comment on table public.user_profiles is
'Stores application-specific user information and manual account approval status. Authentication credentials remain managed in public.app_users.';

comment on column public.user_profiles.account_status is
'Controls whether an authenticated user may access protected business application features.';

comment on column public.user_profiles.role is
'Application role. Initially limited to business_owner.';

alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  slug text not null,
  status text not null check (status in ('draft', 'published', 'closed', 'archived')),
  access_mode text not null check (access_mode in ('public', 'invite_only', 'authenticated', 'organization_only')),
  current_draft_version_id uuid null,
  published_version_id uuid null,
  opens_at timestamptz null,
  closes_at timestamptz null,
  response_limit integer null check (response_limit is null or response_limit > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint surveys_active_slug_unique unique (organization_id, slug),
  constraint surveys_dates_check check (
    opens_at is null
    or closes_at is null
    or closes_at > opens_at
  )
);

comment on table public.surveys is
'Stores the long-lived survey identity and operational lifecycle of a survey.';

comment on column public.surveys.current_draft_version_id is
'Points to the survey version currently editable by administrators.';

comment on column public.surveys.published_version_id is
'Points to the survey version currently visible to respondents.';

comment on column public.surveys.status is
'Operational lifecycle state. Closing a survey changes availability without creating a new survey definition version.';

create table public.survey_versions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  version_number integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  created_from_version_id uuid null references public.survey_versions(id) on delete set null,
  title text not null,
  description text null,
  settings jsonb not null default '{}'::jsonb,
  change_summary text null,
  created_by uuid not null,
  published_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  archived_at timestamptz null,
  constraint survey_versions_survey_version_number_unique unique (survey_id, version_number)
);

comment on table public.survey_versions is
'Stores immutable published survey definitions and editable draft definitions.';

comment on column public.survey_versions.created_from_version_id is
'Records which published version was cloned when a new draft was started.';

comment on column public.survey_versions.settings is
'Typed JSON settings for respondent-facing presentation and navigation rules.';

create unique index survey_versions_one_active_draft_per_survey_idx
  on public.survey_versions (survey_id)
  where status = 'draft';

create table public.survey_sections (
  id uuid primary key default gen_random_uuid(),
  survey_version_id uuid not null references public.survey_versions(id) on delete cascade,
  stable_key text not null,
  title text not null,
  description text null,
  position integer not null check (position >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_sections_stable_key_unique unique (survey_version_id, stable_key),
  constraint survey_sections_position_unique unique (survey_version_id, position)
);

comment on table public.survey_sections is
'Stores one section row per survey version snapshot.';

comment on column public.survey_sections.stable_key is
'Logical section identity preserved across cloned versions even though row IDs change.';

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  survey_version_id uuid not null references public.survey_versions(id) on delete cascade,
  section_id uuid not null references public.survey_sections(id) on delete cascade,
  stable_key text not null,
  type text not null check (type in ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no', 'rating', 'vote')),
  title text not null,
  description text null,
  required boolean not null default false,
  position integer not null check (position >= 0),
  validation jsonb not null default '{}'::jsonb,
  display_logic jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_stable_key_unique unique (survey_version_id, stable_key),
  constraint questions_position_unique unique (section_id, position)
);

comment on table public.questions is
'Stores version-scoped survey questions. Questions belong to exactly one survey version and one section within that version.';

comment on column public.questions.stable_key is
'Logical question identity preserved across survey versions so diffs can compare the same question over time.';

comment on column public.questions.display_logic is
'Structured conditional visibility rules that must reference stable keys, not ephemeral row IDs.';

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  stable_key text not null,
  label text not null,
  value text not null,
  position integer not null check (position >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_options_stable_key_unique unique (question_id, stable_key),
  constraint question_options_value_unique unique (question_id, value),
  constraint question_options_position_unique unique (question_id, position)
);

comment on table public.question_options is
'Stores explicit options for choice-like questions so result handling stays consistent across question types.';

comment on column public.question_options.stable_key is
'Logical option identity preserved across cloned versions while database row IDs change.';

create table public.invitation_access_tokens (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.survey_invitations(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint invitation_access_tokens_token_hash_unique unique (token_hash)
);

comment on table public.invitation_access_tokens is
'Stores one or more valid hashed access tokens for the same invitation so regenerated links do not invalidate older links.';

comment on column public.invitation_access_tokens.token_hash is
'SHA-256 hash of a private invitation access token. Raw link tokens are never stored.';

create index invitation_access_tokens_invitation_id_idx
  on public.invitation_access_tokens (invitation_id);

create index invitation_access_tokens_expires_at_idx
  on public.invitation_access_tokens (expires_at);

alter table public.surveys
  add constraint surveys_current_draft_fk
  foreign key (current_draft_version_id) references public.survey_versions(id) on delete set null;

alter table public.surveys
  add constraint surveys_published_version_fk
  foreign key (published_version_id) references public.survey_versions(id) on delete set null;

create or replace function public.create_survey_with_initial_draft(
  p_organization_id uuid,
  p_slug text,
  p_access_mode text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_response_limit integer,
  p_created_by uuid,
  p_title text,
  p_version_payload jsonb
)
returns table (
  survey_id uuid,
  draft_version_id uuid,
  version_number integer,
  created_at timestamptz
)
language plpgsql
as $$
declare
  v_survey_id uuid;
  v_version_id uuid;
  v_created_at timestamptz := now();
begin
  -- A survey must never be created without its first draft because the admin
  -- workflow always depends on an editable version pointer being present.
  insert into public.surveys (
    organization_id,
    slug,
    status,
    access_mode,
    opens_at,
    closes_at,
    response_limit,
    created_by,
    created_at,
    updated_at
  )
  values (
    p_organization_id,
    p_slug,
    'draft',
    p_access_mode,
    p_opens_at,
    p_closes_at,
    p_response_limit,
    p_created_by,
    v_created_at,
    v_created_at
  )
  returning id into v_survey_id;

  insert into public.survey_versions (
    survey_id,
    version_number,
    status,
    title,
    description,
    settings,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_survey_id,
    1,
    'draft',
    p_title,
    p_version_payload->>'description',
    coalesce(p_version_payload->'settings', '{}'::jsonb),
    p_created_by,
    v_created_at,
    v_created_at
  )
  returning id into v_version_id;

  update public.surveys
  set current_draft_version_id = v_version_id
  where id = v_survey_id;

  return query
  select v_survey_id, v_version_id, 1, v_created_at;
end;
$$;

comment on function public.create_survey_with_initial_draft(
  uuid, text, text, timestamptz, timestamptz, integer, uuid, text, jsonb
) is
'Atomically creates a survey identity and its first editable draft version.';

create or replace function public.create_draft_from_published_version(
  p_survey_id uuid,
  p_created_by uuid,
  p_change_summary text
)
returns table (draft_version_id uuid)
language plpgsql
as $$
declare
  v_published_version_id uuid;
  v_new_version_id uuid;
  v_next_version_number integer;
begin
  select published_version_id into v_published_version_id
  from public.surveys
  where id = p_survey_id
  for update;

  if v_published_version_id is null then
    raise exception 'survey is not published';
  end if;

  if exists (
    select 1
    from public.survey_versions
    where survey_id = p_survey_id
      and status = 'draft'
  ) then
    raise exception 'draft already exists';
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version_number
  from public.survey_versions
  where survey_id = p_survey_id;

  insert into public.survey_versions (
    survey_id,
    version_number,
    status,
    created_from_version_id,
    title,
    description,
    settings,
    change_summary,
    created_by
  )
  select
    survey_id,
    v_next_version_number,
    'draft',
    id,
    title,
    description,
    settings,
    p_change_summary,
    p_created_by
  from public.survey_versions
  where id = v_published_version_id
  returning id into v_new_version_id;

  insert into public.survey_sections (
    survey_version_id,
    stable_key,
    title,
    description,
    position,
    settings
  )
  select
    v_new_version_id,
    stable_key,
    title,
    description,
    position,
    settings
  from public.survey_sections
  where survey_version_id = v_published_version_id;

  with copied_sections as (
    select old_section.id as old_id, new_section.id as new_id
    from public.survey_sections old_section
    join public.survey_sections new_section
      on new_section.survey_version_id = v_new_version_id
     and new_section.stable_key = old_section.stable_key
    where old_section.survey_version_id = v_published_version_id
  )
  insert into public.questions (
    survey_version_id,
    section_id,
    stable_key,
    type,
    title,
    description,
    required,
    position,
    validation,
    display_logic,
    settings
  )
  select
    v_new_version_id,
    copied_sections.new_id,
    q.stable_key,
    q.type,
    q.title,
    q.description,
    q.required,
    q.position,
    q.validation,
    q.display_logic,
    q.settings
  from public.questions q
  join copied_sections on copied_sections.old_id = q.section_id
  where q.survey_version_id = v_published_version_id;

  with copied_questions as (
    select old_q.id as old_id, new_q.id as new_id
    from public.questions old_q
    join public.questions new_q
      on new_q.survey_version_id = v_new_version_id
     and new_q.stable_key = old_q.stable_key
    where old_q.survey_version_id = v_published_version_id
  )
  insert into public.question_options (
    question_id,
    stable_key,
    label,
    value,
    position,
    settings
  )
  select
    copied_questions.new_id,
    qo.stable_key,
    qo.label,
    qo.value,
    qo.position,
    qo.settings
  from public.question_options qo
  join copied_questions on copied_questions.old_id = qo.question_id;

  update public.surveys
  set current_draft_version_id = v_new_version_id,
      updated_at = now()
  where id = p_survey_id;

  return query select v_new_version_id;
end;
$$;

comment on function public.create_draft_from_published_version(uuid, uuid, text) is
'Clones the currently published survey definition into a new editable draft while preserving stable keys.';

create or replace function public.publish_survey_draft(
  p_survey_id uuid,
  p_version_id uuid,
  p_published_by uuid
)
returns void
language plpgsql
as $$
begin
  -- Published versions remain historical records. Mutating them would change
  -- the meaning of responses collected against earlier versions.
  update public.survey_versions
  set status = 'archived',
      archived_at = now(),
      updated_at = now()
  where survey_id = p_survey_id
    and status = 'published';

  update public.survey_versions
  set status = 'published',
      published_by = p_published_by,
      published_at = now(),
      updated_at = now()
  where id = p_version_id
    and survey_id = p_survey_id
    and status = 'draft';

  update public.surveys
  set status = 'published',
      published_version_id = p_version_id,
      current_draft_version_id = null,
      updated_at = now()
  where id = p_survey_id;
end;
$$;

comment on function public.publish_survey_draft(uuid, uuid, uuid) is
'Promotes the current draft to the published version and clears the editable draft pointer.';

-- Row Level Security
-- public.user_profiles has RLS enabled with a self-read policy for authenticated users.

-- Triggers
-- No schema integrity triggers exist yet in the current migration set.
