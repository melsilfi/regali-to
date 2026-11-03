create table public.store_visits (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.gift_lists (id) on delete cascade,
  store_name text not null,
  buyer text not null,
  amount text not null,
  note text not null,
  dedication text,
  created_at timestamptz not null default now()
);

create table public.transfer_notices (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.gift_lists (id) on delete cascade,
  destination text not null,
  buyer text not null,
  dedication text,
  created_at timestamptz not null default now()
);

create index store_visits_list_id_idx on public.store_visits (list_id);
create index transfer_notices_list_id_idx on public.transfer_notices (list_id);

alter table public.store_visits enable row level security;
alter table public.transfer_notices enable row level security;

create policy "guests record store visits" on public.store_visits
for insert to anon, authenticated
with check (
  char_length(trim(buyer)) >= 3
  and char_length(trim(store_name)) >= 1
  and char_length(trim(note)) >= 2
  and exists (
    select 1 from public.gift_lists list
    where list.id = store_visits.list_id
      and list.is_public
  )
);

create policy "owners read store visits" on public.store_visits
for select to authenticated using (
  exists (
    select 1 from public.gift_lists list
    where list.id = store_visits.list_id
      and list.user_id = auth.uid()
  )
);

create policy "guests record transfer notices" on public.transfer_notices
for insert to anon, authenticated
with check (
  char_length(trim(buyer)) >= 3
  and char_length(trim(destination)) >= 1
  and exists (
    select 1 from public.gift_lists list
    where list.id = transfer_notices.list_id
      and list.is_public
  )
);

create policy "owners read transfer notices" on public.transfer_notices
for select to authenticated using (
  exists (
    select 1 from public.gift_lists list
    where list.id = transfer_notices.list_id
      and list.user_id = auth.uid()
  )
);

revoke all on public.store_visits from anon, authenticated;
revoke all on public.transfer_notices from anon, authenticated;
grant insert on public.store_visits to anon, authenticated;
grant select on public.store_visits to authenticated;
grant insert on public.transfer_notices to anon, authenticated;
grant select on public.transfer_notices to authenticated;
