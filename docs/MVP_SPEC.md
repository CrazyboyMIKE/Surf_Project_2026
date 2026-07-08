# MVP Spec

## 1. Product Goal

Build a minimum viable remote-presence robot system.

Final direction:

- Android robot app publishes camera video through LiveKit.
- Multiple Web users watch the robot camera.
- One Web user is controller.
- Other Web users are viewers.
- Users can send text chat.
- Controller can send safe movement commands.

## 2. Current MVP Goal

The first round proved the Web + Backend business loop:

- Room join works.
- Role state works.
- Chat works.
- Controller-only control permission works.
- Command whitelist works.
- Robot control relay is mock only.

The second round adds the real LiveKit video path:

- Backend can generate real LiveKit room tokens when configured with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
- Backend still falls back to mock/dev tokens when LiveKit credentials are missing.
- Web client connects to LiveKit after room join and renders the robot video track.
- `robot-web-publisher/` simulates the future Android robot camera by publishing the browser camera to LiveKit.

## 3. In Scope

Backend:

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- WebSocket `/ws` for chat and robot control relay.
- In-memory room state with `Map`.
- Real LiveKit token generation when credentials are configured.
- Mock LiveKit token mode when credentials are absent.
- Mock robot control receiving/logging.

Web:

- Join room form.
- Room status display.
- Backend, WebSocket, LiveKit, and robot status display.
- Role display.
- Real LiveKit remote robot video rendering.
- Video placeholder when robot video is not published.
- Chat panel.
- Control panel.
- Disabled control buttons for viewer.

Robot web publisher:

- Joins backend as a robot.
- Opens backend WebSocket as robot participant for online/offline status.
- Connects to LiveKit with robot token.
- Publishes local browser camera video.

Docs:

- API contract.
- Architecture.
- Robot control protocol.
- LiveKit setup.
- Android robot plan.
- Test plan.

## 4. Out of Scope

Second round still does not include:

- Real Android app implementation.
- Real robot movement.
- Robot vendor SDK integration.
- MQTT control of real hardware.
- Backend video frame proxying.
- Custom WebRTC implementation.
- Database.
- Login/register.
- Payment.
- Recording.
- Admin dashboard.
- Multi-robot management.

## 5. Roles

```text
robot
controller
viewer
```

Rules:

- One room can have one robot identity for this MVP path.
- One room can have many viewers.
- One room can have at most one controller.
- Viewer can watch video and chat but cannot control.
- Controller can watch video, chat, and send whitelisted mock control.
- Robot publisher can publish camera video through LiveKit.

## 6. Accepted Commands

Only these commands are accepted:

```text
1002
1003
1000
```

Meaning:

- `1002`: move specified distance.
- `1003`: rotate specified angle.
- `1000`: stop.

Current Web mapping:

- Forward: `1002` with `{ "distanceCm": 20 }`
- Back: `1002` with `{ "distanceCm": -20 }`
- Left: `1003` with `{ "angleDeg": -15 }`
- Right: `1003` with `{ "angleDeg": 15 }`
- Stop: `1000`

All robot control remains mock logging/WebSocket relay in the second round. No real hardware moves.

## 7. Run

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

Robot publisher:

```bash
cd robot-web-publisher
npm install
npm run dev
```

## 8. Acceptance Criteria

Second-round MVP is accepted when:

1. Backend starts locally.
2. Web client starts locally.
3. Robot web publisher starts locally.
4. Backend returns real LiveKit tokens when configured.
5. Backend returns mock tokens when LiveKit credentials are absent.
6. Web user joins a room and connects to LiveKit.
7. Robot publisher joins the same room and publishes browser camera video.
8. Web user sees the robot publisher video.
9. Chat messages still work.
10. Viewer still cannot send robot control.
11. Controller can still send only `1002`, `1003`, and `1000`.
12. No LiveKit secret is hard-coded or returned to frontend.
