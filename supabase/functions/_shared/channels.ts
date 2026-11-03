export interface ReservationNotice {
  recipient: string;
  person: string;
  phone: string;
  email: string | null;
  gift: string;
  date: string;
  message: string | null;
  listTitle: string;
  eventDate?: string | null;
  description?: string | null;
  ownerName?: string | null;
  listSlug?: string | null;
}

export interface DeliveryResult {
  status: 'sent' | 'failed' | 'skipped';
  detail?: string;
}

export interface NotificationChannel {
  readonly id: 'email' | 'whatsapp';
  send(notice: ReservationNotice, template: string): Promise<DeliveryResult>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export class EmailChannel implements NotificationChannel {
  readonly id = 'email' as const;

  async send(notice: ReservationNotice, template: string): Promise<DeliveryResult> {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!apiKey || !from || !notice.recipient) {
      return { status: 'skipped', detail: 'Email no configurado' };
    }

    const when = new Date(notice.date).toLocaleString('es-AR', { hour12: false });
    const eventDate = notice.eventDate
      ? new Date(`${notice.eventDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Fecha a confirmar';
    const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
    const listUrl = site && notice.listSlug ? `${site}/${notice.listSlug}` : '';
    const suggestion = template === 'suggestion_accepted' || template === 'suggestion_rejected';
    const accepted = template === 'suggestion_accepted';
    const guest = template === 'gift_reserved_guest';
    const subject = suggestion
      ? accepted
        ? `Aceptaron tu sugerencia en ${notice.listTitle}`
        : `Sobre tu sugerencia en ${notice.listTitle}`
      : guest
        ? `Reservaste ${notice.gift}`
        : `Nuevo regalo reservado: ${notice.gift}`;
    const html = suggestion
      ? `
          <h1>${accepted ? 'Aceptaron tu sugerencia' : 'No van a cambiar el regalo'}</h1>
          <p>Hola ${escapeHtml(notice.person)}, ${
            accepted
              ? `aceptaron tu sugerencia de <strong>${escapeHtml(notice.gift)}</strong> en la lista <strong>${escapeHtml(notice.listTitle)}</strong>. El regalo ya está actualizado.`
              : `revisaron tu sugerencia de <strong>${escapeHtml(notice.gift)}</strong> en la lista <strong>${escapeHtml(notice.listTitle)}</strong> y van a dejar el regalo como estaba.`
          }</p>
          <p>${listUrl ? `<a href="${escapeHtml(listUrl)}">Abrí la lista de nuevo</a>` : 'Volvé a abrir el link de la lista'} para ver cómo quedó.</p>
        `
      : guest
        ? `
          <h1>Reservaste un regalo</h1>
          <p>Hola ${escapeHtml(notice.person)}, confirmamos que te comprometiste a comprar <strong>${escapeHtml(notice.gift)}</strong>.</p>
          <p><strong>Evento:</strong> ${escapeHtml(notice.listTitle)}</p>
          <p><strong>De:</strong> ${escapeHtml(notice.ownerName ?? notice.listTitle)}</p>
          <p><strong>Fecha del evento:</strong> ${escapeHtml(eventDate)}</p>
          <p><strong>Reserva:</strong> ${escapeHtml(when)}</p>
          ${notice.description ? `<p>${escapeHtml(notice.description)}</p>` : ''}
          <p>Gracias. El regalo quedó reservado a tu nombre para que otra persona no elija el mismo.</p>
        `
        : `
          <h1>Nuevo regalo reservado</h1>
          <p><strong>Persona:</strong> ${escapeHtml(notice.person)}</p>
          <p><strong>Teléfono:</strong> ${escapeHtml(notice.phone)}</p>
          <p><strong>Email:</strong> ${escapeHtml(notice.email ?? '—')}</p>
          <p><strong>Regalo:</strong> ${escapeHtml(notice.gift)}</p>
          <p><strong>Fecha:</strong> ${escapeHtml(when)}</p>
          <p><strong>Mensaje:</strong> ${escapeHtml(notice.message ?? '—')}</p>
        `;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [notice.recipient],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      return { status: 'failed', detail: await response.text() };
    }
    return { status: 'sent' };
  }
}

export class WhatsAppChannel implements NotificationChannel {
  readonly id = 'whatsapp' as const;

  send(_notice: ReservationNotice, _template: string): Promise<DeliveryResult> {
    return Promise.resolve({
      status: 'skipped',
      detail: 'WhatsApp queda preparado como canal y todavía no está conectado.',
    });
  }
}

export function channelFor(id: string): NotificationChannel | null {
  if (id === 'email') return new EmailChannel();
  if (id === 'whatsapp') return new WhatsAppChannel();
  return null;
}
