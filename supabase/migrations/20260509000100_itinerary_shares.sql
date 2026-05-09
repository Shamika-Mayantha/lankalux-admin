-- Public itinerary shares: stable links per send
-- Run in Supabase SQL editor if migrations are not applied automatically.

create table if not exists public.itinerary_shares (
  share_token text primary key,
  request_id uuid not null,
  option_index integer,
  itinerary_data jsonb not null,
  send_options jsonb,
  created_at timestamptz not null default now()
);

create index if not exists itinerary_shares_request_id_idx on public.itinerary_shares (request_id);

-- Public read (link-only access via share_token). Writes should be server-side using service role.
alter table public.itinerary_shares enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'itinerary_shares' and policyname = 'Public read itinerary shares'
  ) then
    execute $p$
      create policy "Public read itinerary shares"
      on public.itinerary_shares
      for select
      using (true)
    $p$;
  end if;
end $$;

