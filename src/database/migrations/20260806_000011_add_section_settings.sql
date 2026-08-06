alter table public.survey_sections
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.survey_sections.settings is
'Respondent-facing section presentation settings, including section-title visibility.';
