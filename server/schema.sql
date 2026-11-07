create extension if not exists pgcrypto;

do $$ begin
  create type gift_status as enum ('AVAILABLE', 'RESERVED', 'RECEIVED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type reservation_status as enum ('ACTIVE', 'CANCELLED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type gift_priority as enum ('LOW', 'MEDIUM', 'HIGH');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text,
  google_sub text unique,
  created_at timestamptz not null default now()
);

alter table users alter column password_hash drop not null;
alter table users add column if not exists google_sub text;
create unique index if not exists users_google_sub_idx on users (google_sub) where google_sub is not null;

create table if not exists password_resets (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists gift_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  owner_name text not null,
  slug text not null unique,
  title text not null,
  description text,
  event_date date,
  cover_image text,
  is_public boolean not null default true,
  guest_options jsonb not null default '{"stores":[],"transfers":[]}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gift_lists_slug_format check (
    slug ~ '^[a-z0-9]+(-?[a-z0-9]+)*$'
    and char_length(slug) between 3 and 48
    and slug not in ('ingresar', 'registro', 'recuperar', 'panel', 'auth', 'cuenta', 'api')
  )
);

create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references gift_lists (id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  estimated_price numeric(12, 2),
  external_url text,
  category text,
  priority gift_priority,
  status gift_status not null default 'AVAILABLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references gifts (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  message text,
  status reservation_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create unique index if not exists reservations_one_active_per_gift
  on reservations (gift_id)
  where status = 'ACTIVE';

create table if not exists gift_events (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references gifts (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists gift_suggestions (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references gifts (id) on delete cascade,
  list_id uuid not null references gift_lists (id) on delete cascade,
  name text not null,
  url text,
  price numeric(12, 2),
  note text,
  guest_name text not null,
  guest_email text,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at timestamptz not null default now()
);

create table if not exists store_visits (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references gift_lists (id) on delete cascade,
  store_name text not null,
  buyer text not null,
  amount text not null,
  note text not null,
  dedication text,
  created_at timestamptz not null default now()
);

create table if not exists transfer_notices (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references gift_lists (id) on delete cascade,
  destination text not null,
  buyer text not null,
  dedication text,
  created_at timestamptz not null default now()
);

create table if not exists uploads (
  filename text primary key,
  mime text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  template text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now()
);

alter table notification_outbox add column if not exists attempts integer not null default 0;

create index if not exists gifts_list_id_idx on gifts (list_id);
create index if not exists reservations_gift_id_idx on reservations (gift_id);
create index if not exists gift_events_gift_id_idx on gift_events (gift_id);
create index if not exists gift_suggestions_list_id_idx on gift_suggestions (list_id);
create index if not exists store_visits_list_id_idx on store_visits (list_id);
create index if not exists transfer_notices_list_id_idx on transfer_notices (list_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gifts_set_updated_at on gifts;
create trigger gifts_set_updated_at
before update on gifts
for each row execute function set_updated_at();

create or replace function log_gift_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into gift_events (gift_id, event_type, payload)
    values (new.id, 'created', jsonb_build_object('name', new.name, 'listId', new.list_id, 'to', new.status, 'detail', 'Se agregó a la lista'));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if current_setting('app.skip_status_event', true) is distinct from 'on' then
      insert into gift_events (gift_id, event_type, payload)
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

drop trigger if exists gifts_log_change on gifts;
create trigger gifts_log_change
after insert or update on gifts
for each row execute function log_gift_change();
