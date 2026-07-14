# LiveKit Cloud Robot Remote Presence MVP

This is an isolated LiveKit Cloud version of the robot remote-presence MVP.

It does not deploy or configure a self-hosted LiveKit Server. LiveKit Cloud provides all audio/video rooms and WebRTC transport. This project only deploys:

- `backend/`: room state, roles, LiveKit Cloud token generation, chat, controller ownership, and mock robot-control relay.
- `web-client/`: Web viewing, chat, controller/viewer UI, robot video, and safe control buttons.
- `robot-web-publisher/`: browser-camera robot simulator for validating the video path before Android hardware.
- `android-robot/`: Android 8.1 robot app/docs for publishing a real robot camera through backend-issued LiveKit Cloud tokens.

## Current Scope

Implemented in this isolated project:

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- WebSocket `/ws`
- viewer/controller roles
- chat over backend WebSocket
- LiveKit Cloud token generation in backend
- robot publisher token with publish permission
- viewer/controller tokens can publish microphone and camera media
- robot video subscription in Web
- robot-web-publisher camera publishing
- Android robot camera publishing code copied from the main MVP
- mock-only robot control commands: `1002`, `1003`, `1000`

Not included:

- self-hosted LiveKit Server
- Redis
- coturn or TURN deployment
- LiveKit Nginx proxy
- custom WebRTC/SFU
- backend audio/video frame forwarding
- database or account system
- real robot motion control

## LiveKit Cloud Setup

Create a LiveKit Cloud project and copy its WebSocket URL, API key, and API secret into backend runtime environment only.

Backend example:

```text
PORT=3001
NODE_ENV=production
PUBLIC_BASE_URL=https://api.example.com
CORS_ORIGIN=https://web.example.com
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_CLOUD_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_CLOUD_API_SECRET
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

Web and robot publisher example:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

Android only receives:

```text
backendUrl=https://api.example.com
```

Web, robot-web-publisher, and Android never need `LIVEKIT_API_SECRET`.

Viewer and controller users can both manually turn microphone/camera on in Web after joining with a LiveKit Cloud token. Robot movement/control permissions are still separate: only the active controller can send `1002`, `1003`, or `1000`.

## Local Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Web client:

```bash
cd web-client
npm install
npm run dev
```

Robot web publisher:

```bash
cd robot-web-publisher
npm install
npm run dev
```

Android robot:

```bash
cd android-robot
./gradlew assembleDebug
```

## Cloud Deployment

For the Cloud version, the cloud server only needs backend and Web hosting.

Open:

```text
22/tcp
80/tcp
443/tcp
```

Do not add LiveKit media-server port rules for this project. LiveKit Cloud handles media transport.

Start from:

- `docs/LIVEKIT_CLOUD_REQUIREMENTS.md`
- `docs/LIVEKIT_CLOUD_DEPLOYMENT_GUIDE.md`
- `docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`
- `docs/LIVEKIT_CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`

## Checks

Backend:

```bash
npm run lint
npm run test
npm run build
npm run check:livekit-env
```

Web client:

```bash
npm run lint
npm run test
npm run build
```

Robot web publisher:

```bash
npm run lint
npm run test
npm run build
```

Android robot:

```bash
./gradlew test
./gradlew assembleDebug
```

## Safety

- Backend must not return `LIVEKIT_API_SECRET`.
- Backend must not print LiveKit key/secret/token values.
- Web and Android must not contain LiveKit Cloud secret.
- Controller control commands are restricted to `1002`, `1003`, and `1000`.
- `1000 stop` is a required acceptance test.
- Real robot movement is not implemented in this project.
