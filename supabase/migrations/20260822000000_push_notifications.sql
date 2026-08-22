create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

create table if not exists public.grade_notification_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id bigint not null,
  assignment_id bigint not null,
  course_name text not null,
  assignment_title text not null,
  score numeric,
  points_possible numeric,
  graded_at timestamptz,
  html_url text,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, assignment_id)
);

create table if not exists public.grade_notification_runs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_checked_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.grade_notification_state enable row level security;
alter table public.grade_notification_runs enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.grade_notification_state from anon, authenticated;
revoke all on public.grade_notification_runs from anon, authenticated;

grant all on public.push_subscriptions to service_role;
grant all on public.grade_notification_state to service_role;
grant all on public.grade_notification_runs to service_role;
