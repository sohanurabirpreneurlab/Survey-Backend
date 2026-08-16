create table if not exists invitation_access_tokens (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references survey_invitations(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint invitation_access_tokens_token_hash_unique unique (token_hash)
);

comment on table invitation_access_tokens is
'Stores one or more valid hashed access tokens for the same invitation so regenerated links do not invalidate older links.';

comment on column invitation_access_tokens.token_hash is
'SHA-256 hash of a private invitation access token. Raw link tokens are never stored.';

create index if not exists invitation_access_tokens_invitation_id_idx
  on invitation_access_tokens (invitation_id);

create index if not exists invitation_access_tokens_expires_at_idx
  on invitation_access_tokens (expires_at);

insert into invitation_access_tokens (invitation_id, token_hash, expires_at, created_at)
select id, token_hash, expires_at, created_at
from survey_invitations
on conflict (token_hash) do nothing;
