# LiveKit Setup

## 1. Purpose

Second-round development uses LiveKit for real audio/video transport.

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

## 3. Mock Mode

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
- Robot publisher does not publish camera video.
- Business features still run for room, chat, role, and mock control testing.

## 4. Real LiveKit Mode

When all required values are configured:

- `POST /api/rooms/join` returns a real LiveKit JWT for Web users.
- `POST /api/robots/join` returns a real LiveKit JWT for the robot publisher.
- Web users can subscribe to tracks.
- Robot publisher can publish camera video.
- API secret remains only on the backend.

## 5. Local Ports

Default local services:

```text
backend: http://localhost:3001
web-client: http://localhost:5173
robot-web-publisher: http://localhost:5174
```

The backend CORS list must include both frontend origins.

## 6. Verification

1. Start backend.
2. Join a Web user.
3. Confirm response has `tokenMode: "livekit"`.
4. Start robot publisher.
5. Join the same room.
6. Allow camera permission.
7. Confirm Web client shows the robot camera.

## 7. Common Problems

`tokenMode` is `mock`:

- One or more LiveKit env values is missing.
- `LIVEKIT_URL` is still `mock://livekit`.

Web client stays on placeholder:

- Robot publisher is not in the same room.
- Camera permission was denied.
- Robot participant identity/name does not contain `robot`.
- LiveKit URL is wrong.
- Token expired.

Browser camera does not open:

- Use `localhost` during development.
- Check system camera permission.
- Close other apps using the camera.
