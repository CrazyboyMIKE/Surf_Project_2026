# LiveKit Cloud MVP Robot Web Publisher

React + TypeScript browser-camera robot simulator for LiveKit Cloud testing.

Use this before Android hardware testing. It calls backend `POST /api/robots/join`, receives a robot token, connects to LiveKit Cloud, and publishes the computer camera as the robot video source.

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

This app does not contain `LIVEKIT_API_SECRET`.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5174`.

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Error Categories

The publisher should show actionable errors for:

- camera permission denied
- no camera detected
- browser camera API unsupported
- backend token request failed
- LiveKit Cloud connection failed
- API/WS configuration error
- camera track publish failed

## Manual Test

1. Start backend with LiveKit Cloud env.
2. Start web-client.
3. Start this publisher.
4. Enter the same room name and a robot id.
5. Allow browser camera permission.
6. Confirm Web users see the robot video.
