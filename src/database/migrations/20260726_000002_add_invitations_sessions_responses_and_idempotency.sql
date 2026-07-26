create table if not exists survey_invitations (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete restrict,
  recipient_email_ciphertext text null,
  recipient_email_hash text not null,
  token_hash text not null,
  status text not null check (
    status in (
      'pending',
      'sent',
      'delivered',
      'opened',
      'started',
      'completed',
      'bounced',
      'failed',
      'revoked',
      'expired'
    )
  ),
  max_responses integer not null default 1 check (max_responses > 0),
  response_count integer not null default 0 check (response_count >= 0 and response_count <= max_responses),
  expires_at timestamptz null,
  first_opened_at timestamptz null,
  last_opened_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_invitations_token_hash_unique unique (token_hash)
);

comment on table survey_invitations is
'Stores secure invite-only survey access records. Raw invitation tokens are never stored here.';

comment on column survey_invitations.recipient_email_hash is
'HMAC-based normalized email lookup hash used for duplicate detection without exposing plaintext emails.';

comment on column survey_invitations.recipient_email_ciphertext is
'Encrypted email payload used only when the system must display or resend to the recipient.';

comment on column survey_invitations.token_hash is
'SHA-256 hash of the invitation token. A database leak must not reveal working invitation URLs.';

create index survey_invitations_survey_id_idx on survey_invitations (survey_id);
create index survey_invitations_survey_email_hash_idx on survey_invitations (survey_id, recipient_email_hash);
create index survey_invitations_status_idx on survey_invitations (status);
create index survey_invitations_expires_at_idx on survey_invitations (expires_at);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete restrict,
  name text not null,
  status text not null check (status in ('draft', 'running', 'completed', 'failed')),
  created_by uuid not null,
  scheduled_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  total_recipients integer not null default 0 check (total_recipients >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table email_campaigns is
'Stores lightweight invitation email batch metadata without introducing a full background campaign engine.';

create table if not exists email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid null references email_campaigns(id) on delete set null,
  invitation_id uuid not null references survey_invitations(id) on delete restrict,
  provider text not null,
  provider_message_id text null,
  status text not null check (
    status in ('pending', 'sent', 'delivered', 'bounced', 'failed', 'complained', 'blocked')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz null,
  sent_at timestamptz null,
  delivered_at timestamptz null,
  bounced_at timestamptz null,
  failed_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table email_deliveries is
'Tracks provider delivery outcomes without storing raw invitation URLs or tokens.';

create index email_deliveries_invitation_id_idx on email_deliveries (invitation_id);
create index email_deliveries_provider_message_id_idx on email_deliveries (provider_message_id);
create index email_deliveries_status_idx on email_deliveries (status);

create table if not exists respondent_sessions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete restrict,
  invitation_id uuid not null references survey_invitations(id) on delete restrict,
  session_token_hash text not null,
  status text not null check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint respondent_sessions_token_hash_unique unique (session_token_hash),
  constraint respondent_sessions_expiry_check check (expires_at > created_at)
);

comment on table respondent_sessions is
'Stores temporary respondent sessions issued after a valid invitation token exchange. Raw session tokens are never stored.';

create index respondent_sessions_invitation_id_idx on respondent_sessions (invitation_id);
create index respondent_sessions_survey_id_idx on respondent_sessions (survey_id);
create index respondent_sessions_expires_at_idx on respondent_sessions (expires_at);

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete restrict,
  survey_version_id uuid not null references survey_versions(id) on delete restrict,
  invitation_id uuid not null references survey_invitations(id) on delete restrict,
  respondent_session_id uuid not null references respondent_sessions(id) on delete restrict,
  status text not null check (status in ('in_progress', 'submitted', 'invalidated', 'deleted')),
  revision integer not null default 1 check (revision > 0),
  started_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_responses_submitted_at_check check (
    (status = 'submitted' and submitted_at is not null)
    or (status <> 'submitted')
  )
);

comment on table survey_responses is
'Stores one respondent response record bound to the exact survey version the respondent started with.';

comment on column survey_responses.survey_version_id is
'A response must stay attached to its original survey definition even if a newer version is published later.';

create index survey_responses_survey_id_idx on survey_responses (survey_id);
create index survey_responses_survey_version_id_idx on survey_responses (survey_version_id);
create index survey_responses_invitation_id_idx on survey_responses (invitation_id);
create index survey_responses_session_id_idx on survey_responses (respondent_session_id);
create index survey_responses_status_idx on survey_responses (status);
create index survey_responses_submitted_at_idx on survey_responses (submitted_at);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references survey_responses(id) on delete restrict,
  question_id uuid not null references questions(id) on delete restrict,
  question_stable_key text not null,
  value_text text null,
  value_number numeric null,
  value_boolean boolean null,
  value_date date null,
  value_timestamp timestamptz null,
  value_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint answers_response_question_unique unique (response_id, question_id)
);

comment on table answers is
'Stores canonical answer rows. Raw answers remain the source of truth for results and can be re-aggregated.';

create index answers_response_id_idx on answers (response_id);
create index answers_question_id_idx on answers (question_id);

create table if not exists answer_choices (
  answer_id uuid not null references answers(id) on delete restrict,
  option_id uuid not null references question_options(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (answer_id, option_id)
);

comment on table answer_choices is
'Stores selected options for multi-select and vote-style answers instead of relying on counters alone.';

create index answer_choices_option_id_idx on answer_choices (option_id);

create table if not exists idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  response_status integer null,
  response_body jsonb null,
  resource_id uuid null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotency_records_scope_key_unique unique (scope, idempotency_key)
);

comment on table idempotency_records is
'Stores safe retry state for non-idempotent submission endpoints so clients can retry without creating duplicate submissions.';

create index idempotency_records_expires_at_idx on idempotency_records (expires_at);

create or replace function submit_survey_response(
  p_response_id uuid,
  p_session_id uuid
)
returns table (
  response_id uuid,
  invitation_id uuid,
  response_status text,
  response_revision integer,
  submitted_at timestamptz
)
language plpgsql
as $$
declare
  v_response survey_responses%rowtype;
  v_invitation survey_invitations%rowtype;
  v_required_question_count integer;
  v_answered_required_question_count integer;
begin
  select *
    into v_response
  from survey_responses
  where id = p_response_id
  for update;

  if not found then
    raise exception 'response not found';
  end if;

  if v_response.respondent_session_id <> p_session_id then
    raise exception 'response does not belong to session';
  end if;

  if v_response.status = 'submitted' then
    return query
    select v_response.id, v_response.invitation_id, v_response.status, v_response.revision, v_response.submitted_at;
    return;
  end if;

  select *
    into v_invitation
  from survey_invitations
  where id = v_response.invitation_id
  for update;

  if not found then
    raise exception 'invitation not found';
  end if;

  if v_invitation.revoked_at is not null then
    raise exception 'invitation revoked';
  end if;

  if v_invitation.expires_at is not null and v_invitation.expires_at <= now() then
    raise exception 'invitation expired';
  end if;

  if v_invitation.response_count >= v_invitation.max_responses then
    raise exception 'invitation limit reached';
  end if;

  select count(*)
    into v_required_question_count
  from questions
  where survey_version_id = v_response.survey_version_id
    and required = true;

  select count(distinct q.id)
    into v_answered_required_question_count
  from questions q
  join answers a
    on a.question_id = q.id
   and a.response_id = v_response.id
  where q.survey_version_id = v_response.survey_version_id
    and q.required = true
    and (
      a.value_text is not null
      or a.value_number is not null
      or a.value_boolean is not null
      or a.value_date is not null
      or a.value_timestamp is not null
      or a.value_json is not null
      or exists (select 1 from answer_choices ac where ac.answer_id = a.id)
    );

  if v_required_question_count <> v_answered_required_question_count then
    raise exception 'required answers missing';
  end if;

  update survey_responses
  set status = 'submitted',
      submitted_at = now(),
      updated_at = now(),
      last_saved_at = now()
  where id = v_response.id
  returning *
  into v_response;

  update survey_invitations
  set response_count = response_count + 1,
      status = case
        when response_count + 1 >= max_responses then 'completed'
        else 'completed'
      end,
      completed_at = now(),
      updated_at = now()
  where id = v_invitation.id
  returning *
  into v_invitation;

  return query
  select v_response.id, v_invitation.id, v_response.status, v_response.revision, v_response.submitted_at;
end;
$$;

comment on function submit_survey_response(uuid, uuid) is
'Atomically validates and submits one in-progress response so duplicate concurrent submissions cannot both succeed.';
