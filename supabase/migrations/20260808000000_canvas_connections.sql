-- Store one encrypted Canvas connection per Supabase user. Deleting the user
-- cascades to this row so credentials cannot become orphaned.
create table if not exists public.canvas_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  canvas_url text not null,
  encrypted_token text not null,
  token_iv text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS plus revoked grants prevents browser clients from reading encrypted tokens.
alter table public.canvas_connections enable row level security;

-- No client policies are intentional. Only the Edge Function's service-role
-- client may read or write encrypted Canvas connections.
revoke all on table public.canvas_connections from anon, authenticated;
