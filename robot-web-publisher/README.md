# Robot Web Publisher

Browser-based mock robot camera publisher for the second-round LiveKit video link.

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
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

## Behavior

- Calls `POST /api/robots/join` to get a robot LiveKit token.
- Opens backend WebSocket `hello` as the robot participant so backend robot online/offline status is visible.
- Connects to LiveKit when the backend returns a real LiveKit token.
- Requests local camera permission and publishes one camera video track.

This app does not move real robot hardware.
