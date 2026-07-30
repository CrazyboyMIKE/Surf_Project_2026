# LiveKit Cloud Robot Remote Presence MVP

This directory is the actively maintained LiveKit Cloud version of the robot remote-presence MVP.

LiveKit Cloud handles all audio/video rooms and WebRTC transport. Our backend handles room state, roles, LiveKit token generation, chat, admin operations, SQLite room history, and safe robot-control validation/dispatch. The backend does **not** forward raw audio/video frames.

## Components

```text
backend/              Express + TypeScript + WebSocket + SQLite
web-client/           React + TypeScript user/admin Web app
robot-web-publisher/  Browser robot camera/microphone publisher
android-robot/        Android 8.1 robot app/docs
deployment/           Nginx examples for cloud deployment
docs/                 Architecture, setup, reports, and test plans
```

## Current Scope

Implemented:

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- WebSocket `/ws`
- viewer/controller/robot room roles
- controller request, release, and transfer
- public room chat
- controller/viewer private chat
- LiveKit Cloud token generation in backend
- Web robot video/audio subscription
- Web participant media panel
- Web local mute per viewer/robot audio
- Web controller/viewer microphone and camera publishing
- robot-web-publisher camera and optional microphone publishing
- robot-web-publisher controller video/audio priority display
- Android robot camera publishing code/docs
- `/admin` room management console protected by backend admin token
- SQLite-backed 30-day room history
- admin room history, participant/event detail, kick participant, and close room operations
- backend robot-control validation
- mock robot-control adapter
- PadBot MQTT real-mode adapter
- keyboard continuous chassis control through gated `1001`

Not included:

- self-hosted LiveKit Server in this directory
- Redis
- coturn/TURN deployment
- LiveKit Nginx reverse proxy
- custom WebRTC/SFU
- backend audio/video frame forwarding
- account system
- production-grade admin authentication/audit log
- arm control commands `1007` / `1008` / `1009`

## Media and Control Model

Media path:

```text
Web / Robot Publisher / Android
  -> LiveKit Cloud
  -> audio/video transport
```

Business path:

```text
Web / Robot Publisher / Android
  -> backend HTTPS / WSS
  -> room state, roles, chat, admin, robot control
```

Robot control path:

```text
Controller Web UI
  -> backend WebSocket
  -> permission + whitelist + parameter validation
  -> RobotControlAdapter
  -> mock log or PadBot MQTT
  -> physical robot
```

## Robot Commands

| Command | Meaning | Availability |
|---|---|---|
| `1000` | whole robot stop | controller only |
| `1001` | continuous chassis movement | keyboard-control path only |
| `1002` | chassis move distance | controller only |
| `1003` | chassis rotate angle | controller only |
| `1004-1006` | head control | removed, rejected by normal robot_control |
| `1007-1009` | arm control | not implemented |

## LiveKit Cloud Setup

Create a LiveKit Cloud project and copy its WebSocket URL, API key, and API secret into backend runtime environment only.

Backend example:

```text
PORT=3002
NODE_ENV=production
PUBLIC_BASE_URL=https://robotapi.example.com
CORS_ORIGIN=https://robot.example.com,https://robotpub.example.com
DATABASE_URL=file:./data/livekit_cloud_mvp.sqlite
ROOM_RECORD_RETENTION_DAYS=30
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_CLOUD_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_CLOUD_API_SECRET
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=true
MOCK_ROBOT_ONLINE=false
ADMIN_ENABLED=false
ADMIN_TOKEN=CHANGE_ME_ADMIN_TOKEN
ROBOT_CONTROL_MODE=mock
ROBOT_CONTROL_ENABLED=false
ROBOT_ENABLE_KEYBOARD_CONTROL=false
ROBOT_ENABLE_CONTINUOUS_1001=false
```

Web and robot publisher example:

```text
VITE_API_BASE_URL=https://robotapi.example.com
VITE_WS_BASE_URL=wss://robotapi.example.com/ws
```

Android only receives:

```text
backendUrl=https://robotapi.example.com
```

Web, robot-web-publisher, and Android never need `LIVEKIT_API_SECRET` or robot vendor credentials.

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

For the LiveKit Cloud version, the cloud server only needs backend and Web hosting.

Open:

```text
22/tcp
80/tcp
443/tcp
```

Do not add LiveKit media-server port rules for this project. LiveKit Cloud handles media transport.

Typical domains:

```text
robot.example.com       web-client
robotpub.example.com    robot-web-publisher
robotapi.example.com    backend API + WebSocket
```

Start from:

- `docs/LIVEKIT_CLOUD_REQUIREMENTS.md`
- `docs/LIVEKIT_CLOUD_DEPLOYMENT_GUIDE.md`
- `docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`
- `docs/LIVEKIT_CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`
- `docs/GROUP_MEETING_SUMMARY_AND_DIAGRAMS.md`

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
- Web, robot-web-publisher, and Android must not contain LiveKit Cloud secret.
- Web, robot-web-publisher, and Android must not contain robot vendor key/token/MQTT password.
- Backend must not forward raw audio/video frames.
- Viewer cannot send robot control.
- `1000 stop` must always remain available.
- Continuous `1001` must stay behind explicit backend env switches.
- Real robot tests must happen in a safe open area with a person ready for physical emergency stop.
