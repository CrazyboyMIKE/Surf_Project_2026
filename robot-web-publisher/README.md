# Robot Web Publisher

Browser-based mock robot camera publisher for LiveKit video-link testing.

It simulates the Android robot camera without moving real hardware. This is the recommended first publisher for validating LiveKit Cloud or Scheme B self-hosted LiveKit before testing the Android robot app.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5174`.

## Environment

Local:

```text
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_BASE_URL=ws://localhost:3001
```

Production or public fallback testing:

```text
VITE_API_BASE_URL=https://api.your-domain.com
VITE_WS_BASE_URL=wss://api.your-domain.com/ws
```

This app does not need `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET`. It calls backend and uses the returned `liveKitUrl` and token.

## Behavior

- Calls `POST /api/robots/join` to get a robot LiveKit token.
- Opens backend WebSocket `hello` as the robot participant so backend robot online/offline status is visible.
- Connects to LiveKit when the backend returns a real LiveKit token.
- Requests local camera permission and publishes one camera video track.
- Shows clearer setup errors for:
  - invalid API/WS environment config
  - backend token request failure
  - WebSocket connection failure
  - browser camera API unsupported
  - camera permission denied
  - no camera found
  - camera already in use
  - LiveKit connection or track publish failure

This app does not move real robot hardware.

## Scheme B / Self-hosted Cloud Test

Use this path before Android true-device testing:

1. Deploy backend with `LIVEKIT_URL=wss://livekit.your-domain.com`.
2. Build this app with:

```text
VITE_API_BASE_URL=https://api.your-domain.com
VITE_WS_BASE_URL=wss://api.your-domain.com/ws
```

3. Open the publisher page in a browser with a camera.
4. Enter the same `roomName` that Web users will join.
5. Allow camera permission.
6. Confirm the Web client sees a participant whose identity/name contains `robot`.

If users can join the room but no video appears, check cloud firewall/security-group UDP `50000-60000` and LiveKit `7881/tcp` first.

## Checks

```bash
npm run lint
npm run test
npm run build
```
