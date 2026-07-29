alter table if exists public.question_options
  add column if not exists score_value numeric null;

create index if not exists question_options_question_id_idx
  on public.question_options (question_id);

create index if not exists question_options_question_id_position_idx
  on public.question_options (question_id, position);

alter table if exists public.answers
  add column if not exists score_snapshot numeric null;

create table if not exists public.survey_calculated_scores (
  id uuid primary key default gen_random_uuid(),
  survey_version_id uuid not null references public.survey_versions(id) on delete cascade,
  name text not null,
  key text not null,
  calculation_type text not null check (calculation_type in ('average')),
  threshold_operator text not null check (
    threshold_operator in ('less_than', 'less_than_or_equal', 'equal', 'greater_than_or_equal', 'greater_than')
  ),
  threshold_value numeric not null,
  require_all_answers boolean not null default true,
  decimal_places integer not null default 2 check (decimal_places between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_calculated_scores_version_key_unique unique (survey_version_id, key)
);

create index if not exists survey_calculated_scores_survey_version_id_idx
  on public.survey_calculated_scores (survey_version_id);

create table if not exists public.survey_calculated_score_questions (
  id uuid primary key default gen_random_uuid(),
  calculated_score_id uuid not null references public.survey_calculated_scores(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  weight numeric not null default 1 check (weight > 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  constraint survey_calculated_score_questions_unique unique (calculated_score_id, question_id),
  constraint survey_calculated_score_questions_position_unique unique (calculated_score_id, position)
);

create index if not exists survey_calculated_score_questions_score_idx
  on public.survey_calculated_score_questions (calculated_score_id);

create index if not exists survey_calculated_score_questions_question_idx
  on public.survey_calculated_score_questions (question_id);

create table if not exists public.survey_score_follow_up_targets (
  id uuid primary key default gen_random_uuid(),
  calculated_score_id uuid not null references public.survey_calculated_scores(id) on delete cascade,
  target_type text not null check (target_type in ('question', 'section')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_score_follow_up_targets_unique unique (calculated_score_id, target_type, target_id)
);

create index if not exists survey_score_follow_up_targets_score_idx
  on public.survey_score_follow_up_targets (calculated_score_id);

create index if not exists survey_score_follow_up_targets_target_idx
  on public.survey_score_follow_up_targets (target_type, target_id);

create table if not exists public.survey_response_scores (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete restrict,
  calculated_score_id uuid not null references public.survey_calculated_scores(id) on delete restrict,
  score_value numeric null,
  threshold_matched boolean null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_response_scores_unique unique (response_id, calculated_score_id)
);

create index if not exists survey_response_scores_response_idx
  on public.survey_response_scores (response_id);

create index if not exists survey_response_scores_calculated_score_idx
  on public.survey_response_scores (calculated_score_id);

drop function if exists public.create_draft_from_published_version(uuid, uuid, text);

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
  insert into question_options (question_id, stable_key, label, value, score_value, position, settings)
  select
    copied_questions.new_id,
    qo.stable_key,
    qo.label,
    qo.value,
    qo.score_value,
    qo.position,
    qo.settings
  from question_options qo
  join copied_questions on copied_questions.old_id = qo.question_id;

  with copied_scores as (
    insert into survey_calculated_scores (
      survey_version_id,
      name,
      key,
      calculation_type,
      threshold_operator,
      threshold_value,
      require_all_answers,
      decimal_places
    )
    select
      v_new_version_id,
      score.name,
      score.key,
      score.calculation_type,
      score.threshold_operator,
      score.threshold_value,
      score.require_all_answers,
      score.decimal_places
    from survey_calculated_scores score
    where score.survey_version_id = v_published_version_id
    returning id, key
  ),
  old_scores as (
    select id, key
    from survey_calculated_scores
    where survey_version_id = v_published_version_id
  ),
  score_map as (
    select old_scores.id as old_id, copied_scores.id as new_id
    from old_scores
    join copied_scores on copied_scores.key = old_scores.key
  ),
  copied_questions as (
    select old_q.id as old_id, new_q.id as new_id
    from questions old_q
    join questions new_q
      on new_q.survey_version_id = v_new_version_id
     and new_q.stable_key = old_q.stable_key
    where old_q.survey_version_id = v_published_version_id
  )
  insert into survey_calculated_score_questions (calculated_score_id, question_id, weight, position)
  select
    score_map.new_id,
    copied_questions.new_id,
    score_question.weight,
    score_question.position
  from survey_calculated_score_questions score_question
  join score_map on score_map.old_id = score_question.calculated_score_id
  join copied_questions on copied_questions.old_id = score_question.question_id;

  with score_map as (
    select old_score.id as old_id, new_score.id as new_id
    from survey_calculated_scores old_score
    join survey_calculated_scores new_score
      on new_score.survey_version_id = v_new_version_id
     and new_score.key = old_score.key
    where old_score.survey_version_id = v_published_version_id
  ),
  copied_sections as (
    select old_section.id as old_id, new_section.id as new_id
    from survey_sections old_section
    join survey_sections new_section
      on new_section.survey_version_id = v_new_version_id
     and new_section.stable_key = old_section.stable_key
    where old_section.survey_version_id = v_published_version_id
  ),
  copied_questions as (
    select old_q.id as old_id, new_q.id as new_id
    from questions old_q
    join questions new_q
      on new_q.survey_version_id = v_new_version_id
     and new_q.stable_key = old_q.stable_key
    where old_q.survey_version_id = v_published_version_id
  )
  insert into survey_score_follow_up_targets (calculated_score_id, target_type, target_id)
  select
    score_map.new_id,
    target.target_type,
    case
      when target.target_type = 'section' then copied_sections.new_id
      when target.target_type = 'question' then copied_questions.new_id
      else null
    end
  from survey_score_follow_up_targets target
  join score_map on score_map.old_id = target.calculated_score_id
  left join copied_sections on copied_sections.old_id = target.target_id and target.target_type = 'section'
  left join copied_questions on copied_questions.old_id = target.target_id and target.target_type = 'question';

  update surveys
  set current_draft_version_id = v_new_version_id,
      updated_at = now()
  where id = p_survey_id;

  return query select v_new_version_id;
end;
$$;
