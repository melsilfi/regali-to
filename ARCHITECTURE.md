# Arquitectura

regali.to muestra el link de invitados en la raíz: `/{slug}`. Un casamiento puede ser `regali.to/lauraynicoweddinglist`. Las pantallas de la cuenta usan rutas fijas (`/ingresar`, `/registro`, `/recuperar`, `/panel`, `/auth/callback`) y esos slugs están bloqueados.

## Carpetas

```text
src/app
  core
    auth            sesión, guards
    demo            datos locales cuando no hay Supabase
    gifts           regalos, fotos, historial
    lists           listas y slug
    reservations    reserva atómica y vista privada
    models.ts       estados y contratos
    slug.ts         link público
    reservation-rules.ts
  features
    home
    auth            Google, email, recuperación
    public-list     lista, tarjeta, reserva
    dashboard       panel, editor, reservas
  shared/ui         confirmación
supabase
  migrations        Postgres, RLS y funciones
  functions         email ahora, WhatsApp después
```

## Datos

`profiles` es el perfil de la app y apunta a `auth.users`. El resto sigue el modelo de listas, regalos, reservas, historial y una bandeja de avisos.

Estados de un regalo: `AVAILABLE`, `RESERVED`, `RECEIVED`.
Estados de una reserva: `ACTIVE`, `CANCELLED`. Cancelar una reserva devuelve el regalo a `AVAILABLE`.

`reserve_gift` toma el regalo con `FOR UPDATE`, valida nombre, teléfono y consentimiento, y solo inserta la reserva si sigue disponible. Un índice único impide dos reservas activas para el mismo regalo. La función también deja el aviso en `notification_outbox`.

## Quién ve qué

- Un invitado lee la lista pública y el estado de cada regalo. No puede leer `reservations`.
- Reservar se hace solo por `reserve_gift`. No hay insert directo sobre esa tabla.
- El dueño lee y modifica sus listas, regalos, reservas e historial. Las políticas comparan `auth.uid()` con `gift_lists.user_id`.
- Las fotos van al bucket `gift-images`, en una carpeta con el id del dueño.

## Avisos

Cada reserva encola un aviso `email`. La función `notify-reservation` elige el canal según la fila. `EmailChannel` usa Resend. `WhatsAppChannel` existe y responde que todavía no está conectado, así que sumar WhatsApp no cambia la reserva ni la tabla.

## Lo que el MVP deja listo y no construye todavía

Varias listas ya entran en el modelo y en el panel. Quedan para más adelante las listas con contraseña, los tipos de evento, aportes de dinero, regalos grupales, Mercado Pago, QR y cantidades.
