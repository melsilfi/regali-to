# regali.to en Railway

Esta copia deja Supabase. El sitio y la API corren en un servicio de Railway, y los datos van a un Postgres del mismo proyecto.

El proyecto original, `mi-lista-de-regalos`, no cambia.

## Qué incluye

- Postgres propio: usuarios, listas, regalos, reservas, sugerencias, locales, transferencias y la bandeja de mails.
- Login con email y contraseña. Google no está en esta copia.
- Fotos en el disco del servicio (`/data/uploads`). Conviene un volumen de Railway montado en `/data` para que no se pierdan al redesplegar.
- Los mails salen si configurás `RESEND_API_KEY`, `EMAIL_FROM` y `SITE_URL`. Si no, las reservas se guardan igual y el aviso queda pendiente.

## Cómo publicarlo

1. En Railway, creá un proyecto y agregá un Postgres.
2. Agregá un servicio desde esta carpeta. Railway detecta el `Dockerfile`.
3. En el servicio web, variables:
   - `DATABASE_URL`: la connection string del Postgres. Railway puede referenciarla con `${{Postgres.DATABASE_URL}}`.
   - `JWT_SECRET`: un texto largo y secreto.
   - `SITE_URL`: la URL pública, por ejemplo `https://tu-app.up.railway.app`.
4. Opcional, para los mails: `RESEND_API_KEY` y `EMAIL_FROM`.
5. Opcional: un volumen montado en `/data`.

Al arrancar, el servidor crea las tablas si no existen.

## Probarlo en tu máquina

Postgres local y, en otra terminal, la API:

```bash
cd server
DATABASE_URL=postgres://localhost:5432/regali JWT_SECRET=dev npm start
```

En la raíz del proyecto:

```bash
npm start
```

`npm start` sigue siendo Angular y manda `/api` a `http://localhost:8080`.
