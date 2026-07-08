# Test Plan

## 1. Automated Checks

Run from `backend/`:

```bash
npm run lint
npm run test
npm run build
```

Run from `web-client/`:

```bash
npm run lint
npm run test
npm run build
```

Run from `robot-web-publisher/` as an optional simulator check:

```bash
npm run lint
npm run test
npm run build
```

Run from `android-robot/` in an Android SDK + Gradle environment:

```bash
gradle assembleDebug
```

If a Gradle wrapper is generated locally:

```bash
./gradlew assembleDebug
```

Backend `npm run test` currently runs command validation unit checks. Web projects currently use TypeScript checking for `test`.

For online deployment tests, also follow `docs/ONLINE_TEST_PLAN.md`.

## 2. LiveKit Configuration Test

Create `backend/.env` locally:

```text
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

Do not commit `backend/.env`.

If LiveKit values are missing, backend should still start and return `tokenMode: "mock"`. Android camera publishing requires `tokenMode: "livekit"`.

## 3. Backend Manual Test

Start backend:

```bash
cd backend
npm run dev
```

Check health:

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "ok": true
}
```

Join robot:

```bash
curl -X POST http://localhost:3001/api/robots/join \
  -H "Content-Type: application/json" \
  -d '{"robotId":"robot-001","roomName":"robot-room-001"}'
```

Expected:

- `role` is `robot`.
- `participantId` is `robot-robot-001`.
- `tokenMode` is `livekit` when LiveKit env is configured.
- `tokenMode` is `mock` when LiveKit env is not configured.
- Response must not contain `LIVEKIT_API_SECRET`.

Join user:

```bash
curl -X POST http://localhost:3001/api/rooms/join \
  -H "Content-Type: application/json" \
  -d '{"roomName":"robot-room-001","participantName":"Alice","requestedRole":"controller"}'
```

## 4. Android Real Camera Video Test

1. Configure `backend/.env` with real LiveKit values.
2. Start backend:

```bash
cd backend
npm run dev
```

3. Start Web client:

```bash
cd web-client
npm run dev
```

4. Build Android robot app:

```bash
cd android-robot
gradle assembleDebug
```

5. Install debug APK:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

6. Put the Android 8.1 robot and the computer on the same network, or expose backend through a public HTTPS/WSS address.
7. Open Android app.
8. Enter `backendUrl`, for example `http://192.168.1.23:3001`.
9. Enter `robotId`, for example `robot-001`.
10. Enter `roomName`, for example `robot-room-001`.
11. Keep microphone audio off unless explicitly testing audio.
12. Tap `Join and publish camera`.
13. Allow camera permission.
14. Open Web client at `http://localhost:5173`.
15. Join the same room as Alice or Bob.
16. Confirm Web status shows LiveKit connected.
17. Confirm Web status shows robot online.
18. Confirm Web shows the Android robot camera video.

Expected Web placeholders:

- `Robot offline` when the Android robot has not joined backend WebSocket.
- `Waiting for robot video` when Android is online but has not published or the camera failed.
- Live robot video when Android published a video track.

## 5. Android Permission and Camera Failure Test

Camera permission denied:

1. Deny camera permission when prompted.
2. Android app should show a permission-denied message.
3. Android app should not crash.
4. Web should not show robot video.

Camera occupied:

1. Open another app that uses the robot camera.
2. Join from the Android robot app.
3. Android app should show a camera-open failure message.
4. The message should tell the operator to check permission or camera occupancy.

Network failure:

1. Enter an invalid `backendUrl`.
2. Android app should show backend join failure.
3. Android app should not crash.

Mock token mode:

1. Start backend without LiveKit env values.
2. Join from Android.
3. Android app should show that LiveKit is in mock token mode.
4. Android app should not attempt to publish camera to LiveKit.

## 6. Android Control Message Test

1. Start backend and Web client.
2. Android robot joins room and opens WebSocket.
3. Web user joins same room as `controller`.
4. Controller sends Forward, Back, Left, Right, and Stop.
5. Android app should update the last control message display.
6. Android app must not move real hardware.

Expected command display:

- `1002` shows mock move distance.
- `1003` shows mock rotate angle.
- `1000` shows mock stop.
- Any other command is ignored or rejected before reaching Android.

## 7. Chat Test

1. Alice sends `hello from Alice`.
2. Bob should see the message in another Web client window.
3. Bob sends `hello from Bob`.
4. Alice should see the message.
5. Empty chat message should not send from the UI.
6. Messages over 500 characters are rejected by backend.

## 8. Control Permission Test

As viewer Bob:

- Control buttons should be disabled.
- If Bob sends control manually through WebSocket, backend should reject with `NOT_CONTROLLER`.

As controller Alice:

- Forward sends command `1002`.
- Back sends command `1002`.
- Left/right send command `1003`.
- Stop sends command `1000`.
- Backend logs `[mock-robot]` for accepted control.
- Web client windows and Android robot WebSocket receive the mock robot command event.

## 9. Rejection Test

Backend must reject:

- Command `1001`.
- Command `9999`.
- Missing `roomName`.
- Missing `senderId`.
- Sender not in room.
- Sender that does not match WebSocket `hello`.
- Viewer sender.
- Robot offline when `MOCK_ROBOT_ONLINE=false` and no robot joined.
- Out-of-range movement parameters.

## 10. Robot Web Publisher Fallback Test

Use this if no Android device is available:

1. Configure real LiveKit env.
2. Start backend.
3. Start Web client.
4. Start `robot-web-publisher`.
5. Join the same room from Web and robot publisher.
6. Confirm browser camera appears in Web.

This verifies the LiveKit Web video path but does not validate Android camera publishing.

## 11. Public Deployment Smoke Test

1. Deploy backend with production env.
2. Confirm:

```bash
curl https://your-backend.example.com/health
```

3. Deploy Web client with:

```text
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

4. Android robot uses:

```text
backendUrl=https://your-backend.example.com
```

5. External Web user A and B join the same room.
6. Android robot joins the same room.
7. A and B see robot video.
8. A can control as controller.
9. B cannot control as viewer.
10. Android displays control messages only.

Troubleshooting details live in `docs/ONLINE_TEST_PLAN.md`.

## 12. Fourth-Round Done Criteria

The fourth round is done when:

- Backend and Web apps can build.
- Android project structure is present and targets API 27+.
- Backend can produce LiveKit JWTs without exposing secrets.
- Robot token allows join, publish, and subscribe for the requested room.
- Web client can connect to LiveKit with backend token.
- Backend has documented production env and start command.
- Web client has documented public backend HTTP/WSS env.
- Android robot can join backend and LiveKit in a real Android environment using public `https://` backend URL.
- Android robot can publish camera video.
- Web client can render Android robot video.
- Existing chat and controller/viewer control permission still work.
- Android receives `1002`, `1003`, and `1000` as display/log-only mock commands.
- Public online test plan exists.
