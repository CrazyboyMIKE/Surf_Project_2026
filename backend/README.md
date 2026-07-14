# Backend

Node.js + TypeScript + Express backend for the robot remote-presence MVP.

The backend owns room state, role state, controller ownership, WebSocket chat/control relay, and LiveKit token generation. It never proxies raw audio/video frames.

## Run

```bash
npm install
npm run dev
```

The backend listens on `http://localhost:3001` by default.

## Production

Build:

```bash
npm run build
```

Start:

```bash
npm run start
```

Production env example:

```text
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=https://api.your-domain.com
CORS_ORIGIN=https://web.your-domain.com
LIVEKIT_URL=wss://livekit.your-domain.com
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

`PUBLIC_BASE_URL` is for startup logs and operator clarity. Public access must be HTTPS/WSS in production.

## LiveKit

Create `backend/.env` locally:

```text
LIVEKIT_URL=mock://livekit
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_TOKEN_TTL=1h
```

Use `mock://livekit` when no real LiveKit server is configured.

For LiveKit Cloud:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-cloud-key
LIVEKIT_API_SECRET=your-livekit-cloud-secret
```

For Scheme B self-hosted LiveKit:

```text
LIVEKIT_URL=wss://livekit.your-domain.com
LIVEKIT_API_KEY=your-self-hosted-livekit-key
LIVEKIT_API_SECRET=your-self-hosted-livekit-secret
```

For any non-mock `ws://` or `wss://` URL, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are required. The API secret is only read by backend and is never returned to Web, robot-web-publisher, or Android.

Check LiveKit env without printing secret values:

```bash
npm run check:livekit-env
```

## Media Grants

Backend generates role-aware LiveKit grants:

| Role | canJoin | canSubscribe | canPublish |
|---|---:|---:|---:|
| robot | yes | yes | yes |
| controller | yes | yes | yes |
| viewer | yes | yes | no by default |

Set `ALLOW_VIEWER_PUBLISH=true` only for explicit meeting tests where viewers should publish microphone/camera. It is `false` by default.

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Behavior

- Room, participant, controller, and robot state are stored in memory.
- WebSocket `/ws` handles `hello`, `chat`, and `robot_control`.
- LiveKit token service returns real JWTs when configured and mock tokens otherwise.
- Join and controller request/release responses include `mediaPermissions`.
- Robot control is mock relay/logging only.
- Robot control commands are restricted to `1002`, `1003`, and `1000`.
- `GET /health` is the deployment health check.
- Request logs include method, path, status, and duration, but not secrets.

## Deployment Docs

- `docs/DEPLOYMENT.md`
- `docs/SELF_HOSTED_LIVEKIT_DEPLOYMENT_GUIDE.md`
- `deployment/self-hosted-livekit/README.md`
