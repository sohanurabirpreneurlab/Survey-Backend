alter table if exists public.surveys
  add column if not exists public_slug text;

update public.surveys
set public_slug = concat('s_', substr(replace(gen_random_uuid()::text, '-', ''), 1, 18))
where public_slug is null;

alter table if exists public.surveys
  alter column public_slug set not null;

alter table if exists public.surveys
  add constraint surveys_public_slug_unique unique (public_slug);

alter table if exists public.survey_invitations
  add column if not exists survey_version_id uuid references public.survey_versions(id) on delete restrict;

update public.survey_invitations si
set survey_version_id = s.published_version_id
from public.surveys s
where s.id = si.survey_id
  and si.survey_version_id is null;

alter table if exists public.survey_invitations
  alter column survey_version_id set not null;

alter table if exists public.respondent_sessions
  add column if not exists survey_version_id uuid references public.survey_versions(id) on delete restrict;

update public.respondent_sessions rs
set survey_version_id = si.survey_version_id
from public.survey_invitations si
where si.id = rs.invitation_id
  and rs.survey_version_id is null;

alter table if exists public.respondent_sessions
  alter column survey_version_id set not null;

alter table if exists public.respondent_sessions
  alter column invitation_id drop not null;

alter table if exists public.respondent_sessions
  drop constraint if exists respondent_sessions_status_check;

alter table if exists public.respondent_sessions
  add constraint respondent_sessions_status_check
  check (status in ('active', 'submitted', 'revoked', 'expired'));

alter table if exists public.survey_responses
  alter column invitation_id drop not null;

drop function if exists public.submit_survey_response(uuid, uuid);

drop function if exists public.create_survey_with_initial_draft(
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  uuid,
  text,
  jsonb
);

create or replace function public.create_survey_with_initial_draft(
  p_organization_id uuid,
  p_slug text,
  p_public_slug text,
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
  insert into surveys (
    organization_id,
    slug,
    public_slug,
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
    p_public_slug,
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
