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
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_CLOUD_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_CLOUD_API_SECRET
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

`LIVEKIT_URL` must point to LiveKit Cloud, for example `wss://your-project.livekit.cloud`.

## API

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- WebSocket `/ws`

## Media Grants

| Role | Subscribe | Publish |
|---|---:|---:|
| robot | yes | yes |
| controller | yes | yes |
| viewer | yes | no by default |

Set `ALLOW_VIEWER_PUBLISH=true` only for explicit meeting tests. It should stay `false` for the default MVP.

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
- Viewer robot-control attempts are rejected by backend business logic.
- Allowed robot-control commands are `1002`, `1003`, and `1000`.
