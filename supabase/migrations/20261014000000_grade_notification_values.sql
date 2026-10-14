-- Keep the displayed grade as well as points, so letter/pass-fail changes count.
-- assignment_id = 0 stores the overall course grade (Canvas assignment IDs are positive).
alter table public.grade_notification_state add column if not exists grade text;
alter table public.grade_notification_runs add column if not exists snapshot_version integer not null default 1;
