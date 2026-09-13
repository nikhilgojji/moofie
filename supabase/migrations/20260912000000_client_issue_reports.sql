-- Aggregate diagnostics only; no course identifiers, text, URLs, or stack traces.
create table public.client_issue_counts (
  hour timestamptz not null,
  area text not null,
  code text not null,
  kind text not null,
  device text not null,
  occurrences bigint not null default 1,
  last_seen timestamptz not null default now(),
  primary key (hour, area, code, kind, device)
);
create table public.client_issue_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  reports integer not null
);
create index client_issue_limits_window on public.client_issue_limits(window_start);
alter table public.client_issue_counts enable row level security;
alter table public.client_issue_limits enable row level security;
revoke all on public.client_issue_counts, public.client_issue_limits from anon, authenticated;
grant all on public.client_issue_counts, public.client_issue_limits to service_role;

create function public.report_client_issues(reports jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  accepted integer;
  batch_size integer;
  bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(reports) is distinct from 'array' then raise exception 'Invalid reports'; end if;
  batch_size := jsonb_array_length(reports);
  if batch_size < 1 or batch_size > 10 then raise exception 'Invalid report count'; end if;
  -- Validate the entire batch before storing anything. Arbitrary client data is rejected.
  for item in select value from jsonb_array_elements(reports) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid report'; end if;
    if not (item ?& array['area','code','kind','device'])
      or item - array['area','code','kind','device'] <> '{}'::jsonb
      or coalesce(item->>'area','') not in ('dashboard','course_resources','course_page','course_content','course_file','course_tool','assignment_details','preview','app')
      or coalesce(item->>'code','') not in ('network','timeout','unavailable','access','invalid_data','render','partial','unknown')
      or coalesce(item->>'kind','') not in ('none','pdf','image','text','html','video','audio','document','spreadsheet')
      or coalesce(item->>'device','') not in ('mobile','desktop')
    then raise exception 'Invalid report'; end if;
  end loop;
  insert into public.client_issue_limits as limits (user_id, window_start, reports)
    values (actor, bucket, batch_size)
    on conflict (user_id) do update set
      window_start = excluded.window_start,
      reports = case when limits.window_start = excluded.window_start
        then least(limits.reports + excluded.reports, 100) else excluded.reports end
    returning limits.reports into accepted;
  if accepted > 20 then return; end if;
  for item in select value from jsonb_array_elements(reports) loop
    insert into public.client_issue_counts as counts (hour, area, code, kind, device)
      values (date_trunc('hour', now()), item->>'area', item->>'code', item->>'kind', item->>'device')
      on conflict (hour, area, code, kind, device) do update
        set occurrences = counts.occurrences + 1, last_seen = now();
  end loop;
  delete from public.client_issue_counts where hour < now() - interval '30 days';
  delete from public.client_issue_limits where window_start < now() - interval '1 day';
end;
$$;
revoke all on function public.report_client_issues(jsonb) from public, anon;
grant execute on function public.report_client_issues(jsonb) to authenticated;

-- Available in the project's SQL editor / Table Editor, never exposed to users.
create view public.client_issue_dashboard with (security_invoker = true) as
  select area, code, kind, device, sum(occurrences) as reports,
    min(hour) as first_seen, max(last_seen) as last_seen
  from public.client_issue_counts where hour >= now() - interval '7 days'
  group by area, code, kind, device;
revoke all on public.client_issue_dashboard from anon, authenticated;
grant select on public.client_issue_dashboard to service_role;
