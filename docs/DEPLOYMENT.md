# Deployment

## 1. Purpose

Fourth-round deployment makes the MVP reachable from the public internet:

- External Web users can join the same room.
- Android robot can join from a non-LAN network.
- LiveKit carries robot camera video.
- Backend carries room state, chat, controller permission, and mock control relay.

The fourth round still does not move real robot hardware.

## 2. Recommended Simple Stack

Use one public service for each layer:

- Web client: Vercel, Netlify, or another static hosting provider.
- Backend: Render, Fly.io, Railway, or another Node.js hosting provider with WebSocket support.
- Media: LiveKit Cloud or a publicly reachable LiveKit Server.
- Android robot: installed APK with a public `https://` backend URL.

This project does not require Docker for the fourth round. Add Docker only if the selected hosting platform needs it.

## 3. Required Environment Variables

Backend:

```text
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=https://your-backend.example.com
CORS_ORIGIN=https://your-web.example.com
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

Web client:

```text
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

Robot web publisher, optional:

```text
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

Android robot:

```text
backendUrl=https://your-backend.example.com
robotId=robot-001
roomName=robot-room-001
```

Do not put `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` in Web or Android configuration.

## 4. Backend Deployment

Pre-deployment checklist:

- `GET /health` works locally before deploy.
- `NODE_ENV=production` is configured.
- `PUBLIC_BASE_URL=https://your-backend.example.com` is configured.
- `CORS_ORIGIN=https://your-web.example.com` exactly matches the deployed Web origin.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured only on backend.
- Hosting provider supports WebSocket upgrade on `/ws`.
- Public access uses HTTPS/WSS.
- No real `.env` file is committed.

Build command:

```bash
cd backend
npm install
npm run build
```

Start command:

```bash
npm run start
```

Backend runtime requirements:

- Node.js runtime.
- Public HTTPS endpoint.
- WebSocket upgrade support on `/ws`.
- Environment variables configured in the hosting dashboard.

Health check:

```bash
curl https://your-backend.example.com/health
```

Expected:

```json
{
  "ok": true
}
```

Notes:

- `PUBLIC_BASE_URL` is used for non-secret startup logs and operator clarity.
- `CORS_ORIGIN` must contain the deployed Web origin.
- Use comma-separated origins if deploying multiple Web frontends.
- Do not use `CORS_ORIGIN=*` for production.
- The backend process may listen on plain HTTP behind the platform proxy, but public access must be HTTPS/WSS.
- The backend never proxies video frames.

## 5. Web Client Deployment

Pre-deployment checklist:

- `VITE_API_BASE_URL=https://your-backend.example.com`.
- `VITE_WS_BASE_URL=wss://your-backend.example.com`.
- Web hosting serves the app over HTTPS.
- Browser console has no mixed-content errors.
- The deployed Web origin is included in backend `CORS_ORIGIN`.

Build command:

```bash
cd web-client
npm install
npm run build
```

Static output:

```text
web-client/dist/
```

Configure these build-time environment variables in the Web hosting provider:

```text
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

Open the deployed Web URL and confirm the status bar can show:

- Backend connected.
- WebSocket connected.
- LiveKit connected.
- Robot online/offline.

If Web is served over `https://`, backend API must also be `https://` and WebSocket must be `wss://`.

## 6. LiveKit Configuration

Use LiveKit Cloud or a public LiveKit Server.

Backend env:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
```

Client behavior:

- Web receives LiveKit URL and token from backend.
- Android receives LiveKit URL and token from backend.
- Robot token can publish camera video.
- Web token can subscribe to robot video.
- The LiveKit API secret stays only on backend.

## 7. Android Robot Online Setup

In Android app:

```text
backendUrl=https://your-backend.example.com
robotId=robot-001
roomName=robot-room-001
```

Rules:

- Do not use `localhost`.
- Use `https://` for online deployment.
- Do not use `http://` online; cleartext is only for LAN debugging.
- The app derives WebSocket as `wss://your-backend.example.com/ws`.
- Self-signed HTTPS certificates may be rejected by Android. Use a trusted certificate for online tests.
- Android never stores or displays LiveKit API secret.

## 8. Public Verification

1. Deploy backend.
2. Open `https://your-backend.example.com/health`.
3. Deploy Web client with public backend env values.
4. Configure LiveKit env in backend.
5. Install Android robot app.
6. Android joins the public backend URL.
7. External Web user A joins the same room.
8. External Web user B joins the same room.
9. Both users see robot video.
10. A requests controller.
11. B remains viewer and cannot control.
12. A sends `1002`, `1003`, and `1000`.
13. Android displays received commands only.
14. A and B can chat.

## 9. Common Problems

CORS:

- Browser console shows a CORS error.
- Fix `CORS_ORIGIN` to exactly match the Web origin, including scheme.
- Example: `https://your-web.example.com`, not `http://your-web.example.com`.

WSS:

- WebSocket stays `error` or `closed`.
- Confirm `VITE_WS_BASE_URL=wss://your-backend.example.com`.
- Confirm the backend host supports WebSocket upgrades.
- Confirm public HTTPS certificate is valid.

HTTPS:

- Browser blocks mixed content.
- Do not call `http://` backend from an `https://` Web page.
- Android online `backendUrl` should use `https://`.

LiveKit token:

- Web or Android shows LiveKit error.
- Confirm backend has all three LiveKit env values.
- Confirm `LIVEKIT_URL` starts with `wss://`.
- Confirm backend response has `tokenMode: "livekit"`.
- Confirm token TTL is not too short for the test.

Robot video:

- Robot is offline: Android did not join backend WebSocket.
- Waiting for robot video: Android is online but camera did not publish.
- Check Android camera permission.
- Check camera is not occupied by vendor software.
- Confirm Web and Android use the same `roomName`.

Secrets:

- Never commit `.env`.
- Never put LiveKit secret in Web or Android.
- Do not print `LIVEKIT_API_SECRET` in logs.

## 10. Rollback

If production deployment fails:

1. Keep backend and Web deployments running but switch Android back to a known working backend URL.
2. Verify backend `/health`.
3. Verify `POST /api/robots/join` returns `tokenMode: "livekit"`.
4. Re-test WebSocket from Web.
5. Re-test robot publisher fallback if Android is unavailable.
