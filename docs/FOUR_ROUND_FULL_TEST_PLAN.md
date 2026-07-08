# Four-Round Full Test Plan

## 1. Purpose

This document is the full acceptance test plan for the first four MVP rounds.

It covers:

- Backend build/test.
- Web client build/test.
- Robot web publisher build/test.
- Android robot build/install.
- Real LiveKit video test.
- Android robot camera test.
- Online HTTPS/WSS test.
- Controller/viewer permission test.
- Secret safety check.
- Final acceptance checklist.

This plan does not include fifth-round work, real robot movement, vendor navigation SDKs, MQTT hardware control, database work, accounts, recording, or backend video frame proxying.

## 2. Environment Matrix

Local business-loop environment:

```text
backend: http://localhost:3001
web-client: http://localhost:5173
robot-web-publisher: http://localhost:5174
LiveKit: mock://livekit or local LiveKit server
```

Real LiveKit environment:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=backend-only
LIVEKIT_API_SECRET=backend-only
```

Android environment:

```text
Android Studio or Android SDK
Gradle or generated Gradle wrapper
Android 8.1 / API 27+ robot or test phone
ADB for debug install
```

Online environment:

```text
backend: https://your-backend.example.com
backend websocket: wss://your-backend.example.com/ws
web-client: https://your-web.example.com
LiveKit: wss://your-project.livekit.cloud
Android backendUrl: https://your-backend.example.com
```

## 3. Backend Build/Test

Commands:

```bash
cd backend
npm run lint
npm run test
npm run build
```

Pass criteria:

- TypeScript check passes.
- Command validation tests pass.
- Build produces `backend/dist/`.
- No command prints secrets.

Manual API smoke test:

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "ok": true
}
```

## 4. Web Client Build/Test

Commands:

```bash
cd web-client
npm run lint
npm run test
npm run build
```

Pass criteria:

- TypeScript check passes.
- Production build succeeds.
- `VITE_API_BASE_URL` is supported.
- `VITE_WS_BASE_URL` is supported.
- Build output does not contain `LIVEKIT_API_SECRET`.

Non-blocking note:

- Vite may warn that LiveKit client chunks exceed 500 KB. This is acceptable for the current MVP unless the build fails.

## 5. Robot Web Publisher Build/Test

Commands:

```bash
cd robot-web-publisher
npm run lint
npm run test
npm run build
```

Pass criteria:

- TypeScript check passes.
- Production build succeeds.
- Publisher can be configured with `VITE_API_BASE_URL`.
- Publisher can be configured with `VITE_WS_BASE_URL`.
- Build output does not contain `LIVEKIT_API_SECRET`.

## 6. Android Robot Build/Install

Check project structure:

```bash
cd android-robot
ls
```

Expected:

```text
settings.gradle
build.gradle
gradle.properties
app/
```

If `gradle` is available but `gradlew` is missing, generate wrapper:

```bash
cd android-robot
gradle wrapper
```

Then run:

```bash
./gradlew test
./gradlew assembleDebug
```

If no Gradle wrapper exists and no system Gradle exists, Android build is blocked. Do not hand-write `gradlew` or `gradle-wrapper.jar`.

Install debug APK:

```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Pass criteria:

- `./gradlew test` passes, if tests exist.
- `./gradlew assembleDebug` produces `app-debug.apk`.
- APK installs on Android 8.1 / API 27+ device.
- App launches without crash.
- App requests camera permission.
- App never asks for, stores, or displays LiveKit API secret.

## 7. Real LiveKit Video Test With Robot Web Publisher

Backend `.env`:

```text
PORT=3001
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

Start services:

```bash
cd backend
npm run dev
```

```bash
cd web-client
npm run dev
```

```bash
cd robot-web-publisher
npm run dev
```

Test steps:

1. Open Web client at `http://localhost:5173`.
2. Join `robot-room-001` as `Alice`.
3. Open robot publisher at `http://localhost:5174`.
4. Join `robot-room-001` as `robot-001`.
5. Allow browser camera permission.
6. Confirm robot publisher status becomes publishing.
7. Confirm Web status shows:
   - backend connected
   - websocket connected
   - livekit connected
   - robot online
8. Confirm Web shows robot camera video.

Pass criteria:

- Backend join response has `tokenMode: "livekit"`.
- Web uses backend-returned `liveKitUrl` and token.
- Robot publisher uses backend-returned robot token.
- Robot participant identity/name contains `robot`.
- Web `RobotVideo` renders the robot participant video track.

## 8. Android Robot Camera Test

Preconditions:

- Android APK built and installed.
- Backend has real LiveKit env.
- Android device has camera permission available.
- Android device can reach backend.

Local LAN test:

```text
backendUrl=http://<computer-LAN-IP>:3001
robotId=robot-001
roomName=robot-room-001
```

Online test:

```text
backendUrl=https://your-backend.example.com
robotId=robot-001
roomName=robot-room-001
```

Steps:

1. Start backend and Web client.
2. Open Android app.
3. Enter `backendUrl`, `robotId`, and `roomName`.
4. Keep microphone off unless explicitly testing audio.
5. Tap `Join and publish camera`.
6. Allow camera permission.
7. Open Web client and join the same room.
8. Confirm Web shows robot online.
9. Confirm Web shows Android camera video.

Pass criteria:

- Android backend join succeeds.
- Android WebSocket connects.
- Android LiveKit connects.
- Android camera publishes.
- Web subscribes to Android robot participant video.
- Android displays any received `robot_control`.
- Android does not move real hardware.

## 9. Controller/Viewer Permission Test

Use backend WebSocket or two Web browser windows.

Steps:

1. Join room as Alice requesting controller.
2. Join same room as Bob requesting controller.
3. Confirm Alice is controller.
4. Confirm Bob is viewer.
5. Confirm Bob's control buttons are disabled.
6. Bob attempts manual WebSocket `robot_control`.
7. Backend rejects Bob with `NOT_CONTROLLER`.
8. Alice sends `1002`.
9. Alice sends `1003`.
10. Alice sends `1000`.
11. Backend rejects `1001`.
12. Backend rejects `9999`.

Pass criteria:

- One active controller per room.
- Viewer cannot control through UI or manual WebSocket.
- Only `1002`, `1003`, and `1000` are accepted.
- Robot receives/records mock control only.

## 10. Online HTTPS/WSS Test

Pre-deploy checklist:

- Backend `/health` returns OK locally.
- Backend env includes `PUBLIC_BASE_URL=https://your-backend.example.com`.
- Backend env includes `CORS_ORIGIN=https://your-web.example.com`.
- Backend env includes real LiveKit values.
- Web env includes `VITE_API_BASE_URL=https://your-backend.example.com`.
- Web env includes `VITE_WS_BASE_URL=wss://your-backend.example.com`.
- Hosting provider supports WebSocket upgrade on `/ws`.
- Public HTTPS certificate is valid.
- Android `backendUrl` is not `localhost`.
- Android online `backendUrl` uses `https://`.

Test steps:

1. Open `https://your-backend.example.com/health`.
2. Open Web client from user A.
3. Open Web client from user B on another network or device.
4. Android robot joins with public `backendUrl`.
5. A and B join the same room.
6. A and B see robot camera video.
7. A becomes controller.
8. B remains viewer.
9. A and B exchange chat messages.
10. A sends `1002`, `1003`, and `1000`.
11. B cannot send control.
12. Android displays control commands only.

Pass criteria:

- HTTPS API works.
- WSS WebSocket works.
- CORS allows only configured Web origin.
- LiveKit is connected.
- Robot video appears for both users.
- Controller/viewer rules still hold online.

## 11. Secret Safety Check

Commands:

```bash
find . -name '.env' -o -name '.env.local' -o -name '.env.production'
```

```bash
rg -n "LIVEKIT_API_SECRET|LIVEKIT_API_KEY|eyJ|BEGIN PRIVATE KEY|password" .
```

Expected:

- No real `.env` files are committed.
- `.env.example` contains placeholders only.
- `LIVEKIT_API_SECRET` appears only in backend docs/examples/config names.
- Web and Android source do not contain real LiveKit API secret values.
- Logs do not print tokens or secrets.

Manual review:

- Check backend logs during join.
- Check Web browser console.
- Check Android UI.
- Confirm no token or secret is displayed.

## 12. Final Acceptance Checklist

Code/build:

- [ ] Backend lint/test/build passed.
- [ ] Web client lint/test/build passed.
- [ ] Robot web publisher lint/test/build passed.
- [ ] Android `./gradlew test` passed, or blocked reason recorded.
- [ ] Android `./gradlew assembleDebug` passed, or blocked reason recorded.

Business loop:

- [ ] Room join works.
- [ ] Robot join works.
- [ ] Chat works across users.
- [ ] One controller rule works.
- [ ] Viewer cannot control.
- [ ] Controller can send `1002`, `1003`, `1000`.
- [ ] `1001` and arbitrary commands are rejected.

Video:

- [ ] Backend returns `tokenMode: "livekit"` with real credentials.
- [ ] Robot web publisher publishes camera.
- [ ] Web client renders robot publisher video.
- [ ] Android robot publishes camera.
- [ ] Web client renders Android robot video.

Deployment:

- [ ] Backend deployed with HTTPS/WSS.
- [ ] Web deployed with HTTPS.
- [ ] `CORS_ORIGIN` matches deployed Web origin.
- [ ] `VITE_API_BASE_URL` uses `https://`.
- [ ] `VITE_WS_BASE_URL` uses `wss://`.
- [ ] Hosting provider supports WebSocket upgrade.
- [ ] Android online `backendUrl` uses `https://`.

Safety:

- [ ] No real movement code is enabled.
- [ ] No vendor SDK/MQTT control is called.
- [ ] `MockRobotControlAdapter` is still active.
- [ ] No `.env` or secret is committed.
- [ ] Backend does not proxy video frames.

Final sign-off:

- [ ] All blocked items have a real environment reason.
- [ ] Evidence screenshots/logs are captured without secrets.
- [ ] Any failed item has an owner and next action.
