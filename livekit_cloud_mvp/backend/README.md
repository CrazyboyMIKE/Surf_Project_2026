# LiveKit Cloud MVP Backend

Node.js + TypeScript + Express backend for the isolated LiveKit Cloud robot MVP.

The backend manages rooms, roles, controller ownership, chat, WebSocket robot-control relay, and LiveKit Cloud token generation. It does not proxy raw audio/video frames.

## Environment

Copy `.env.livekit-cloud.example` to a local `.env` on the server. Do not commit `.env`.

```text
PORT=3001
NODE_ENV=production
PUBLIC_BASE_URL=https://api.example.com
CORS_ORIGIN=https://web.example.com
DATABASE_URL=file:./data/livekit_cloud_mvp.sqlite
ROOM_RECORD_RETENTION_DAYS=30
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_CLOUD_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_CLOUD_API_SECRET
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
ADMIN_ENABLED=false
ADMIN_TOKEN=CHANGE_ME_ADMIN_TOKEN
```

`LIVEKIT_URL` must point to LiveKit Cloud, for example `wss://your-project.livekit.cloud`.

Set `ADMIN_ENABLED=true` only when you need `/admin`. Replace `ADMIN_TOKEN` with a strong random value before enabling it.

`DATABASE_URL` uses SQLite for MVP room history. The default `backend/data/livekit_cloud_mvp.sqlite` file is local server data and must not be committed.

## API

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- `GET /api/admin/rooms`
- `GET /api/admin/rooms/:roomName`
- `GET /api/admin/room-records?days=30`
- `GET /api/admin/room-records/:roomId`
- `POST /api/admin/rooms/:roomName/control/release`
- `POST /api/admin/rooms/:roomName/participants/cleanup`
- `POST /api/admin/rooms/:roomName/participants/:participantId/kick`
- `POST /api/admin/rooms/:roomName/close`
- `DELETE /api/admin/rooms/:roomName`
- WebSocket `/ws`

## Media Grants

| Role | Subscribe | Publish |
|---|---:|---:|
| robot | yes | yes |
| controller | yes | yes |
| viewer | yes | yes |

Viewer media publishing only affects microphone/camera. Viewer robot-control attempts are still rejected by backend controller ownership checks.

## Run

```bash
npm install
npm run dev
```

## Production

```bash
npm install
npm run build
npm run start
```

Use Nginx to expose `https://api.example.com` and `wss://api.example.com/ws`.

## Checks

```bash
npm run lint
npm run test
npm run build
npm run check:livekit-env
```

## Safety

- `LIVEKIT_API_SECRET` stays backend-only.
- API responses return a short-lived LiveKit token, not the API secret.
- Logs must not print key, secret, or token values.
- Admin APIs require `Authorization: Bearer <ADMIN_TOKEN>` and never return tokens or secrets.
- Room history stores room metadata, participants, and sanitized events only. It must not store LiveKit secrets, LiveKit tokens, robot keys, or robot tokens.
- Viewer robot-control attempts are rejected by backend business logic.
- Allowed normal robot-control commands are `1000`, `1002`, `1003`, `1004`, `1005`, and `1006`; `1001` remains keyboard-control-only.
