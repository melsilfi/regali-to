-- Mail del invitado cuando se acepta o rechaza una sugerencia.
-- Ejecutar en el SQL editor de Supabase y volver a desplegar la función notify-reservation.

alter table public.gift_suggestions
  add column if not exists guest_email text;

drop policy if exists "guests suggest on public gifts" on public.gift_suggestions;
create policy "guests suggest on public gifts" on public.gift_suggestions
for insert to anon, authenticated
with check (
  status = 'PENDING'
  and char_length(trim(name)) >= 2
  and char_length(trim(guest_name)) >= 2
  and guest_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
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

create or replace function public.decide_gift_suggestion(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.gift_suggestions;
  v_list public.gift_lists%rowtype;
  v_gift_name text;
begin
  select * into suggestion
  from public.gift_suggestions
  where id = p_id and status = 'PENDING';

  if not found then
    raise exception 'La sugerencia ya no está pendiente.';
  end if;

  select * into v_list
  from public.gift_lists list
  where list.id = suggestion.list_id
    and list.user_id = auth.uid();

  if not found then
    raise exception 'No podés decidir esta sugerencia.';
  end if;

  select name into v_gift_name from public.gifts where id = suggestion.gift_id;

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

  if nullif(trim(coalesce(suggestion.guest_email, '')), '') is not null then
    insert into public.notification_outbox (channel, recipient, template, payload)
    values (
      'email',
      trim(suggestion.guest_email),
      case when p_accept then 'suggestion_accepted' else 'suggestion_rejected' end,
      jsonb_build_object(
        'person', suggestion.guest_name,
        'phone', '',
        'email', trim(suggestion.guest_email),
        'gift', suggestion.name,
        'date', now(),
        'message', suggestion.note,
        'listTitle', v_list.title,
        'eventDate', v_list.event_date,
        'description', v_gift_name,
        'ownerName', v_list.owner_name,
        'listSlug', v_list.slug
      )
    );
  end if;
end;
$$;
