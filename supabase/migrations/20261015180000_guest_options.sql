alter table public.gift_lists
  add column if not exists guest_options jsonb not null default '{"stores":[],"transfers":[]}'::jsonb;
