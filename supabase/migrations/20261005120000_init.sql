-- Mi Lista de Regalos
-- Ejecutar en el SQL editor de Supabase.
-- La tabla pública `profiles` es el perfil de la app. La cuenta vive en auth.users.

create extension if not exists pgcrypto;

create type public.gift_status as enum ('AVAILABLE', 'RESERVED', 'RECEIVED');
create type public.reservation_status as enum ('ACTIVE', 'CANCELLED');
create type public.gift_priority as enum ('LOW', 'MEDIUM', 'HIGH');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.gift_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  owner_name text not null,
  slug text not null unique,
  title text not null,
  description text,
  event_date date,
  cover_image text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint gift_lists_slug_format check (
    slug ~ '^[a-z0-9]+(-?[a-z0-9]+)*$'
    and char_length(slug) between 3 and 48
    and slug not in ('ingresar', 'registro', 'recuperar', 'panel', 'auth', 'cuenta', 'api')
  )
);

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.gift_lists (id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  estimated_price numeric(12, 2),
  external_url text,
  category text,
  priority public.gift_priority,
  status public.gift_status not null default 'AVAILABLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  message text,
  status public.reservation_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create unique index reservations_one_active_per_gift
  on public.reservations (gift_id)
  where status = 'ACTIVE';

create table public.gift_events (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  template text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now()
);

create index gifts_list_id_idx on public.gifts (list_id);
create index reservations_gift_id_idx on public.reservations (gift_id);
create index gift_events_gift_id_idx on public.gift_events (gift_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gifts_set_updated_at
before update on public.gifts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.log_gift_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.gift_events (gift_id, event_type, payload)
    values (new.id, 'created', jsonb_build_object('name', new.name, 'listId', new.list_id, 'to', new.status, 'detail', 'Se agregó a la lista'));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if current_setting('app.skip_status_event', true) is distinct from 'on' then
      insert into public.gift_events (gift_id, event_type, payload)
      values (
        new.id,
        'status_changed',
        jsonb_build_object('name', new.name, 'listId', new.list_id, 'from', old.status, 'to', new.status, 'detail', 'El estado cambió')
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger gifts_log_change
after insert or update on public.gifts
for each row execute function public.log_gift_change();

create or replace function public.reserve_gift(
  p_gift_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_message text,
  p_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift public.gifts%rowtype;
  v_list public.gift_lists%rowtype;
  v_reservation public.reservations%rowtype;
  v_owner_email text;
  v_phone_digits text;
begin
  if p_accepted is distinct from true then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 or char_length(trim(p_name)) > 80 then
    raise exception 'INVALID_NAME';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_phone_digits) < 8 or char_length(v_phone_digits) > 15 then
    raise exception 'INVALID_PHONE';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null
     and trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if char_length(trim(coalesce(p_message, ''))) > 400 then
    raise exception 'INVALID_MESSAGE';
  end if;

  select * into v_gift from public.gifts where id = p_gift_id for update;
  if not found then
    raise exception 'GIFT_NOT_FOUND';
  end if;

  select * into v_list from public.gift_lists where id = v_gift.list_id;
  if not found or v_list.is_public is not true then
    raise exception 'LIST_NOT_PUBLIC';
  end if;

  if v_gift.status <> 'AVAILABLE'
     or exists (
       select 1 from public.reservations
       where gift_id = p_gift_id and status = 'ACTIVE'
     ) then
    raise exception 'ALREADY_RESERVED';
  end if;

  insert into public.reservations (gift_id, name, phone, email, message, status)
  values (
    p_gift_id,
    trim(p_name),
    trim(p_phone),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_message, '')), ''),
    'ACTIVE'
  )
  returning * into v_reservation;

  perform set_config('app.skip_status_event', 'on', true);
  update public.gifts set status = 'RESERVED' where id = p_gift_id;

  insert into public.gift_events (gift_id, event_type, payload)
  values (
    p_gift_id,
    'reserved',
    jsonb_build_object(
      'name', v_gift.name,
      'listId', v_gift.list_id,
      'from', 'AVAILABLE',
      'to', 'RESERVED',
      'detail', trim(p_name) || ' lo reservó'
    )
  );

  select email into v_owner_email from public.profiles where id = v_list.user_id;

  insert into public.notification_outbox (channel, recipient, template, payload)
  values (
    'email',
    coalesce(v_owner_email, ''),
    'gift_reserved',
    jsonb_build_object(
      'person', v_reservation.name,
      'phone', v_reservation.phone,
      'email', v_reservation.email,
      'gift', v_gift.name,
      'date', v_reservation.created_at,
      'message', v_reservation.message,
      'listTitle', v_list.title
    )
  );

  return jsonb_build_object(
    'reservationId', v_reservation.id,
    'giftName', v_gift.name,
    'reservedAt', v_reservation.created_at
  );
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_gift public.gifts%rowtype;
  v_owner uuid;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found or v_reservation.status <> 'ACTIVE' then
    raise exception 'GIFT_NOT_FOUND';
  end if;

  select * into v_gift from public.gifts where id = v_reservation.gift_id for update;
  select user_id into v_owner from public.gift_lists where id = v_gift.list_id;
  if auth.uid() is distinct from v_owner then
    raise exception 'LIST_NOT_FOUND';
  end if;

  update public.reservations set status = 'CANCELLED' where id = p_reservation_id;
  perform set_config('app.skip_status_event', 'on', true);
  update public.gifts set status = 'AVAILABLE' where id = v_gift.id;

  insert into public.gift_events (gift_id, event_type, payload)
  values (
    v_gift.id,
    'cancelled',
    jsonb_build_object('name', v_gift.name, 'listId', v_gift.list_id, 'from', v_gift.status, 'to', 'AVAILABLE', 'detail', 'La reserva se canceló')
  );
end;
$$;

create or replace function public.set_gift_status(p_gift_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift public.gifts%rowtype;
  v_owner uuid;
begin
  if p_status not in ('AVAILABLE', 'RESERVED', 'RECEIVED') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_gift from public.gifts where id = p_gift_id for update;
  if not found then
    raise exception 'GIFT_NOT_FOUND';
  end if;

  select user_id into v_owner from public.gift_lists where id = v_gift.list_id;
  if auth.uid() is distinct from v_owner then
    raise exception 'LIST_NOT_FOUND';
  end if;

  if p_status = 'AVAILABLE' then
    update public.reservations
    set status = 'CANCELLED'
    where gift_id = p_gift_id and status = 'ACTIVE';
  end if;

  update public.gifts set status = p_status::public.gift_status where id = p_gift_id;
end;
$$;

revoke all on function public.reserve_gift(uuid, text, text, text, text, boolean) from public;
revoke all on function public.cancel_reservation(uuid) from public;
revoke all on function public.set_gift_status(uuid, text) from public;
grant execute on function public.reserve_gift(uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.cancel_reservation(uuid) to authenticated;
grant execute on function public.set_gift_status(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.gift_lists enable row level security;
alter table public.gifts enable row level security;
alter table public.reservations enable row level security;
alter table public.gift_events enable row level security;
alter table public.notification_outbox enable row level security;

create policy "profiles self read" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "profiles self update" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "lists readable when public or owned" on public.gift_lists
for select using (is_public or user_id = auth.uid());

create policy "owners insert lists" on public.gift_lists
for insert to authenticated with check (user_id = auth.uid());

create policy "owners update lists" on public.gift_lists
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owners delete lists" on public.gift_lists
for delete to authenticated using (user_id = auth.uid());

create policy "gifts readable when list is public or owned" on public.gifts
for select using (
  exists (
    select 1 from public.gift_lists list
    where list.id = gifts.list_id
      and (list.is_public or list.user_id = auth.uid())
  )
);

create policy "owners write gifts" on public.gifts
for all to authenticated
using (
  exists (
    select 1 from public.gift_lists list
    where list.id = gifts.list_id and list.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.gift_lists list
    where list.id = gifts.list_id and list.user_id = auth.uid()
  )
);

create policy "owners read reservations" on public.reservations
for select to authenticated using (
  exists (
    select 1
    from public.gifts gift
    join public.gift_lists list on list.id = gift.list_id
    where gift.id = reservations.gift_id
      and list.user_id = auth.uid()
  )
);

create policy "owners read gift events" on public.gift_events
for select to authenticated using (
  exists (
    select 1
    from public.gifts gift
    join public.gift_lists list on list.id = gift.list_id
    where gift.id = gift_events.gift_id
      and list.user_id = auth.uid()
  )
);

revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;
revoke all on public.notification_outbox from anon, authenticated;
revoke insert, update, delete on public.gift_events from anon, authenticated;
grant select on public.gift_events to authenticated;

insert into storage.buckets (id, name, public)
values ('gift-images', 'gift-images', true)
on conflict (id) do nothing;

create policy "public reads gift images"
on storage.objects for select
using (bucket_id = 'gift-images');

create policy "owners upload gift images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gift-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owners delete gift images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'gift-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
