create table if not exists public.gift_suggestions (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts (id) on delete cascade,
  list_id uuid not null references public.gift_lists (id) on delete cascade,
  name text not null,
  url text,
  price numeric(12, 2),
  note text,
  guest_name text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at timestamptz not null default now()
);

create index if not exists gift_suggestions_list_id_idx on public.gift_suggestions (list_id);

alter table public.gift_suggestions enable row level security;

drop policy if exists "guests suggest on public gifts" on public.gift_suggestions;
create policy "guests suggest on public gifts" on public.gift_suggestions
for insert to anon, authenticated
with check (
  status = 'PENDING'
  and char_length(trim(name)) >= 2
  and char_length(trim(guest_name)) >= 2
  and exists (
    select 1
    from public.gifts gift
    join public.gift_lists list on list.id = gift.list_id
    where gift.id = gift_suggestions.gift_id
      and list.id = gift_suggestions.list_id
      and list.is_public
      and gift.status <> 'RECEIVED'
  )
);

drop policy if exists "owners read suggestions" on public.gift_suggestions;
create policy "owners read suggestions" on public.gift_suggestions
for select to authenticated using (
  exists (
    select 1
    from public.gift_lists list
    where list.id = gift_suggestions.list_id
      and list.user_id = auth.uid()
  )
);

revoke all on public.gift_suggestions from anon, authenticated;
grant insert on public.gift_suggestions to anon, authenticated;
grant select on public.gift_suggestions to authenticated;

create or replace function public.decide_gift_suggestion(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.gift_suggestions;
begin
  select * into suggestion
  from public.gift_suggestions
  where id = p_id and status = 'PENDING';

  if not found then
    raise exception 'La sugerencia ya no está pendiente.';
  end if;

  if not exists (
    select 1
    from public.gift_lists list
    where list.id = suggestion.list_id
      and list.user_id = auth.uid()
  ) then
    raise exception 'No podés decidir esta sugerencia.';
  end if;

  if p_accept then
    update public.gifts
    set
      name = suggestion.name,
      external_url = coalesce(suggestion.url, external_url),
      estimated_price = coalesce(suggestion.price, estimated_price)
    where id = suggestion.gift_id;

    update public.gift_suggestions
    set status = 'ACCEPTED'
    where id = suggestion.id;
  else
    update public.gift_suggestions
    set status = 'REJECTED'
    where id = suggestion.id;
  end if;
end;
$$;

revoke all on function public.decide_gift_suggestion(uuid, boolean) from public;
grant execute on function public.decide_gift_suggestion(uuid, boolean) to authenticated;
