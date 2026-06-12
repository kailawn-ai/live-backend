# fifa-back

Simple Node + MySQL backend for OBS live streaming.

This backend does not ingest video itself. Use OBS to publish RTMP to an ingest server like Nginx RTMP or MediaMTX. This backend manages allowed users, admin login, stream keys, stream status, and publish callbacks in MySQL.

## Data design

The app is intentionally small:

```text
users
  id
  email
  password_hash
  role: user | admin
  status: allowed | blocked
  last_login_at

streams
  id
  title
  description
  teams
  status: offline | live | disabled
  stream_key
  hls_url
  started_at
  ended_at
```

Flow:

```text
Admin creates allowed user email + password
User logs in with email + password
Backend returns token
Frontend uses token to call /public/streams
User watches live HLS URL
```

## Run

Copy environment values:

```bash
cp .env.example .env
```

Change `ADMIN_PASSWORD` and `JWT_SECRET` before using this outside local development.

Make sure MySQL is running, then set these values in `.env`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=streaming
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
```

The app creates the `streaming` database plus `users` and `streams` tables automatically on startup. You can also run [schema.sql](schema.sql) manually in phpMyAdmin if you prefer.
The first admin user is created automatically from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

```bash
npm run start
```

Default API:

```text
http://127.0.0.1:4000
```

## Admin login

```bash
curl -X POST http://127.0.0.1:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@zostream.test","password":"change-this-password"}'
```

Use the returned token for admin routes:

```text
Authorization: Bearer TOKEN
```

## Current user

```bash
curl http://127.0.0.1:4000/auth/me \
  -H "Authorization: Bearer TOKEN"
```

## User management

Create an allowed viewer:

```bash
curl -X POST http://127.0.0.1:4000/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"email":"viewer@example.com","password":"secret123","role":"user","status":"allowed"}'
```

List users:

```bash
curl http://127.0.0.1:4000/users \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

Block or allow a user:

```bash
curl -X PATCH http://127.0.0.1:4000/users/2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"status":"blocked"}'
```

## Create stream

```bash
curl -X POST http://127.0.0.1:4000/streams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"title":"Opening Match","teams":"Team A vs Team B"}'
```

The response includes a `streamKey`.

The stream is saved in MySQL:

```sql
SELECT id, title, status, stream_key, hls_url FROM streams;
```

## Public live streams

```bash
curl http://127.0.0.1:4000/public/streams \
  -H "Authorization: Bearer USER_OR_ADMIN_TOKEN"
```

This only returns streams that are currently `live`. It requires a signed-in allowed user.

## OBS setup

In OBS:

```text
Server: rtmp://YOUR_RTMP_SERVER/live
Stream Key: STREAM_KEY_FROM_BACKEND
```

The backend expects your RTMP server to call:

```text
POST http://127.0.0.1:4000/rtmp/on-publish
POST http://127.0.0.1:4000/rtmp/on-done
```

with a form field named `name` containing the stream key.

## Nginx RTMP callback example

```nginx
application live {
    live on;
    record off;

    hls on;
    hls_path /tmp/hls;
    hls_fragment 2s;
    hls_playlist_length 8s;

    on_publish http://127.0.0.1:4000/rtmp/on-publish;
    on_done http://127.0.0.1:4000/rtmp/on-done;
}
```

Serve `/tmp/hls` from your web server, then set `HLS_BASE_URL` to that URL.
# live-backend
