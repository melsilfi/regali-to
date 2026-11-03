create or replace function public.owner_record_reservation(
  p_gift_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift public.gifts%rowtype;
  v_owner uuid;
  v_phone_digits text;
begin
  if char_length(trim(coalesce(p_name, ''))) < 3 or char_length(trim(p_name)) > 80 then
    raise exception 'INVALID_NAME';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_phone_digits) < 8 or char_length(v_phone_digits) > 15 then
    raise exception 'INVALID_PHONE';
  end if;

  if char_length(trim(coalesce(p_email, ''))) > 0
    and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  if char_length(trim(coalesce(p_message, ''))) > 400 then
    raise exception 'INVALID_MESSAGE';
  end if;

  select * into v_gift from public.gifts where id = p_gift_id for update;
  if not found then
    raise exception 'GIFT_NOT_FOUND';
  end if;

  select user_id into v_owner from public.gift_lists where id = v_gift.list_id;
  if auth.uid() is distinct from v_owner then
    raise exception 'LIST_NOT_FOUND';
  end if;

  update public.reservations
  set status = 'CANCELLED'
  where gift_id = p_gift_id and status = 'ACTIVE';

  insert into public.reservations (gift_id, name, phone, email, message)
  values (
    p_gift_id,
    trim(p_name),
    trim(p_phone),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_message, '')), '')
  );

  perform set_config('app.skip_status_event', 'on', true);
  update public.gifts set status = 'RESERVED' where id = p_gift_id;

  insert into public.gift_events (gift_id, event_type, payload)
  values (
    p_gift_id,
    'reserved',
    jsonb_build_object(
      'name', v_gift.name,
      'listId', v_gift.list_id,
      'from', v_gift.status,
      'to', 'RESERVED',
      'detail', trim(p_name) || ' lo reservó'
    )
  );
end;
$$;

revoke all on function public.owner_record_reservation(uuid, text, text, text, text) from public;
grant execute on function public.owner_record_reservation(uuid, text, text, text, text) to authenticated;
