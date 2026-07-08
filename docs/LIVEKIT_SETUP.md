# LiveKit Setup

## 1. Purpose

Second, third, and fourth-round development use LiveKit for real audio/video transport.

The backend only generates LiveKit tokens. It does not proxy video frames.

## 2. Required Values

Create `backend/.env` locally:

```text
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

Never commit `backend/.env`.

Use `backend/.env.example` as the committed template.

## 3. LiveKit Cloud Project Setup

Use this path when validating the real video link with LiveKit Cloud:

1. Sign in to LiveKit Cloud.
2. Create a new project for this MVP.
3. Open the project settings or keys page.
4. Copy the project WebSocket URL, usually:

```text
wss://your-project.livekit.cloud
```

5. Create or copy an API key and API secret.
6. Put these values only in `backend/.env`.
7. Do not put the API key or API secret in `web-client`, `robot-web-publisher`, Android source, screenshots, or logs.

Backend local `.env` example:

```text
PORT=3001
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

After backend starts, confirm the log says:

```text
LiveKit token mode: livekit
```

## 4. Mock Mode

If any of these values are missing:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

the backend returns:

```json
{
  "tokenMode": "mock"
}
```

In mock mode:

- Web client does not connect to LiveKit.
- Robot publisher and Android robot app do not publish camera video to LiveKit.
- Business features still run for room, chat, role, and mock control testing.

## 5. Real LiveKit Mode

When all required values are configured:

- `POST /api/rooms/join` returns a real LiveKit JWT for Web users.
- `POST /api/robots/join` returns a real LiveKit JWT for the robot publisher or Android robot app.
- Web users can subscribe to tracks.
- Robot clients can publish camera video.
- Robot clients can subscribe if needed by later data/channel work.
- API secret remains only on the backend.

For online deployment, `LIVEKIT_URL` must be reachable from public Web clients and Android robots, usually `wss://...`.

## 6. Robot Web Publisher Real Video Test

Use this test before Android device testing. It validates the real LiveKit media path with the browser camera.

Start backend:

```bash
cd backend
npm run dev
```

Start Web client:

```bash
cd web-client
npm run dev
```

Start robot publisher:

```bash
cd robot-web-publisher
npm run dev
```

Test:

1. Open `http://localhost:5173`.
2. Join room `robot-room-001` as `Alice`.
3. Open `http://localhost:5174`.
4. Join room `robot-room-001` as `robot-001`.
5. Allow browser camera permission.
6. Confirm robot publisher shows a publishing status.
7. Confirm Web status shows `LiveKit connected`.
8. Confirm Web status shows `Robot online`.
9. Confirm the Web robot video area shows the robot publisher camera.

If the Web side does not show video:

- Check backend join response has `tokenMode: "livekit"`.
- Check both pages use exactly the same `roomName`.
- Check robot publisher camera permission.
- Check robot participant identity/name contains `robot`.
- Check `LIVEKIT_URL` starts with `wss://` for cloud tests.
- Refresh the Web client and rejoin if the token expired.

## 7. Confirming the Robot Video Track

A successful Web-side video test should show:

- Web status: `livekit connected`.
- Robot status: `online`.
- Video badge with robot identity/name, usually `robot-...` or the submitted `robotId`.
- No `Robot offline` placeholder.
- No `Waiting for robot video` placeholder after camera publishing starts.

For low-level inspection:

1. Open browser developer tools.
2. Check the Network tab for successful backend `/api/rooms/join` and `/api/robots/join` responses.
3. Confirm both responses contain `tokenMode: "livekit"`.
4. Do not copy or share the returned LiveKit token.
5. Check console for LiveKit connection errors.

## 8. Local Ports

Default local services:

```text
backend: http://localhost:3001
web-client: http://localhost:5173
robot-web-publisher: http://localhost:5174
android-robot: installed APK, uses backend LAN/public URL
```

The backend CORS list must include both frontend origins.

Android is not a browser and does not use CORS, but it must be able to reach the backend URL over the network.

Production services:

```text
backend: https://your-backend.example.com
backend websocket: wss://your-backend.example.com/ws
web-client: https://your-web.example.com
android-robot backendUrl: https://your-backend.example.com
```

## 9. Verification

1. Start backend.
2. Join a Web user.
3. Confirm response has `tokenMode: "livekit"`.
4. Start robot publisher or install the Android robot app.
5. Join the same room as robot.
6. Allow camera permission.
7. Confirm Web client shows the robot camera.

## 10. Common Problems

`tokenMode` is `mock`:

- One or more LiveKit env values is missing.
- `LIVEKIT_URL` is still `mock://livekit`.

Web client stays on placeholder:

- Robot publisher is not in the same room.
- Android robot app is not in the same room.
- Camera permission was denied.
- Robot participant identity/name does not contain `robot`.
- LiveKit URL is wrong.
- Token expired.

Browser camera does not open:

- Use `localhost` during development.
- Check system camera permission.
- Close other apps using the camera.

Android camera does not open:

- Grant Android camera permission.
- Close vendor camera/navigation apps.
- Reboot the robot if the camera driver is stuck.
- Do not use `localhost` for `backendUrl`; use the computer LAN IP or a public backend URL.

Online connection fails:

- Use HTTPS/WSS, not HTTP/WS, for public deployment.
- Avoid self-signed certificates for Android online tests.
- Confirm Web build env uses `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.
- Confirm backend `CORS_ORIGIN` exactly matches the deployed Web origin.
