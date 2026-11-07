import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import pg from 'pg';

const { Pool } = pg;
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const uploadDir = process.env.UPLOAD_DIR || path.join(root, 'uploads');
const staticDir = process.env.STATIC_DIR || '';

if (!databaseUrl) {
  console.error('Falta DATABASE_URL. En Railway es la variable del Postgres.');
  process.exit(1);
}
if (!jwtSecret) {
  console.error('Falta JWT_SECRET. Generá un texto largo y secreto en las variables del servicio.');
  process.exit(1);
}

pg.types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(databaseUrl) ? false : { rejectUnauthorized: false },
});

const app = express();
app.use(express.json({ limit: '1mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function fail(response, status, message) {
  response.status(status).json({ message });
}

function userFrom(request) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

function requireUser(request, response) {
  const user = userFrom(request);
  if (!user) {
    fail(response, 401, 'Necesitás iniciar sesión.');
    return null;
  }
  return user;
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, jwtSecret, { expiresIn: '30d' });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

async function ownList(userId, listId) {
  const { rows } = await pool.query('select * from gift_lists where id = $1 and user_id = $2', [listId, userId]);
  return rows[0] ?? null;
}

async function giftWithList(giftId) {
  const { rows } = await pool.query(
    `select gift.*, list.user_id, list.is_public, list.title as list_title, list.slug as list_slug,
            list.event_date, list.owner_name, owner.email as owner_email
     from gifts gift
     join gift_lists list on list.id = gift.list_id
     join users owner on owner.id = list.user_id
     where gift.id = $1`,
    [giftId],
  );
  return rows[0] ?? null;
}

function queueMail(client, recipient, template, payload) {
  if (!recipient) return Promise.resolve();
  return client.query(
    `insert into notification_outbox (channel, recipient, template, payload) values ('email', $1, $2, $3)`,
    [recipient, template, payload],
  );
}

app.post('/api/auth/register', async (request, response) => {
  const name = `${request.body?.name ?? ''}`.trim();
  const email = `${request.body?.email ?? ''}`.trim().toLowerCase();
  const password = `${request.body?.password ?? ''}`;
  if (name.length < 2) return fail(response, 400, 'Ingresá tu nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(response, 400, 'Ingresá un email válido.');
  if (password.length < 6) return fail(response, 400, 'La contraseña necesita al menos 6 caracteres.');
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'insert into users (name, email, password_hash) values ($1, $2, $3) returning id, name, email',
      [name, email, passwordHash],
    );
    const user = rows[0];
    response.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return fail(response, 400, 'Ese email ya tiene una cuenta.');
    console.error(error);
    fail(response, 500, 'No pudimos crear la cuenta.');
  }
});

app.post('/api/auth/login', async (request, response) => {
  const email = `${request.body?.email ?? ''}`.trim().toLowerCase();
  const password = `${request.body?.password ?? ''}`;
  const { rows } = await pool.query('select * from users where email = $1', [email]);
  const user = rows[0];
  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return fail(response, 401, 'Email o contraseña incorrectos.');
  }
  response.json({ token: tokenFor(user), user: publicUser(user) });
});

app.get('/api/auth/google', (request, response) => {
  const site = env('SITE_URL').replace(/\/$/, '');
  if (!site || !env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET')) {
    return response.redirect(`${site || ''}/auth/callback?error_description=${encodeURIComponent('El ingreso con Google no está configurado.')}`);
  }
  const state = jwt.sign({ purpose: 'google' }, jwtSecret, { expiresIn: '10m' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env('GOOGLE_CLIENT_ID'));
  url.searchParams.set('redirect_uri', `${site}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  response.redirect(url.toString());
});

app.get('/api/auth/google/callback', async (request, response) => {
  const site = env('SITE_URL').replace(/\/$/, '');
  const back = (message) => response.redirect(`${site}/auth/callback?error_description=${encodeURIComponent(message)}`);
  try {
    const state = jwt.verify(`${request.query.state ?? ''}`, jwtSecret);
    if (!state || typeof state === 'string' || state.purpose !== 'google') return back('El ingreso con Google venció. Probá de nuevo.');
    const code = `${request.query.code ?? ''}`;
    if (!code) return back('Google no devolvió el ingreso.');
    const redirectUri = `${site}/api/auth/google/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) return back('Google no confirmó el ingreso.');
    const tokens = await tokenResponse.json();
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) return back('No pudimos leer la cuenta de Google.');
    const profile = await profileResponse.json();
    const email = `${profile.email ?? ''}`.trim().toLowerCase();
    if (!email || profile.email_verified === false) return back('Google no confirmó el email.');
    const name = `${profile.name ?? email.split('@')[0]}`.trim() || email;
    const existing = await pool.query('select id, name, email from users where email = $1', [email]);
    let user = existing.rows[0];
    if (user) {
      await pool.query('update users set google_sub = $2 where id = $1 and google_sub is null', [user.id, profile.sub]);
    } else {
      const inserted = await pool.query(
        'insert into users (name, email, google_sub) values ($1, $2, $3) returning id, name, email',
        [name, email, profile.sub],
      );
      user = inserted.rows[0];
    }
    response.redirect(`${site}/auth/callback#token=${encodeURIComponent(tokenFor(user))}`);
  } catch (error) {
    console.error(error);
    back('No pudimos completar el ingreso con Google.');
  }
});

app.get('/api/auth/me', async (request, response) => {
  const session = requireUser(request, response);
  if (!session) return;
  const { rows } = await pool.query('select id, name, email from users where id = $1', [session.id]);
  if (!rows[0]) return fail(response, 401, 'Necesitás iniciar sesión.');
  response.json(publicUser(rows[0]));
});

app.post('/api/auth/forgot', async (request, response) => {
  const email = `${request.body?.email ?? ''}`.trim().toLowerCase();
  const { rows } = await pool.query('select id, name, email from users where email = $1', [email]);
  const user = rows[0];
  if (user && env('RESEND_API_KEY') && env('EMAIL_FROM') && env('SITE_URL')) {
    const token = randomBytes(24).toString('hex');
    await pool.query('insert into password_resets (token, user_id, expires_at) values ($1, $2, now() + interval \'2 hours\')', [
      token,
      user.id,
    ]);
    const link = `${env('SITE_URL').replace(/\/$/, '')}/recuperar?token=${token}`;
    try {
      await sendMail(
        user.email,
        'Recuperar tu contraseña',
        mailLayout({
          kicker: 'Cuenta',
          title: 'Elegí una contraseña nueva',
          body: `<p style="margin:0;">Hola ${escapeHtml(user.name)}, recibimos un pedido para cambiar tu contraseña. El enlace vence en 2 horas.</p>`,
          action: { href: link, label: 'Cambiar contraseña' },
        }),
      );
    } catch (error) {
      console.error('No se pudo enviar el mail para recuperar la contraseña.', error instanceof Error ? error.message : error);
    }
  }
  response.json({ ok: true });
});

app.post('/api/auth/password', async (request, response) => {
  const token = `${request.body?.token ?? ''}`;
  const password = `${request.body?.password ?? ''}`;
  if (password.length < 6) return fail(response, 400, 'La contraseña necesita al menos 6 caracteres.');
  const { rows } = await pool.query(
    'select user_id from password_resets where token = $1 and expires_at > now()',
    [token],
  );
  if (!rows[0]) return fail(response, 400, 'El enlace para cambiar la contraseña venció. Pedí otro.');
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('update users set password_hash = $1 where id = $2', [passwordHash, rows[0].user_id]);
  await pool.query('delete from password_resets where user_id = $1', [rows[0].user_id]);
  response.json({ ok: true });
});

app.get('/api/lists', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const { rows } = await pool.query('select * from gift_lists where user_id = $1 order by created_at desc', [user.id]);
  response.json(rows.map(withPublicImages));
});

app.get('/api/lists/public/:slug', async (request, response) => {
  const { rows } = await pool.query('select * from gift_lists where slug = $1 and is_public = true', [request.params.slug]);
  response.json(withPublicImages(rows[0] ?? null));
});

app.post('/api/lists', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const count = await pool.query('select count(*)::int as total from gift_lists where user_id = $1', [user.id]);
  if (count.rows[0].total >= 5) {
    return fail(response, 400, 'Podés tener hasta 5 listas. Para crear otra, borrá una de las que ya tenés.');
  }
  const input = listInput(request.body);
  if (input.error) return fail(response, 400, input.error);
  try {
    const { rows } = await pool.query(
      `insert into gift_lists (user_id, owner_name, slug, title, description, event_date, cover_image, guest_options)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [user.id, input.ownerName, input.slug, input.title, input.description, input.eventDate, input.coverImage, input.guestOptions],
    );
    response.json(withPublicImages(rows[0]));
  } catch (error) {
    fail(response, 400, sqlMessage(error));
  }
});

app.patch('/api/lists/:id', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const input = listInput(request.body);
  if (input.error) return fail(response, 400, input.error);
  try {
    const { rows } = await pool.query(
      `update gift_lists
       set owner_name = $3, slug = $4, title = $5, description = $6, event_date = $7, cover_image = $8, guest_options = $9
       where id = $1 and user_id = $2
       returning *`,
      [request.params.id, user.id, input.ownerName, input.slug, input.title, input.description, input.eventDate, input.coverImage, input.guestOptions],
    );
    if (!rows[0]) return fail(response, 404, 'No encontramos esa lista.');
    response.json(withPublicImages(rows[0]));
  } catch (error) {
    fail(response, 400, sqlMessage(error));
  }
});

app.delete('/api/lists/:id', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  await pool.query('delete from gift_lists where id = $1 and user_id = $2', [request.params.id, user.id]);
  response.json({ ok: true });
});

app.get('/api/lists/:listId/gifts', async (request, response) => {
  const list = await pool.query('select user_id, is_public from gift_lists where id = $1', [request.params.listId]);
  if (!list.rows[0]) return fail(response, 404, 'No encontramos esa lista.');
  const session = userFrom(request);
  if (!list.rows[0].is_public && session?.id !== list.rows[0].user_id) {
    return fail(response, 401, 'Necesitás iniciar sesión.');
  }
  const { rows } = await pool.query('select * from gifts where list_id = $1 order by created_at asc', [request.params.listId]);
  response.json(rows.map(numberGift));
});

app.get('/api/gifts/:id', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const gift = await giftWithList(request.params.id);
  if (!gift || gift.user_id !== user.id) return response.json(null);
  response.json(numberGift(gift));
});

app.post('/api/lists/:listId/gifts', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const list = await ownList(user.id, request.params.listId);
  if (!list) return fail(response, 404, 'No encontramos esa lista.');
  const input = giftInput(request.body);
  const { rows } = await pool.query(
    `insert into gifts (list_id, name, description, image_url, estimated_price, external_url, priority, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE') returning *`,
    [list.id, input.name, input.description, input.imageUrl, input.estimatedPrice, input.externalUrl, input.priority],
  );
  response.json(numberGift(rows[0]));
});

app.patch('/api/gifts/:id', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const gift = await giftWithList(request.params.id);
  if (!gift || gift.user_id !== user.id) return fail(response, 404, 'No encontramos ese regalo.');
  const input = giftInput(request.body);
  const { rows } = await pool.query(
    `update gifts set name = $2, description = $3, image_url = $4, estimated_price = $5, external_url = $6, priority = $7
     where id = $1 returning *`,
    [gift.id, input.name, input.description, input.imageUrl, input.estimatedPrice, input.externalUrl, input.priority],
  );
  response.json(numberGift(rows[0]));
});

app.delete('/api/gifts/:id', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const gift = await giftWithList(request.params.id);
  if (!gift || gift.user_id !== user.id) return fail(response, 404, 'No encontramos ese regalo.');
  await pool.query('delete from gifts where id = $1', [gift.id]);
  response.json({ ok: true });
});

app.post('/api/gifts/:id/status', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const status = request.body?.status;
  if (!['AVAILABLE', 'RESERVED', 'RECEIVED'].includes(status)) return fail(response, 400, 'Ese estado no existe.');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const gift = await giftWithList(request.params.id);
    if (!gift || gift.user_id !== user.id) {
      await client.query('rollback');
      return fail(response, 404, 'No encontramos ese regalo.');
    }
    if (status === 'AVAILABLE') {
      await client.query(`update reservations set status = 'CANCELLED' where gift_id = $1 and status = 'ACTIVE'`, [gift.id]);
    }
    await client.query(`update gifts set status = $2 where id = $1`, [gift.id, status]);
    await client.query('commit');
    response.json({ ok: true });
  } catch (error) {
    await client.query('rollback');
    console.error(error);
    fail(response, 500, 'No pudimos cambiar el estado.');
  } finally {
    client.release();
  }
});

app.get('/api/events', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const giftIds = `${request.query.giftIds ?? ''}`.split(',').filter(Boolean);
  if (!giftIds.length) return response.json([]);
  const { rows } = await pool.query(
    `select event.*
     from gift_events event
     join gifts gift on gift.id = event.gift_id
     join gift_lists list on list.id = gift.list_id
     where list.user_id = $1 and event.gift_id = any($2::uuid[])
     order by event.created_at desc`,
    [user.id, giftIds],
  );
  response.json(rows);
});

app.post('/api/gifts/:id/reserve', async (request, response) => {
  try {
    const result = await reserveGift(request.params.id, request.body, false);
    response.json(result);
  } catch (error) {
    fail(response, error.status || 400, error.message);
  }
});

app.post('/api/gifts/:id/owner-reserve', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const gift = await giftWithList(request.params.id);
  if (!gift || gift.user_id !== user.id) return fail(response, 404, 'No encontramos ese regalo.');
  try {
    await reserveGift(request.params.id, { ...request.body, consent: true }, true);
    response.json({ ok: true });
  } catch (error) {
    fail(response, error.status || 400, error.message);
  }
});

app.get('/api/reservations', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const { rows } = await pool.query(
    `select reservation.*, gift.name as gift_name, gift.status as gift_status, gift.list_id
     from reservations reservation
     join gifts gift on gift.id = reservation.gift_id
     join gift_lists list on list.id = gift.list_id
     where list.user_id = $1
     order by reservation.created_at desc`,
    [user.id],
  );
  response.json(rows);
});

app.post('/api/reservations/:id/cancel', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select reservation.*, gift.name as gift_name, gift.status as gift_status, gift.list_id, list.user_id
       from reservations reservation
       join gifts gift on gift.id = reservation.gift_id
       join gift_lists list on list.id = gift.list_id
       where reservation.id = $1
       for update`,
      [request.params.id],
    );
    const reservation = rows[0];
    if (!reservation || reservation.user_id !== user.id || reservation.status !== 'ACTIVE') {
      await client.query('rollback');
      return fail(response, 404, 'No encontramos esa reserva.');
    }
    await client.query(`update reservations set status = 'CANCELLED' where id = $1`, [reservation.id]);
    await client.query(`select set_config('app.skip_status_event', 'on', true)`);
    await client.query(`update gifts set status = 'AVAILABLE' where id = $1`, [reservation.gift_id]);
    await client.query(
      `insert into gift_events (gift_id, event_type, payload) values ($1, 'cancelled', $2)`,
      [reservation.gift_id, { name: reservation.gift_name, listId: reservation.list_id, from: reservation.gift_status, to: 'AVAILABLE', detail: 'La reserva se canceló' }],
    );
    await client.query('commit');
    response.json({ ok: true });
  } catch (error) {
    await client.query('rollback');
    console.error(error);
    fail(response, 500, 'No pudimos cancelar la reserva.');
  } finally {
    client.release();
  }
});

app.get('/api/lists/:listId/suggestions', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const list = await ownList(user.id, request.params.listId);
  if (!list) return fail(response, 404, 'No encontramos esa lista.');
  const { rows } = await pool.query('select * from gift_suggestions where list_id = $1 order by created_at desc', [list.id]);
  response.json(rows.map(numberSuggestion));
});

app.get('/api/suggestions/pending', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const listIds = `${request.query.listIds ?? ''}`.split(',').filter(Boolean);
  if (!listIds.length) return response.json([]);
  const { rows } = await pool.query(
    `select suggestion.*, gift.name as gift_name
     from gift_suggestions suggestion
     join gifts gift on gift.id = suggestion.gift_id
     join gift_lists list on list.id = suggestion.list_id
     where list.user_id = $1 and suggestion.list_id = any($2::uuid[]) and suggestion.status = 'PENDING'
     order by suggestion.created_at desc`,
    [user.id, listIds],
  );
  response.json(rows.map(numberSuggestion));
});

app.post('/api/gifts/:id/suggestions', async (request, response) => {
  const gift = await giftWithList(request.params.id);
  if (!gift || !gift.is_public || gift.status === 'RECEIVED') return fail(response, 400, 'Este regalo no acepta sugerencias.');
  const name = `${request.body?.name ?? ''}`.trim();
  const guestName = `${request.body?.guestName ?? ''}`.trim();
  const guestEmail = `${request.body?.guestEmail ?? ''}`.trim();
  const note = `${request.body?.note ?? ''}`.trim();
  const url = `${request.body?.url ?? ''}`.trim();
  if (name.length < 2 || guestName.length < 2) return fail(response, 400, 'Completá el regalo y tu nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return fail(response, 400, 'Ingresá un email válido.');
  const price = request.body?.price == null || request.body.price === '' ? null : Number(request.body.price);
  await pool.query(
    `insert into gift_suggestions (gift_id, list_id, name, url, price, note, guest_name, guest_email, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')`,
    [gift.id, gift.list_id, name, url || null, Number.isFinite(price) ? price : null, note || null, guestName, guestEmail],
  );
  response.json({ ok: true });
});

app.post('/api/suggestions/:id/decide', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const accept = request.body?.accept === true;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select suggestion.*, list.user_id, list.title, list.slug, list.event_date, list.owner_name, gift.name as current_name
       from gift_suggestions suggestion
       join gift_lists list on list.id = suggestion.list_id
       join gifts gift on gift.id = suggestion.gift_id
       where suggestion.id = $1 and suggestion.status = 'PENDING'
       for update`,
      [request.params.id],
    );
    const suggestion = rows[0];
    if (!suggestion || suggestion.user_id !== user.id) {
      await client.query('rollback');
      return fail(response, 404, 'La sugerencia ya no está pendiente.');
    }
    if (accept) {
      await client.query(
        `update gifts set name = $2, external_url = coalesce($3, external_url), estimated_price = coalesce($4, estimated_price) where id = $1`,
        [suggestion.gift_id, suggestion.name, suggestion.url, suggestion.price],
      );
    }
    await client.query(`update gift_suggestions set status = $2 where id = $1`, [suggestion.id, accept ? 'ACCEPTED' : 'REJECTED']);
    if (suggestion.guest_email) {
      await queueMail(client, suggestion.guest_email, accept ? 'suggestion_accepted' : 'suggestion_rejected', {
        person: suggestion.guest_name,
        gift: suggestion.name,
        date: new Date().toISOString(),
        listTitle: suggestion.title,
        listSlug: suggestion.slug,
        eventDate: suggestion.event_date,
        ownerName: suggestion.owner_name,
        description: suggestion.current_name,
        message: suggestion.note,
      });
    }
    await client.query('commit');
    void flushOutbox();
    response.json({ ok: true });
  } catch (error) {
    await client.query('rollback');
    console.error(error);
    fail(response, 500, 'No pudimos resolver la sugerencia.');
  } finally {
    client.release();
  }
});

app.get('/api/lists/:listId/visits', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const list = await ownList(user.id, request.params.listId);
  if (!list) return fail(response, 404, 'No encontramos esa lista.');
  const { rows } = await pool.query('select * from store_visits where list_id = $1 order by created_at desc', [list.id]);
  response.json(rows);
});

app.post('/api/lists/:listId/visits', async (request, response) => {
  const list = await pool.query('select id, is_public from gift_lists where id = $1', [request.params.listId]);
  if (!list.rows[0]?.is_public) return fail(response, 404, 'No encontramos esa lista.');
  await pool.query(
    `insert into store_visits (list_id, store_name, buyer, amount, note, dedication) values ($1, $2, $3, $4, $5, $6)`,
    [
      list.rows[0].id,
      `${request.body?.storeName ?? ''}`.trim(),
      `${request.body?.buyer ?? ''}`.trim(),
      `${request.body?.amount ?? ''}`.trim(),
      `${request.body?.note ?? ''}`.trim(),
      `${request.body?.dedication ?? ''}`.trim() || null,
    ],
  );
  response.json({ ok: true });
});

app.get('/api/lists/:listId/transfers', async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const list = await ownList(user.id, request.params.listId);
  if (!list) return fail(response, 404, 'No encontramos esa lista.');
  const { rows } = await pool.query('select * from transfer_notices where list_id = $1 order by created_at desc', [list.id]);
  response.json(rows);
});

app.post('/api/lists/:listId/transfers', async (request, response) => {
  const list = await pool.query('select id, is_public from gift_lists where id = $1', [request.params.listId]);
  if (!list.rows[0]?.is_public) return fail(response, 404, 'No encontramos esa lista.');
  await pool.query(
    `insert into transfer_notices (list_id, destination, buyer, dedication) values ($1, $2, $3, $4)`,
    [
      list.rows[0].id,
      `${request.body?.destination ?? ''}`.trim(),
      `${request.body?.buyer ?? ''}`.trim(),
      `${request.body?.dedication ?? ''}`.trim() || null,
    ],
  );
  response.json({ ok: true });
});

app.post('/api/uploads', upload.single('file'), async (request, response) => {
  const user = requireUser(request, response);
  if (!user) return;
  const file = request.file;
  if (!file || !file.mimetype.startsWith('image/')) return fail(response, 400, 'Elegí una imagen.');
  await mkdir(uploadDir, { recursive: true });
  const name = `${user.id}-${randomUUID()}-${file.originalname.replace(/[^\w.]+/g, '-')}`;
  await writeFile(path.join(uploadDir, name), file.buffer);
  await pool.query(
    `insert into uploads (filename, mime, bytes) values ($1, $2, $3)
     on conflict (filename) do update set mime = excluded.mime, bytes = excluded.bytes`,
    [name, file.mimetype, file.buffer],
  );
  response.json({ url: `/uploads/${name}` });
});

app.get('/uploads/:name', async (request, response) => {
  const name = path.basename(request.params.name);
  if (!name || name !== request.params.name) return response.status(404).end();
  const filePath = path.join(uploadDir, name);
  try {
    await access(filePath);
    return response.sendFile(filePath);
  } catch {
    const { rows } = await pool.query('select mime, bytes from uploads where filename = $1', [name]);
    if (!rows[0]) return response.status(404).end();
    response.setHeader('Content-Type', rows[0].mime);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.send(rows[0].bytes);
  }
});

async function reserveGift(giftId, body, asOwner) {
  const name = `${body?.name ?? ''}`.trim();
  const phone = `${body?.phone ?? ''}`.trim();
  const email = `${body?.email ?? ''}`.trim();
  const message = `${body?.message ?? ''}`.trim();
  if (body?.consent !== true && !asOwner) throw httpError(400, 'Necesitamos esa confirmación para reservar.');
  if (name.length < 3 || name.length > 80) throw httpError(400, 'Ingresá nombre y apellido.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw httpError(400, 'Ingresá un teléfono válido.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Ingresá un email válido.');
  if (message.length > 400) throw httpError(400, 'El mensaje puede tener hasta 400 caracteres.');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select gift.*, list.is_public, list.title as list_title, list.slug as list_slug, list.event_date, list.owner_name, owner.email as owner_email
       from gifts gift
       join gift_lists list on list.id = gift.list_id
       join users owner on owner.id = list.user_id
       where gift.id = $1
       for update`,
      [giftId],
    );
    const gift = rows[0];
    if (!gift) throw httpError(404, 'No encontramos ese regalo.');
    if (!gift.is_public) throw httpError(400, 'Publicá la lista para anotar quién reservó.');
    if (asOwner) {
      await client.query(`update reservations set status = 'CANCELLED' where gift_id = $1 and status = 'ACTIVE'`, [gift.id]);
    } else if (gift.status !== 'AVAILABLE') {
      throw httpError(409, 'Otra persona acaba de reservar este regalo.');
    }
    const inserted = await client.query(
      `insert into reservations (gift_id, name, phone, email, message) values ($1, $2, $3, $4, $5) returning id, created_at`,
      [gift.id, name, phone, email || null, message || null],
    );
    await client.query(`select set_config('app.skip_status_event', 'on', true)`);
    await client.query(`update gifts set status = 'RESERVED' where id = $1`, [gift.id]);
    await client.query(
      `insert into gift_events (gift_id, event_type, payload) values ($1, 'reserved', $2)`,
      [gift.id, { name: gift.name, listId: gift.list_id, from: gift.status, to: 'RESERVED', detail: `${name} lo reservó` }],
    );
    const notice = {
      person: name,
      phone,
      email: email || null,
      gift: gift.name,
      date: inserted.rows[0].created_at,
      message: message || null,
      listTitle: gift.list_title,
      eventDate: gift.event_date,
      ownerName: gift.owner_name,
      listSlug: gift.list_slug,
      description: gift.description,
    };
    await queueMail(client, gift.owner_email, 'gift_reserved', notice);
    if (email) await queueMail(client, email, 'gift_reserved_guest', notice);
    await client.query('commit');
    void flushOutbox();
    return { reservationId: inserted.rows[0].id, giftName: gift.name, reservedAt: inserted.rows[0].created_at };
  } catch (error) {
    await client.query('rollback');
    if (error.status) throw error;
    if (error.code === '23505') throw httpError(409, 'Otra persona acaba de reservar este regalo.');
    console.error(error);
    throw httpError(500, 'No pudimos reservar el regalo.');
  } finally {
    client.release();
  }
}

function listInput(body) {
  const ownerName = `${body?.ownerName ?? ''}`.trim();
  const title = `${body?.title ?? ''}`.trim();
  const slug = `${body?.slug ?? ''}`.trim().toLowerCase();
  if (ownerName.length < 2 || title.length < 2) return { error: 'Completá el nombre y el título.' };
  if (!/^[a-z0-9]+(-?[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 48) {
    return { error: 'El link solo puede tener letras minúsculas, números y guiones.' };
  }
  return {
    ownerName,
    title,
    slug,
    description: `${body?.description ?? ''}`.trim() || null,
    eventDate: body?.eventDate || null,
    coverImage: body?.coverImage || null,
    guestOptions: body?.guestOptions ?? { stores: [], transfers: [] },
  };
}

function giftInput(body) {
  const price = body?.estimatedPrice == null || body.estimatedPrice === '' ? null : Number(body.estimatedPrice);
  return {
    name: `${body?.name ?? ''}`.trim(),
    description: `${body?.description ?? ''}`.trim() || null,
    imageUrl: body?.imageUrl || null,
    estimatedPrice: Number.isFinite(price) ? price : null,
    externalUrl: `${body?.externalUrl ?? ''}`.trim() || null,
    priority: body?.priority || null,
  };
}

function uploadPath(value) {
  if (!value || typeof value !== 'string') return value;
  const match = value.match(/\/uploads\/([^?#]+)/);
  return match ? `/uploads/${decodeURIComponent(match[1])}` : value;
}

function withPublicImages(row) {
  if (!row) return row;
  const next = { ...row };
  if ('cover_image' in next) next.cover_image = uploadPath(next.cover_image);
  if ('image_url' in next) next.image_url = uploadPath(next.image_url);
  return next;
}

function numberGift(row) {
  return {
    ...withPublicImages(row),
    estimated_price: row.estimated_price == null ? null : Number(row.estimated_price),
  };
}

function numberSuggestion(row) {
  return { ...row, price: row.price == null ? null : Number(row.price) };
}

function sqlMessage(error) {
  if (error.code === '23505') return 'Ese link ya está en uso. Elegí otro.';
  if (error.code === '23514') return 'Revisá el link de la lista.';
  return 'No pudimos guardar la lista.';
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function env(name) {
  return `${process.env[name] ?? ''}`.trim().replace(/^['"]|['"]$/g, '');
}

function escapeHtml(value) {
  return `${value ?? ''}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function asNotice(payload) {
  if (payload && typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', { hour12: false });
}

function formatEventDate(value) {
  if (!value) return 'Fecha a confirmar';
  const date = new Date(`${value}`.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return 'Fecha a confirmar';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function mailRows(pairs) {
  const rows = pairs.filter(([, value]) => value);
  if (!rows.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;">
    ${rows
      .map(
        ([label, value]) => `<tr>
          <td style="width:38%;padding:10px 12px 10px 0;border-top:1px solid #e7ebf1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#8b93a3;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-top:1px solid #e7ebf1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.45;color:#1e3358;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`,
      )
      .join('')}
  </table>`;
}

function mailLayout({ kicker, title, body, action }) {
  const site = env('SITE_URL').replace(/\/$/, '');
  const logo = site ? `${site}/logo.png` : '';
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="border-radius:999px;background:#1e3358;">
         <a href="${escapeHtml(action.href)}" style="display:inline-block;padding:13px 22px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1;color:#ffffff;text-decoration:none;">${escapeHtml(action.label)}</a>
       </td></tr></table>`
    : '';
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f3f5f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;">
        <tr><td style="height:6px;background:#1e3358;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 0;">
          ${
            logo
              ? `<img src="${escapeHtml(logo)}" alt="Regali" width="148" style="display:block;width:148px;max-width:148px;height:auto;border:0;">`
              : `<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1e3358;">Regali</p>`
          }
        </td></tr>
        <tr><td style="padding:22px 32px 32px;">
          <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8b93a3;">${escapeHtml(kicker)}</p>
          <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:28px;line-height:1.25;color:#1e3358;">${escapeHtml(title)}</h1>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#3c4656;">${body}</div>
          ${button}
        </td></tr>
        <tr><td style="padding:16px 32px 22px;border-top:1px solid #e7ebf1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#8b93a3;">
          Regali · avisos de tu lista de regalos
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function mailMessage(template, payload) {
  const notice = asNotice(payload);
  const site = env('SITE_URL').replace(/\/$/, '');
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
  const action = listUrl ? { href: listUrl, label: 'Abrir la lista' } : null;
  if (suggestion) {
    return {
      subject,
      html: mailLayout({
        kicker: notice.listTitle || 'Sugerencia',
        title: accepted ? 'Aceptaron tu sugerencia' : 'No van a cambiar el regalo',
        body: `<p style="margin:0;">Hola ${escapeHtml(notice.person)}, ${
          accepted
            ? `aceptaron tu sugerencia de <strong>${escapeHtml(notice.gift)}</strong> en <strong>${escapeHtml(notice.listTitle)}</strong>. El regalo ya está actualizado.`
            : `revisaron tu sugerencia de <strong>${escapeHtml(notice.gift)}</strong> en <strong>${escapeHtml(notice.listTitle)}</strong> y van a dejar el regalo como estaba.`
        }</p>${mailRows([
          ['Regalo', notice.gift],
          ['Antes era', notice.description],
        ])}`,
        action,
      }),
    };
  }
  if (guest) {
    return {
      subject,
      html: mailLayout({
        kicker: notice.listTitle || 'Reserva',
        title: 'Reservaste un regalo',
        body: `<p style="margin:0;">Hola ${escapeHtml(notice.person)}, confirmamos que te comprometiste a comprar <strong>${escapeHtml(notice.gift)}</strong>. Quedó a tu nombre para que otra persona no elija el mismo.</p>${mailRows([
          ['Evento', notice.listTitle],
          ['De', notice.ownerName],
          ['Fecha', formatEventDate(notice.eventDate)],
          ['Reserva', formatWhen(notice.date)],
          ['Detalle', notice.description],
        ])}`,
        action,
      }),
    };
  }
  return {
    subject,
    html: mailLayout({
      kicker: notice.listTitle || 'Reserva',
      title: 'Nuevo regalo reservado',
      body: `<p style="margin:0;">Alguien se comprometió a comprar <strong>${escapeHtml(notice.gift)}</strong>.</p>${mailRows([
        ['Persona', notice.person],
        ['Teléfono', notice.phone],
        ['Email', notice.email],
        ['Regalo', notice.gift],
        ['Fecha', formatWhen(notice.date)],
        ['Mensaje', notice.message],
      ])}`,
      action,
    }),
  };
}

const resendTemplates = new Set([
  'gift_reserved',
  'gift_reserved_guest',
  'suggestion_accepted',
  'suggestion_rejected',
]);

function templateVariables(payload) {
  const notice = asNotice(payload);
  const site = env('SITE_URL').replace(/\/$/, '');
  return {
    PERSON: notice.person || '',
    GIFT: notice.gift || '',
    LIST_TITLE: notice.listTitle || '',
    OWNER_NAME: notice.ownerName || '',
    EVENT_DATE: formatEventDate(notice.eventDate),
    DATE: formatWhen(notice.date),
    DESCRIPTION: notice.description || '',
    PHONE: notice.phone || '',
    GUEST_EMAIL: notice.email || '',
    MESSAGE: notice.message || '',
    LIST_URL: site && notice.listSlug ? `${site}/${notice.listSlug}` : '',
  };
}

async function postMail(body) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(await result.text());
}

async function sendMail(to, subject, html) {
  await postMail({ from: env('EMAIL_FROM'), to: [to], subject, html });
}

async function sendTemplate(to, template, variables) {
  await postMail({ to: [to], template: { id: template, variables } });
}

async function flushOutbox() {
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) return;
  try {
    const { rows } = await pool.query(
      `select * from notification_outbox where status in ('pending', 'failed') and attempts < 8 order by created_at asc limit 20`,
    );
    for (const row of rows) {
      try {
        if (resendTemplates.has(row.template)) {
          try {
            await sendTemplate(row.recipient, row.template, templateVariables(row.payload));
            await pool.query(`update notification_outbox set status = 'sent' where id = $1`, [row.id]);
            continue;
          } catch (error) {
            const detail = error instanceof Error ? error.message : 'error';
            console.error(`No se pudo usar el template ${row.template}: ${detail}`);
          }
        }
        const { subject, html } = mailMessage(row.template, row.payload);
        await sendMail(row.recipient, subject, html);
        await pool.query(`update notification_outbox set status = 'sent' where id = $1`, [row.id]);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'error';
        console.error(`No salió el mail a ${row.recipient} (${row.template}): ${detail}`);
        await pool.query(`update notification_outbox set status = 'failed', attempts = attempts + 1 where id = $1`, [row.id]);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function boot() {
  const schema = readFileSync(path.join(root, 'schema.sql'), 'utf8');
  await pool.query(schema);
  await pool.query(`update notification_outbox set attempts = 0 where status = 'failed'`);
  if (env('RESEND_API_KEY') && env('EMAIL_FROM')) {
    console.log('Mails activos.');
  } else {
    console.error('Mails apagados. En el servicio de la app faltan RESEND_API_KEY o EMAIL_FROM.');
  }
  await mkdir(uploadDir, { recursive: true });
  if (staticDir) {
    app.use(express.static(staticDir));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api') || request.path.startsWith('/uploads')) return next();
      response.sendFile(path.join(staticDir, 'index.html'));
    });
  }
  setInterval(() => {
    void flushOutbox();
  }, 15000);
  app.listen(port, () => {
    console.log(`regali.to escuchando en ${port}`);
  });
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
