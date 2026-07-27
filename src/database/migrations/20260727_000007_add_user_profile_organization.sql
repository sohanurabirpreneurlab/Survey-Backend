alter table if exists public.user_profiles
  add column if not exists organization uuid null references public.organizations(id) on delete set null;

create index if not exists user_profiles_organization_idx
  on public.user_profiles (organization);
