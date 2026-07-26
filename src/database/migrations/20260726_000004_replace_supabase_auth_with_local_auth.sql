create table if not exists public.app_users (
  id uuid primary key,
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_email_unique_idx
  on public.app_users (lower(email));

comment on table public.app_users is
'Stores local authentication credentials for business-owner accounts.';

comment on column public.app_users.password_hash is
'Scrypt password hash for local email/password authentication.';

create table if not exists public.auth_sessions (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  refresh_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists auth_sessions_refresh_token_hash_unique_idx
  on public.auth_sessions (refresh_token_hash);

create index if not exists auth_sessions_user_id_idx
  on public.auth_sessions (user_id);

comment on table public.auth_sessions is
'Stores refresh-token backed login sessions for local authentication.';

alter table if exists public.user_profiles
  drop constraint if exists user_profiles_user_id_fkey;

alter table if exists public.user_profiles
  add constraint user_profiles_user_id_fkey
  foreign key (user_id)
  references public.app_users(id)
  on delete cascade
  not valid;

comment on table public.user_profiles is
'Stores application-specific user information and manual account approval status. Authentication credentials remain managed in public.app_users.';
