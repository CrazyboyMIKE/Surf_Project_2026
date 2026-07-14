# LiveKit Cloud MVP Web Client

React + TypeScript Web client for the isolated LiveKit Cloud robot MVP.

## Environment

Local:

```text
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_BASE_URL=ws://localhost:3001
```

Cloud:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

The Web client does not contain `LIVEKIT_API_SECRET`. It receives `liveKitUrl`, token, role, robot status, and media permissions from backend.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Behavior

- Join a room as viewer or request controller.
- Show backend/WebSocket/LiveKit connection status.
- Show current role.
- Show robot online/offline state.
- Subscribe to robot video from a LiveKit Cloud participant whose identity/name contains `robot`.
- Chat over backend WebSocket.
- Request and release controller ownership.
- Disable robot-control buttons for viewer.
- Allow controller to send only `1002`, `1003`, and `1000`.
- Provide an explicit stop button for `1000`.
- Controller and viewer may manually turn microphone/camera on when backend grants publish permission.
- Viewer media publishing does not grant robot-control permission.
