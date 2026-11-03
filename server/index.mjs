import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return fail(response, 401, 'Email o contraseña incorrectos.');
  }
  response.json({ token: tokenFor(user), user: publicUser(user) });
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
  if (user && process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.SITE_URL) {
    const token = randomBytes(24).toString('hex');
    await pool.query('insert into password_resets (token, user_id, expires_at) values ($1, $2, now() + interval \'2 hours\')', [
      token,
      user.id,
    ]);
    const link = `${process.env.SITE_URL.replace(/\/$/, '')}/recuperar?token=${token}`;
    await sendMail(user.email, 'Recuperar tu contraseña', `<p>Hola ${escapeHtml(user.name)},</p><p><a href="${link}">Elegí una contraseña nueva</a>. El enlace vence en 2 horas.</p>`);
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
  response.json(rows);
});

app.get('/api/lists/public/:slug', async (request, response) => {
  const { rows } = await pool.query('select * from gift_lists where slug = $1 and is_public = true', [request.params.slug]);
  response.json(rows[0] ?? null);
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
    response.json(rows[0]);
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
    response.json(rows[0]);
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
  const proto = request.get('x-forwarded-proto') || request.protocol;
  const host = request.get('x-forwarded-host') || request.get('host');
  response.json({ url: `${proto}://${host}/uploads/${name}` });
});

app.use('/uploads', express.static(uploadDir));

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

function numberGift(row) {
  return { ...row, estimated_price: row.estimated_price == null ? null : Number(row.estimated_price) };
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

function escapeHtml(value) {
  return `${value}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function sendMail(to, subject, html) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });
  if (!result.ok) throw new Error(await result.text());
}

async function flushOutbox() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;
  const { rows } = await pool.query(`select * from notification_outbox where status = 'pending' order by created_at asc limit 20`);
  for (const row of rows) {
    try {
      const payload = row.payload;
      const subject = row.template === 'suggestion_accepted'
        ? `Aceptaron tu sugerencia en ${payload.listTitle}`
        : row.template === 'suggestion_rejected'
          ? `Sobre tu sugerencia en ${payload.listTitle}`
          : row.template === 'gift_reserved_guest'
            ? `Reservaste ${payload.gift}`
            : `Nuevo regalo reservado: ${payload.gift}`;
      await sendMail(row.recipient, subject, `<p>${escapeHtml(payload.person || '')}, hay una novedad sobre <strong>${escapeHtml(payload.gift || payload.listTitle || 'tu lista')}</strong>.</p>`);
      await pool.query(`update notification_outbox set status = 'sent' where id = $1`, [row.id]);
    } catch (error) {
      console.error(error);
      await pool.query(`update notification_outbox set status = 'failed' where id = $1`, [row.id]);
    }
  }
}

async function boot() {
  const schema = readFileSync(path.join(root, 'schema.sql'), 'utf8');
  await pool.query(schema);
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
