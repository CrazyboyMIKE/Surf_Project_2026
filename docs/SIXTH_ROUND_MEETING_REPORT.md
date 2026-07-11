# Sixth-Round Meeting Report

日期：2026-07-10（Asia/Shanghai）

## 1. Scope

第六轮加入 LiveKit 多人会议能力，但仍不做真实机器人运动控制：

- 不调用厂商导航 SDK。
- 不接 MQTT 控制真实机器人。
- 不新增账号系统或数据库。
- 不做录制、屏幕共享或复杂会议 UI。
- 不让 backend 转发音视频帧。
- 不硬编码或打印任何 LiveKit secret。

## 2. Files Changed

Backend:

- `backend/.env.example`: 新增 `ALLOW_VIEWER_PUBLISH=false`。
- `backend/src/config.ts`: 读取 `ALLOW_VIEWER_PUBLISH`。
- `backend/src/types.ts`: 新增 `MediaPermissions`。
- `backend/src/services/liveKitTokenService.ts`: 按 `robot` / `controller` / `viewer` 生成 LiveKit grant 和 `mediaPermissions`。
- `backend/src/http/routes.ts`: Web/robot join 响应返回 `mediaPermissions`；controller request/release 返回匹配新角色的 LiveKit token。
- `backend/src/index.ts`: 启动日志显示 viewer publish 配置状态，不打印 secret。

Web client:

- `web-client/src/types.ts`: 增加 `mediaPermissions` 和控制权切换后的 token 字段类型。
- `web-client/src/useLiveKitRoom.ts`: 支持本地麦克风/摄像头发布、远端参与者收集、远端音频播放解锁、robot video 继续优先展示。
- `web-client/src/App.tsx`: 接入会议媒体控件和参与者面板；控制权变化后使用新 token 重连 LiveKit。
- `web-client/src/components/MediaControls.tsx`: controller 手动开麦/开摄像头，viewer 默认禁用。
- `web-client/src/components/ParticipantsPanel.tsx`: 展示非 robot 远端参与者、音视频状态、视频 tile 和远端 audio track。
- `web-client/src/styles.css`: 增加会议控件、预览和参与者面板样式。

Android robot:

- `android-robot/gradlew`, `android-robot/gradlew.bat`, `android-robot/gradle/wrapper/*`: 由系统 Gradle 正式生成 wrapper。
- `android-robot/app/build.gradle`: 明确 Java/Kotlin JVM target 为 1.8，保证 Android 构建一致。
- `android-robot/app/src/main/java/com/surf/robot/LiveKitRobotClient.kt`: 增加远端音频订阅/断开状态回调。
- `android-robot/app/src/main/java/com/surf/robot/MainActivity.kt`: 显示 remote audio 状态；修复权限回调签名和输入框单行设置。
- `android-robot/app/src/main/java/com/surf/robot/RobotJoinApi.kt`: 修复 OkHttp request body MediaType 使用。

Docs:

- `docs/MVP_SPEC.md`
- `docs/API_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/LIVEKIT_SETUP.md`
- `docs/ANDROID_ROBOT_SETUP.md`
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md`
- `docs/SIXTH_ROUND_MEETING_TEST_PLAN.md`
- `docs/SIXTH_ROUND_MEETING_REPORT.md`

## 3. Backend Grant Rules

Backend 现在按 role 生成 LiveKit 权限：

| Role | canJoin | canSubscribe | canPublish |
| --- | --- | --- | --- |
| robot | true | true | true |
| controller | true | true | true |
| viewer | true | true | false by default |

配置开关：

```text
ALLOW_VIEWER_PUBLISH=false
```

当 `ALLOW_VIEWER_PUBLISH=true` 时，viewer 才会获得麦克风/摄像头发布权限。

控制权变化：

- `POST /api/rooms/control/request` 成功后返回新的 controller token。
- `POST /api/rooms/control/release` 成功后返回新的 viewer token。
- Web client 用新 token 重新连接 LiveKit。

安全边界：

- `LIVEKIT_API_SECRET` 仍只在 backend 环境变量中。
- API 响应不返回 LiveKit API secret。
- LiveKit publish 权限不等于 robot control 权限；robot_control 仍由 backend WebSocket 校验 controller。

## 4. Web Media Behavior

Controller:

- 不会自动打开麦克风或摄像头。
- 点击 `Turn mic on` 后才请求浏览器麦克风权限并发布 audio track。
- 点击 `Turn camera on` 后才请求浏览器摄像头权限并发布 video track。
- 本地状态显示 `off`、`starting`、`on`、`permission denied`、`device not found`、`not allowed` 或 `error`。
- 摄像头开启后显示本地预览。

Viewer:

- 默认 `mediaPermissions.canPublish=false`。
- UI 显示 `viewer locked`。
- 麦克风/摄像头按钮 disabled。
- 即使绕过前端，默认 viewer token 也不具备 LiveKit publish grant。

Remote participants:

- `RobotVideo` 继续优先显示 identity/name 包含 `robot` 的视频。
- `ParticipantsPanel` 只展示非 robot 远端用户。
- 展示 participant name、role、audio status、video status。
- 如果远端用户开摄像头，显示 video tile。
- 远端 audio track 会挂载到 `<audio>`；浏览器阻止自动播放时显示 `Enable sound`。

## 5. Android Robot Audio Behavior

Android robot 仍然：

- 发布机器人摄像头。
- 默认不发布机器人麦克风。
- 只在用户勾选 `Publish microphone audio` 时才启用本机麦克风。
- 不控制真实硬件。

新增：

- 加入 LiveKit 后显示 remote audio 订阅状态。
- 断开或连接失败时显示 remote audio disconnected。
- 目标是播放 controller audio track 到机器人扬声器路径。

限制：

- 本轮没有在 Android UI 渲染 controller 视频。
- 当前环境没有 Android 设备，所以 controller 音频真实扬声器播放尚未实测。

## 6. Commands Run

Backend:

```bash
cd backend
npm run lint
npm run test
npm run build
```

Result:

- `npm run lint`: passed.
- `npm run test`: passed, including `commandValidation tests passed`.
- `npm run build`: passed.

Web client:

```bash
cd web-client
npm run lint
npm run test
npm run build
```

Result:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Vite emitted a non-blocking LiveKit bundle size warning.

Robot web publisher:

```bash
cd robot-web-publisher
npm run lint
npm run test
npm run build
```

Result:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Vite emitted a non-blocking LiveKit bundle size warning.

Android robot:

```bash
cd android-robot
gradle wrapper
ANDROID_HOME=/Users/linziwei/Library/Android/sdk ANDROID_SDK_ROOT=/Users/linziwei/Library/Android/sdk ./gradlew test
ANDROID_HOME=/Users/linziwei/Library/Android/sdk ANDROID_SDK_ROOT=/Users/linziwei/Library/Android/sdk ./gradlew assembleDebug
```

Result:

- `gradle wrapper`: passed after allowing Gradle access to local Gradle cache/native services.
- `./gradlew test`: passed. No unit tests exist yet, so Android test tasks were `NO-SOURCE` / up-to-date.
- `./gradlew assembleDebug`: passed.
- APK generated at `android-robot/app/build/outputs/apk/debug/app-debug.apk`.
- Android build emitted deprecation warnings for `onRequestPermissionsResult`; not blocking.
- Gradle emitted deprecation warnings about future Gradle 10 compatibility; not blocking for this round.

ADB:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb devices
```

Result:

- passed after allowing adb daemon startup.
- no Android device was attached or authorized.
- APK install was not run because `adb devices` showed no `device`.

Safety checks:

```bash
find . -name '.env' -o -name '.env.local' -o -name '.env.production'
git diff --check
rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/.git/**' --glob '!**/build/**' "LIVEKIT_API_SECRET|LIVEKIT_API_KEY|eyJ[A-Za-z0-9_-]{20,}|BEGIN PRIVATE KEY|password" backend web-client robot-web-publisher android-robot docs README.md
```

Result:

- no `.env`, `.env.local`, or `.env.production` files found.
- `git diff --check`: passed.
- secret scan found only placeholders, variable names, and documentation references; no real secret/JWT/private key was found.

## 7. Real LiveKit Scenarios Tested

Not fully tested in this environment because no real `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` were provided.

Verified by build/static checks:

- Backend can generate role-aware grants.
- Web client can compile with local media publish and remote media subscription code.
- Robot web publisher still builds.
- Android robot builds an APK with LiveKit SDK dependency.

Still requires real LiveKit:

- Controller microphone heard by Web users.
- Controller microphone heard on Android robot speaker.
- Controller camera seen by remote Web users.
- Viewer publish rejection by actual LiveKit server grant.
- Robot video + meeting media running together in one real room.

## 8. Control Permission Regression

Code path remains unchanged for robot movement safety:

- Chat continues over backend WebSocket.
- `robot_control` continues over backend WebSocket.
- Viewer still cannot send robot control.
- Controller can only send `1002`, `1003`, and `1000`.
- `1001` and arbitrary command IDs remain rejected by backend command validation.
- Android `MockRobotControlAdapter` remains the hardware boundary.
- No real movement code was added.

Regression status:

- Backend `npm run test` passed existing command validation tests.
- Full browser/manual controller-viewer regression still requires running two Web sessions with backend started.

## 9. Remaining Real-Environment Validation

Needs real LiveKit:

- Configure backend `.env` with real LiveKit Cloud values.
- Confirm backend log says `LiveKit token mode: livekit`.
- Test Alice controller mic/camera.
- Test Bob viewer lock.
- Test `ALLOW_VIEWER_PUBLISH=true` only in a controlled development test.

Needs Android device:

- Run `adb devices` until a device appears as `device`.
- Install `android-robot/app/build/outputs/apk/debug/app-debug.apk`.
- Open app and join the same room.
- Confirm Android camera appears in Web.
- Confirm Android speaker plays controller audio.

Needs public deployment:

- Deploy backend with HTTPS/WSS and WebSocket upgrade support.
- Deploy Web with `VITE_API_BASE_URL=https://...` and `VITE_WS_BASE_URL=wss://...`.
- Set backend `CORS_ORIGIN` to the deployed Web origin.
- Test external users A/B plus Android robot.

## 10. Seventh-Round Readiness

The project is closer to seventh-round readiness because:

- Backend token grants now distinguish viewer/controller/robot media permissions.
- Web controller can publish mic/camera manually.
- Viewer publish is locked by default.
- Android APK now builds with Gradle wrapper.

Do not start real robot movement control until these are complete:

- Real LiveKit meeting audio/video test passes.
- Android true-device camera and controller-audio playback pass.
- Public HTTPS/WSS deployment test passes if remote operation is required.
- A physical robot safety checklist exists.
- Real `RobotControlAdapter` is guarded by a feature flag and emergency stop path.
