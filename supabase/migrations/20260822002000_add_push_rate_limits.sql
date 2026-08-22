alter table public.edge_rate_limits
  drop constraint if exists edge_rate_limits_action_check;

alter table public.edge_rate_limits
  add constraint edge_rate_limits_action_check
  check (
    action in (
      'dashboard',
      'connect',
      'disconnect',
      'delete_account',
      'push_config',
      'subscribe_push',
      'unsubscribe_push'
    )
  );

create or replace function public.check_edge_rate_limit(
  p_user_id uuid,
  p_action text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_count integer;
begin
  if p_user_id is null
    or p_action not in (
      'dashboard',
      'connect',
      'disconnect',
      'delete_account',
      'push_config',
      'subscribe_push',
      'unsubscribe_push'
    )
    or p_window_seconds < 1
    or p_max_requests < 1 then
    return false;
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits (user_id, action, window_start)
  values (p_user_id, p_action, current_window)
  on conflict (user_id, action, window_start)
  do update set request_count = public.edge_rate_limits.request_count + 1
  returning request_count into current_count;

  delete from public.edge_rate_limits
  where user_id = p_user_id
    and window_start < clock_timestamp() - interval '2 days';

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.check_edge_rate_limit(uuid, text, integer, integer)
  from public;
revoke all on function public.check_edge_rate_limit(uuid, text, integer, integer)
  from anon, authenticated;
grant execute on function public.check_edge_rate_limit(uuid, text, integer, integer)
  to service_role;
