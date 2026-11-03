import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { channelFor, ReservationNotice } from '../_shared/channels.ts';

interface OutboxRecord {
  id: string;
  channel: string;
  recipient: string;
  template: string;
  payload: ReservationNotice;
}

Deno.serve(async (request) => {
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('No autorizado', { status: 401 });
  }

  const body = await request.json();
  const record = body.record as OutboxRecord | undefined;
  if (
    !record ||
    (record.template !== 'gift_reserved' &&
      record.template !== 'gift_reserved_guest' &&
      record.template !== 'suggestion_accepted' &&
      record.template !== 'suggestion_rejected')
  ) {
    return new Response('Ignorado', { status: 200 });
  }

  const channel = channelFor(record.channel);
  const result = channel
    ? await channel.send({ ...record.payload, recipient: record.recipient }, record.template)
    : { status: 'skipped' as const, detail: 'Canal desconocido' };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  await supabase
    .from('notification_outbox')
    .update({ status: result.status, payload: { ...record.payload, deliveryDetail: result.detail ?? null } })
    .eq('id', record.id);

  return Response.json(result);
});
