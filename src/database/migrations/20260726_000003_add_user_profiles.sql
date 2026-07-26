create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
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
'Stores application-specific user information and manual account approval status. Authentication credentials remain managed by Supabase Auth.';

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
