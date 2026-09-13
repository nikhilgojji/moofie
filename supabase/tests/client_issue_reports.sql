-- Run with `supabase db query --linked --file supabase/tests/client_issue_reports.sql`.
-- Uses a temporary synthetic account; all writes roll back, including aggregates.
begin;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
insert into auth.users(id) values (auth.uid());
create temporary table issue_baseline as select coalesce(sum(occurrences), 0) as count
  from public.client_issue_counts where hour = date_trunc('hour', now())
  and area = 'preview' and code = 'render' and kind = 'pdf' and device = 'mobile';

set local role authenticated;
do $$
declare event jsonb := '{"area":"preview","code":"render","kind":"pdf","device":"mobile"}';
begin
  for i in 1..25 loop perform public.report_client_issues(jsonb_build_array(event)); end loop;
  begin
    perform public.report_client_issues(jsonb_build_array(event || '{"message":"private data"}'::jsonb));
    raise exception 'TEST FAILED: arbitrary data accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid report' then raise; end if;
  end;
  begin
    perform public.report_client_issues('[{"area":null,"code":"render","kind":"pdf","device":"mobile"}]'::jsonb);
    raise exception 'TEST FAILED: null category accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid report' then raise; end if;
  end;
  begin
    perform public.report_client_issues('[]'::jsonb);
    raise exception 'TEST FAILED: empty batch accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid report count' then raise; end if;
  end;
  begin
    perform 1 from public.client_issue_dashboard limit 1;
    raise exception 'TEST FAILED: user can read dashboard';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.client_issue_counts values (now(), 'app', 'render', 'none', 'mobile', 1, now());
    raise exception 'TEST FAILED: user can bypass collector';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
declare current_count bigint; baseline bigint;
begin
  select count into baseline from issue_baseline;
  select sum(occurrences) into current_count from public.client_issue_counts
    where hour = date_trunc('hour', now()) and area = 'preview' and code = 'render' and kind = 'pdf' and device = 'mobile';
  if current_count - baseline <> 20 then raise exception 'TEST FAILED: rate limit or ingestion'; end if;
  if has_function_privilege('anon', 'public.report_client_issues(jsonb)', 'execute') then raise exception 'TEST FAILED: anonymous execution'; end if;
  if has_table_privilege('authenticated', 'public.client_issue_limits', 'select') then raise exception 'TEST FAILED: counters exposed'; end if;
end;
$$;
rollback;
select 'Collector ingestion, rate limit, privacy validation and access checks passed; test writes rolled back.' as result;
