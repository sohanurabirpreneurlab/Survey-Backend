create extension if not exists "pgcrypto";

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint organizations_slug_unique unique (slug)
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'editor', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx on organization_members (user_id);
create index if not exists organization_members_organization_id_idx on organization_members (organization_id);

create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
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
  constraint surveys_dates_check check (opens_at is null or closes_at is null or closes_at > opens_at)
);

comment on table surveys is 'Survey is the long-lived identity and operational state.';

create table if not exists survey_versions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  version_number integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  created_from_version_id uuid null references survey_versions(id) on delete set null,
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

comment on table survey_versions is 'Survey version is the exact definition respondents saw at a particular time.';

create unique index if not exists survey_versions_one_active_draft_per_survey_idx
on survey_versions (survey_id)
where status = 'draft';

create table if not exists survey_sections (
  id uuid primary key default gen_random_uuid(),
  survey_version_id uuid not null references survey_versions(id) on delete cascade,
  stable_key text not null,
  title text not null,
  description text null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_sections_stable_key_unique unique (survey_version_id, stable_key),
  constraint survey_sections_position_unique unique (survey_version_id, position)
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  survey_version_id uuid not null references survey_versions(id) on delete cascade,
  section_id uuid not null references survey_sections(id) on delete cascade,
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

create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
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

alter table surveys
  add constraint surveys_current_draft_fk
  foreign key (current_draft_version_id) references survey_versions(id) on delete set null;

alter table surveys
  add constraint surveys_published_version_fk
  foreign key (published_version_id) references survey_versions(id) on delete set null;

create or replace function create_survey_with_initial_draft(
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
returns table (survey_id uuid, draft_version_id uuid, version_number integer, created_at timestamptz)
language plpgsql
as $$
declare
  v_survey_id uuid;
  v_version_id uuid;
  v_created_at timestamptz := now();
begin
  -- Survey creation and draft version creation must succeed together so the
  -- application never creates a survey identity without its editable first version.
  insert into surveys (
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

  insert into survey_versions (
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

  update surveys
  set current_draft_version_id = v_version_id
  where id = v_survey_id;

  return query
  select v_survey_id, v_version_id, 1, v_created_at;
end;
$$;

create or replace function create_draft_from_published_version(
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
  from surveys
  where id = p_survey_id
  for update;

  if v_published_version_id is null then
    raise exception 'survey is not published';
  end if;

  if exists (
    select 1 from survey_versions
    where survey_id = p_survey_id and status = 'draft'
  ) then
    raise exception 'draft already exists';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version_number
  from survey_versions
  where survey_id = p_survey_id;

  insert into survey_versions (
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
  from survey_versions
  where id = v_published_version_id
  returning id into v_new_version_id;

  insert into survey_sections (survey_version_id, stable_key, title, description, position)
  select v_new_version_id, stable_key, title, description, position
  from survey_sections
  where survey_version_id = v_published_version_id;

  with copied_sections as (
    select old_section.id as old_id, new_section.id as new_id
    from survey_sections old_section
    join survey_sections new_section
      on new_section.survey_version_id = v_new_version_id
     and new_section.stable_key = old_section.stable_key
    where old_section.survey_version_id = v_published_version_id
  )
  insert into questions (
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
  from questions q
  join copied_sections on copied_sections.old_id = q.section_id
  where q.survey_version_id = v_published_version_id;

  with copied_questions as (
    select old_q.id as old_id, new_q.id as new_id
    from questions old_q
    join questions new_q
      on new_q.survey_version_id = v_new_version_id
     and new_q.stable_key = old_q.stable_key
    where old_q.survey_version_id = v_published_version_id
  )
  insert into question_options (question_id, stable_key, label, value, position, settings)
  select
    copied_questions.new_id,
    qo.stable_key,
    qo.label,
    qo.value,
    qo.position,
    qo.settings
  from question_options qo
  join copied_questions on copied_questions.old_id = qo.question_id;

  update surveys
  set current_draft_version_id = v_new_version_id,
      updated_at = now()
  where id = p_survey_id;

  return query select v_new_version_id;
end;
$$;

create or replace function publish_survey_draft(
  p_survey_id uuid,
  p_version_id uuid,
  p_published_by uuid
)
returns void
language plpgsql
as $$
begin
  -- Published versions must stay immutable because respondents may already have
  -- submitted answers against that exact definition.
  update survey_versions
  set status = 'archived',
      archived_at = now(),
      updated_at = now()
  where survey_id = p_survey_id
    and status = 'published';

  update survey_versions
  set status = 'published',
      published_by = p_published_by,
      published_at = now(),
      updated_at = now()
  where id = p_version_id
    and survey_id = p_survey_id
    and status = 'draft';

  update surveys
  set status = 'published',
      published_version_id = p_version_id,
      current_draft_version_id = null,
      updated_at = now()
  where id = p_survey_id;
end;
$$;
