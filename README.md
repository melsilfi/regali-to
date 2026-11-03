# regali.to

Lista personal para que una persona indique qué le gustaría recibir y sus invitados reserven un regalo sin crear una cuenta. El link público es la raíz del dominio más el slug, por ejemplo `https://regali.to/lauraynicoweddinglist`.

## Probarlo ahora

```bash
npm start
```

Sin claves de Supabase, la app corre en modo demostración y guarda los datos en el navegador.

- Ejemplo público: `http://localhost:4200/lauraynicoweddinglist`
- Panel de Laura y Nico: en Ingresar, “Continuar con Google”, o `laura.nico@gmail.com` / `demo1234`

## Cuenta real con Gmail

1. Creá un proyecto en [Supabase](https://supabase.com).
2. Ejecutá `supabase/migrations/20261005120000_init.sql` en el SQL editor.
3. En Authentication, activá el proveedor Google y sumá `http://localhost:4200/auth/callback` como redirect URL.
4. Copiá la URL del proyecto y la anon key en `src/environments/environment.development.ts`.
5. Para el email de cada reserva, desplegá la función `supabase/functions/notify-reservation` y configurá un webhook de base de datos sobre `notification_outbox` (INSERT) con el header `x-webhook-secret`. Variables: `RESEND_API_KEY`, `EMAIL_FROM`, `WEBHOOK_SECRET`.
6. WhatsApp ya tiene un canal en `supabase/functions/_shared/channels.ts`. No envía mensajes hasta que se implemente ese canal.

La arquitectura de carpetas, datos y seguridad está en [ARCHITECTURE.md](ARCHITECTURE.md).
