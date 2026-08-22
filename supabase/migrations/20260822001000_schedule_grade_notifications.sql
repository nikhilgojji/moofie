create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'moofie_push_cron_secret'
  ) then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'moofie_push_cron_secret',
      'Authenticates the scheduled Moofie grade notification check'
    );
  end if;
end;
$$;

create or replace function public.verify_push_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'moofie_push_cron_secret'
      and decrypted_secret = p_secret
  );
$$;

revoke all on function public.verify_push_cron_secret(text) from public;
grant execute on function public.verify_push_cron_secret(text) to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'moofie-grade-notifications';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'moofie-grade-notifications',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://pstnvuugbykeuoqwpvwe.supabase.co/functions/v1/grade-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'moofie_push_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
