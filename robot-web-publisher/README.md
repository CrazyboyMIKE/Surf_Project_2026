# Robot Web Publisher

Browser-based mock robot camera publisher for the second-round LiveKit video link.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5174`.

## Behavior

- Calls `POST /api/robots/join` to get a robot LiveKit token.
- Opens backend WebSocket `hello` as the robot participant so backend robot online/offline status is visible.
- Connects to LiveKit when the backend returns a real LiveKit token.
- Requests local camera permission and publishes one camera video track.

This app does not move real robot hardware.
