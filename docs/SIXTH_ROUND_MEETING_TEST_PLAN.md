# Sixth-Round Meeting Test Plan

日期：2026-07-10（Asia/Shanghai）

## 1. Scope

第六轮只验收 LiveKit 多人会议媒体能力：

- Web controller 手动开麦/开摄像头。
- Web viewer 默认只能订阅，不能发布麦克风/摄像头。
- 非 robot 远端参与者音视频展示。
- Android robot 订阅并播放 controller 音频。
- 原有 robot video、chat、controller/viewer 控制权限不回归。

第六轮不验收真实机器人运动、厂商导航 SDK、MQTT、账号系统、数据库、录制、屏幕共享或 backend 音视频帧转发。

## 2. Environment

Backend `.env` for real LiveKit:

```text
PORT=3001
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

Do not commit `backend/.env` and do not paste tokens/secrets into reports.

Local services:

```bash
cd backend
npm run dev
```

```bash
cd web-client
npm run dev
```

Optional browser robot camera simulator:

```bash
cd robot-web-publisher
npm run dev
```

Android robot:

```bash
cd android-robot
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 3. Automated Checks

Backend:

```bash
cd backend
npm run lint
npm run test
npm run build
```

Web client:

```bash
cd web-client
npm run lint
npm run test
npm run build
```

Robot web publisher:

```bash
cd robot-web-publisher
npm run lint
npm run test
npm run build
```

Android robot, if wrapper and Android SDK are available:

```bash
cd android-robot
./gradlew test
./gradlew assembleDebug
```

## 4. Scenario A: Controller Opens Microphone

Steps:

1. Start backend with real LiveKit credentials.
2. Start Web client.
3. Start Android robot or `robot-web-publisher`.
4. Alice joins room `robot-room-001` requesting `controller`.
5. Confirm Alice Web status shows `livekit connected`.
6. Alice clicks `Turn mic on`.
7. Browser asks for microphone permission; Alice clicks Allow.
8. Confirm Alice local media status shows `Mic on`.
9. Join Bob as viewer in another browser.
10. Bob hears Alice, or Android robot plays Alice audio through speaker.

Pass criteria:

- Microphone is not opened automatically.
- Controller must click before publishing audio.
- Permission denial shows a clear error.
- Remote audio can be enabled if browser autoplay blocks playback.

## 5. Scenario B: Viewer Default Cannot Publish

Steps:

1. Keep backend `ALLOW_VIEWER_PUBLISH=false`.
2. Bob joins the same room as `viewer`.
3. Confirm Meeting Media shows `viewer locked`.
4. Confirm mic/camera buttons are disabled.
5. If Bob manually bypasses UI and attempts LiveKit publish, token grant should reject publishing.

Pass criteria:

- Viewer can watch robot video and hear remote participants.
- Viewer cannot publish microphone/camera by default.
- No frontend-only change can grant publish permission without a backend-issued token.

## 6. Scenario C: Multi-Web Meeting

Steps:

1. Alice joins as controller.
2. Bob joins as viewer.
3. Charlie joins as viewer.
4. Alice clicks `Turn mic on`.
5. Alice optionally clicks `Turn camera on`.
6. Bob and Charlie see Alice in `Participants`.
7. Bob and Charlie hear Alice after enabling sound if prompted.
8. Restart backend with `ALLOW_VIEWER_PUBLISH=true` for a separate development test.
9. Bob rejoins and confirms viewer publishing controls become available.
10. Bob turns mic on and Alice/Charlie hear Bob.

Pass criteria:

- Non-robot participants show name, role, audio status, video status, and video tile when camera is on.
- Remote audio tracks attach and play after user gesture if required.
- Viewer publishing only works when backend grants it.

## 7. Scenario D: Robot Video Regression

Steps:

1. Start Android robot or `robot-web-publisher`.
2. Robot joins the same room and publishes camera.
3. Alice turns mic/camera on.
4. Bob joins and listens.
5. Confirm Web `RobotVideo` still prioritizes robot participant video.

Pass criteria:

- Robot video does not disappear when Web participant media is active.
- If robot is offline, Web shows `Robot offline`.
- If robot is online but has no video track, Web shows `Waiting for robot video`.

## 8. Scenario E: Control Permission Regression

Steps:

1. Alice is controller.
2. Bob is viewer.
3. Alice sends `1002`, `1003`, and `1000`.
4. Bob tries control through UI and manual WebSocket.
5. Attempt command `1001`.
6. Attempt command `9999`.

Pass criteria:

- Alice can send only `1002`, `1003`, and `1000`.
- Bob cannot control.
- `1001` and `9999` are rejected.
- Android robot only displays/logs received accepted commands and does not move hardware.

## 9. Android Controller Audio Test

Steps:

1. Build and install Android APK.
2. Android robot enters `backendUrl`, `robotId`, and `roomName`.
3. Android taps `Join and publish camera`.
4. Web Alice joins as controller.
5. Alice clicks `Turn mic on`.
6. Confirm Android status shows remote audio subscribed/connected.
7. Confirm controller speech plays through robot speaker.

Troubleshooting:

- Confirm Android and Web joined the same `roomName`.
- Confirm backend returns `tokenMode=livekit`.
- Confirm Alice's browser permission is granted and local status says `Mic on`.
- Click `Enable sound` on Web if Web playback is blocked.
- Turn up Android media volume and check Bluetooth/output routing.
- Use `adb logcat` for LiveKit/audio route errors.

## 10. Secret Safety

Run:

```bash
find . -name '.env' -o -name '.env.local' -o -name '.env.production'
```

```bash
rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/.git/**' "LIVEKIT_API_SECRET|LIVEKIT_API_KEY|eyJ[A-Za-z0-9_-]{20,}|BEGIN PRIVATE KEY|password" .
```

Expected:

- Real `.env` files are not committed.
- Secret scan only finds placeholder names and docs.
- Web and Android source do not contain LiveKit API secret.
- Logs and UI do not print LiveKit token contents.

## 11. Final Checklist

- [ ] Backend lint/test/build passed.
- [ ] Web client lint/test/build passed.
- [ ] Robot web publisher lint/test/build passed.
- [ ] Android `./gradlew test` passed or blocked reason recorded.
- [ ] Android `./gradlew assembleDebug` passed or blocked reason recorded.
- [ ] `ALLOW_VIEWER_PUBLISH=false` viewer lock verified.
- [ ] Controller microphone verified.
- [ ] Controller camera verified.
- [ ] Remote Web participants panel verified.
- [ ] Remote audio playback verified.
- [ ] Android controller audio playback verified.
- [ ] Robot video regression verified.
- [ ] Chat regression verified.
- [ ] Controller/viewer robot-control regression verified.
- [ ] No real movement code enabled.
- [ ] No secrets committed or printed.
