# Web Client

React + TypeScript web client for the robot remote-presence MVP.

The Web client is now responsible for robot video viewing, chat, controller/viewer UI, controller microphone/camera publishing, and non-robot remote participant display.

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
VITE_API_BASE_URL=https://api.your-domain.com
VITE_WS_BASE_URL=wss://api.your-domain.com/ws
```

`VITE_WS_URL` is still supported for older local configs, but new deployments should use `VITE_WS_BASE_URL`.

The Web client does not need `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET`. It receives `liveKitUrl`, a short-lived token, and `mediaPermissions` from backend.

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
- Controller can manually turn microphone on/off.
- Controller can manually turn camera on/off.
- Viewer microphone/camera buttons are disabled by default when backend returns `mediaPermissions.canPublish=false`.
- Non-robot remote participants are shown in the participants panel with audio/video status.
- Remote audio is attached to browser audio elements; if autoplay is blocked, the page shows an enable-sound action.

## Scheme B / Self-hosted Cloud

For self-hosted LiveKit, only point the Web build at the public backend:

```text
VITE_API_BASE_URL=https://api.your-domain.com
VITE_WS_BASE_URL=wss://api.your-domain.com/ws
```

Backend returns `liveKitUrl=wss://livekit.your-domain.com` after room join. Do not put LiveKit API keys or secrets in this project.

## Manual Checks

1. Start backend.
2. Open two Web browser windows.
3. Join the same room.
4. Request controller in one window.
5. Confirm the viewer cannot send robot control.
6. Confirm controller can send `1002`, `1003`, and `1000 stop`.
7. Confirm chat works both ways.
8. If real LiveKit is configured, confirm controller mic/camera can be manually enabled.
9. If a robot publisher is online, confirm robot video is displayed.
