alter table public.surveys
  drop constraint if exists surveys_access_mode_check;

alter table public.surveys
  add constraint surveys_access_mode_check
  check (access_mode in ('public', 'hybrid', 'invite_only', 'authenticated', 'organization_only'));

comment on column public.surveys.access_mode is
'Controls respondent access. Hybrid surveys accept both anonymous public-link sessions and invitation-linked sessions.';
