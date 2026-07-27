create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  action text not null,
  target_type text not null,
  target_id uuid null,
  target_label text null,
  result text not null check (result in ('success', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
create index if not exists audit_logs_target_idx on audit_logs (target_type, target_id);
create index if not exists audit_logs_actor_user_idx on audit_logs (actor_user_id);
