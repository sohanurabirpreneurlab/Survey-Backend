alter table if exists public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table if exists public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('business_owner', 'admin'));

comment on column public.user_profiles.role is
'Application role. Supports business_owner and admin.';
