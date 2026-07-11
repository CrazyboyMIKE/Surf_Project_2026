# MVP Spec

## 1. Product Goal

Build a minimum viable remote-presence robot system:

- Android robot app joins a LiveKit room.
- Android robot app publishes its camera stream through LiveKit.
- Web users join the same room and watch the robot camera.
- One Web user can become `controller`.
- Other Web users stay as `viewer`.
- Users can send room chat.
- The controller can send only the safe command IDs `1002`, `1003`, and `1000`.
- Robot movement remains disabled until a later hardware-safety round.

## 2. Current MVP Goal

The first round proved the Web + Backend business loop:

- Room join works.
- Viewer/controller role state works.
- Chat works.
- Controller-only control permission works.
- Command whitelist works.
- Robot control relay is mock only.

The second round added the real LiveKit video path:

- Backend generates real LiveKit room tokens when configured with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
- Backend falls back to mock/dev tokens when LiveKit credentials are missing.
- Web client connects to LiveKit after room join and renders robot video tracks.
- `robot-web-publisher/` can simulate a robot camera from a browser.

The third round adds the Android robot camera publisher:

- `android-robot/` targets Android 8.1 / API 27+.
- Android calls backend `POST /api/robots/join` to obtain `liveKitUrl`, `token`, `participantId`, and role.
- Android connects to LiveKit with the backend-generated token.
- Android requests camera permission and publishes a camera video track.
- Android opens backend WebSocket `/ws` as the robot participant.
- Android receives `robot_control` messages and only displays/logs them.

The fourth round prepares public deployment:

- Backend supports production startup through environment variables.
- Backend exposes `/health` for deployment health checks.
- Web client can be built with public backend HTTP and WSS URLs.
- Android robot can use a public `https://` backend URL.
- LiveKit should be LiveKit Cloud or another publicly reachable LiveKit server.
- Public users can join the same room from different networks.

The sixth round adds basic multi-party meeting media:

- Backend generates role-aware LiveKit media grants.
- `robot` and `controller` can publish and subscribe.
- `viewer` can subscribe but cannot publish by default.
- `ALLOW_VIEWER_PUBLISH=true` can enable viewer microphone/camera publishing for test rooms.
- Web controller can manually turn microphone and camera on/off.
- Web viewers see disabled media publishing controls unless backend grants publish permission.
- Web users can see and hear non-robot remote participants.
- Android robot subscribes to remote LiveKit audio so controller audio can play through the robot speaker path.

## 3. In Scope

Backend:

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- WebSocket `/ws` for chat, role updates, robot status, and mock robot control relay.
- In-memory room state with `Map`.
- Real LiveKit token generation when credentials are configured.
- Mock LiveKit token mode when credentials are absent.
- Robot token grants `roomJoin`, `canPublish`, and `canSubscribe`.
- Controller token grants `roomJoin`, `canPublish`, and `canSubscribe`.
- Viewer token grants `roomJoin` and `canSubscribe`; `canPublish` is false unless `ALLOW_VIEWER_PUBLISH=true`.
- No LiveKit API secret returned to Web, Android, or robot publisher.
- Production config through `PORT`, `PUBLIC_BASE_URL`, `CORS_ORIGIN`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `NODE_ENV`.
- Basic request logs without printing secrets.

Web:

- Join room form.
- Backend, WebSocket, LiveKit, robot, role, and controller status display.
- Real LiveKit remote robot video rendering.
- Controller microphone and camera controls, manual only.
- Viewer media publishing locked by default according to backend token grants.
- Remote non-robot participant panel with audio/video status and video tiles.
- Prefer LiveKit participant identity/name containing `robot`.
- Show `Robot offline` when backend says robot is offline.
- Show `Waiting for robot video` when robot is online but no video track is subscribed.
- Chat panel.
- Control panel.
- Disabled control buttons for viewer.

Android robot:

- Minimal native Android app.
- `backendUrl`, `robotId`, and `roomName` inputs.
- Join button.
- Connection status display.
- Camera publish status display.
- Last received control message display.
- LiveKit Android SDK connection.
- Camera publishing.
- Optional microphone publishing switch, default off.
- Remote audio subscription for controller audio playback.
- Runtime camera/audio permission handling.
- Clear error display for permission denial, connection failure, and camera-open failure.
- Mock `RobotControlAdapter` only.

Robot web publisher:

- Kept as a browser-based simulator for local comparison and fallback testing.

Docs:

- API contract.
- Architecture.
- Robot control protocol.
- LiveKit setup.
- Android robot setup.
- Android robot plan.
- Deployment guide.
- Online test plan.
- Test plan.

## 4. Out of Scope

Sixth round does not include:

- Real robot movement.
- Robot vendor navigation SDK integration.
- MQTT control of real hardware.
- Backend video frame proxying.
- Custom WebRTC implementation.
- Database.
- Account system.
- Complex UI.
- Recording.
- Screen sharing.
- Billing.
- Admin dashboard.
- Multi-robot scheduling.
- Hard-coded secrets in Android, Web, or backend code.

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
- Controller can manually publish microphone and camera media.
- Viewer can watch/listen and chat but cannot publish media by default.
- Robot can publish camera video through LiveKit.
- Robot can subscribe to controller audio.
- Robot can receive control messages but must not move hardware in the sixth round.

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

Current Android behavior:

- `1002`, `1003`, and `1000` are shown/logged in the Android app.
- Disallowed command IDs are ignored.
- No command controls real motors, navigation, or vendor SDKs.

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

Robot web publisher, optional simulator:

```bash
cd robot-web-publisher
npm install
npm run dev
```

Android robot debug build:

```bash
cd android-robot
gradle assembleDebug
```

If a Gradle wrapper is generated locally:

```bash
cd android-robot
./gradlew assembleDebug
```

## 8. Acceptance Criteria

Sixth-round MVP is accepted when:

1. Backend starts locally.
2. Web client starts locally.
3. Backend returns real LiveKit tokens when configured.
4. Backend returns mock tokens when LiveKit credentials are absent.
5. Backend has a documented production `npm run start`.
6. Backend CORS can be restricted to the deployed Web origin.
7. Web client build can use `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.
8. Android robot app can use a public `https://` backend URL.
9. External Web user A joins a room.
10. External Web user B joins the same room.
11. Android robot joins the same room and publishes camera video.
12. A and B see the Android robot camera video.
13. Chat messages still work.
14. Viewer still cannot send robot control.
15. Controller can still send only `1002`, `1003`, and `1000`.
16. Android app displays received control messages but does not move hardware.
17. No LiveKit secret is hard-coded or returned to clients.
18. Controller can manually enable/disable microphone.
19. Controller can manually enable/disable camera.
20. Viewer publish controls are disabled when `ALLOW_VIEWER_PUBLISH=false`.
21. Non-robot remote participants appear in the participants panel.
22. Remote audio can be enabled when browser autoplay policy blocks sound.
23. Android robot shows remote audio subscription/playback status for controller audio.
