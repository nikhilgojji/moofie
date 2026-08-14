-- Persist action counters so rate limits work across every Edge Function instance.
create table if not exists public.edge_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('dashboard', 'connect', 'disconnect', 'delete_account')),
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (user_id, action, window_start)
);

alter table public.edge_rate_limits enable row level security;
revoke all on table public.edge_rate_limits from anon, authenticated;

-- Atomically increment a user's counter and report whether this request is allowed.
-- SECURITY DEFINER lets only explicitly granted server code update the private table.
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
    or p_action not in ('dashboard', 'connect', 'disconnect', 'delete_account')
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

  -- Keep only recent counters for this user so the table stays small over time.
  delete from public.edge_rate_limits
  where user_id = p_user_id
    and window_start < clock_timestamp() - interval '2 days';

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.check_edge_rate_limit(uuid, text, integer, integer) from public;
revoke all on function public.check_edge_rate_limit(uuid, text, integer, integer) from anon, authenticated;
grant execute on function public.check_edge_rate_limit(uuid, text, integer, integer) to service_role;
