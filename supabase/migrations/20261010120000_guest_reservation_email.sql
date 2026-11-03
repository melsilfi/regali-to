-- El invitado también recibe un mail con el evento y el regalo que reservó.
-- Ejecutar en el SQL editor de Supabase.

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
  v_email text;
  v_payload jsonb;
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

  v_email := nullif(trim(coalesce(p_email, '')), '');
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
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
    v_email,
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

  v_payload := jsonb_build_object(
    'person', v_reservation.name,
    'phone', v_reservation.phone,
    'email', v_reservation.email,
    'gift', v_gift.name,
    'date', v_reservation.created_at,
    'message', v_reservation.message,
    'listTitle', v_list.title,
    'eventDate', v_list.event_date,
    'description', v_list.description,
    'ownerName', v_list.owner_name
  );

  insert into public.notification_outbox (channel, recipient, template, payload)
  values
    ('email', coalesce(v_owner_email, ''), 'gift_reserved', v_payload),
    ('email', v_email, 'gift_reserved_guest', v_payload);

  return jsonb_build_object(
    'reservationId', v_reservation.id,
    'giftName', v_gift.name,
    'reservedAt', v_reservation.created_at
  );
end;
$$;
