# Web Client

React + TypeScript web client for the robot remote-presence MVP.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Local:

```text
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_BASE_URL=ws://localhost:3001
```

Production:

```text
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

`VITE_WS_URL` is still supported for older local configs, but new deployments should use `VITE_WS_BASE_URL`.

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Behavior

- Users join a room as viewer or request controller.
- Chat is sent over WebSocket.
- Control buttons are disabled unless the current user is controller.
- The Web client connects to LiveKit when backend returns a real LiveKit token.
- Robot video is selected from remote participants whose identity/name contains `robot`.
- If the robot is offline, the page shows `Robot offline`.
- If the robot is online but no video track is available, the page shows `Waiting for robot video`.
