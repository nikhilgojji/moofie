-- Only trusted Edge Functions using Supabase's service role may inspect or
-- create contact messages. Browser clients remain blocked by RLS and grants.
grant select, insert on table public.contact_messages to service_role;
grant usage, select on sequence public.contact_messages_id_seq to service_role;
