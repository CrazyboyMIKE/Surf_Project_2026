# LiveKit Robot Remote Presence MVP

这是一个机器人远程临场 MVP：Android 机器人端发布摄像头，Web 用户观看机器人视频、多人聊天、申请 controller，并通过后端安全白名单发送 mock 控制命令。音视频全部由 LiveKit 处理，backend 不转发视频帧。

## Current Status

截至当前提交，项目已经完成：

- 第 1 轮：Web + Backend 最小业务闭环。
- 第 2 轮：真实 LiveKit 视频链路和 `robot-web-publisher` 摄像头模拟器。
- 第 3 轮：Android 8.1 / API 27+ robot app，发布真实摄像头画面。
- 第 4 轮：公网部署配置、HTTPS/WSS、CORS、线上测试文档。
- 第 5 轮：真实环境验收补强，Android 构建、LiveKit、部署 readiness 文档。
- 第 5.5 轮：方案B，自建 LiveKit Server + Redis + Nginx 云端部署模板和联调准备。
- 第 6 轮：多人会议能力，controller 可手动开麦/开摄像头，viewer 默认不能发布媒体，Android robot 可订阅 controller 音频。

换句话说：**已完成 6 个产品开发轮次 + 1 个方案B部署准备轮次**。当前代码/文档已经具备真实云端最小闭环测试条件，但还没有在真实云服务器、真实域名、可信证书、Android 真机和公网 4G/5G 环境中完成最终验收。

## Implemented Goals

已实现或准备就绪的核心目标：

| # | Goal | Status |
|---:|---|---|
| 1 | Web 用户加入房间 | done |
| 2 | 多人加入同一房间 | done |
| 3 | `viewer` / `controller` 角色区分 | done |
| 4 | 每个房间最多一个 controller | done |
| 5 | 同房间文字聊天 | done |
| 6 | viewer 不能发送 robot control | done |
| 7 | controller 只能发送 `1002` / `1003` / `1000` | done |
| 8 | robot control mock 记录/转发，不控制真实硬件 | done |
| 9 | Backend 生成 LiveKit token，缺配置时保留 mock mode | done |
| 10 | Web 订阅 robot participant 视频 | done |
| 11 | `robot-web-publisher` 发布浏览器摄像头 | done |
| 12 | Android robot app 发布 Android 摄像头 | done, needs true-device acceptance |
| 13 | 线上 HTTPS/WSS 配置和部署文档 | ready |
| 14 | 方案B自建 LiveKit Server 部署模板 | ready |
| 15 | Controller 手动开麦/开摄像头 | done, needs real LiveKit acceptance |
| 16 | Viewer 默认不能发布麦克风/摄像头 | done |
| 17 | Android robot 订阅 controller 音频 | built, needs true-device audio acceptance |

明确未做或仍需真实环境验证：

- 未做真实机器人运动控制。
- 未调用厂商导航 SDK。
- 未接 MQTT 真实控制。
- 未新增账号系统或数据库。
- 未做录制回放、支付、复杂权限后台。
- 自建云端 LiveKit 真实部署、Android 真机摄像头公网发布、手机 4G/5G 观看仍需实测。

## Project Structure

```text
backend/                    Node.js + TypeScript + Express + WebSocket
web-client/                 React + TypeScript Web client
robot-web-publisher/        Browser camera robot simulator
android-robot/              Android Kotlin robot camera publisher
deployment/self-hosted-livekit/
                             Scheme B self-hosted LiveKit deployment templates
docs/                       Specs, architecture, setup, test plans, reports
```

## LiveKit Modes

### Local mock mode

Use this when you do not have LiveKit credentials yet:

```text
LIVEKIT_URL=mock://livekit
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Backend returns `tokenMode: "mock"` and media is not real.

### LiveKit Cloud mode

Put real LiveKit Cloud values only in `backend/.env`:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

### Scheme B self-hosted mode

Run your own LiveKit Server + Redis + Nginx on a cloud server:

```text
LIVEKIT_URL=wss://livekit.your-domain.com
LIVEKIT_API_KEY=your-self-hosted-key
LIVEKIT_API_SECRET=your-self-hosted-secret
```

The key/secret must match `deployment/self-hosted-livekit/livekit.yaml`. Do not put the secret in Web, Android, screenshots, logs, or GitHub.

## Local Run

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

Android robot app:

```bash
cd android-robot
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Open:

- Web client: `http://localhost:5173`
- Robot publisher: `http://localhost:5174`

## Production / Cloud Run

Backend production env:

```text
PORT=3001
NODE_ENV=production
PUBLIC_BASE_URL=https://api.your-domain.com
CORS_ORIGIN=https://web.your-domain.com
LIVEKIT_URL=wss://livekit.your-domain.com
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

Web production env:

```text
VITE_API_BASE_URL=https://api.your-domain.com
VITE_WS_BASE_URL=wss://api.your-domain.com/ws
```

Android robot online `backendUrl`:

```text
https://api.your-domain.com
```

Do not use `localhost` on Android. Online Android and phone tests should use trusted HTTPS/WSS certificates, not self-signed certificates.

For Scheme B, start from:

- `deployment/self-hosted-livekit/README.md`
- `deployment/self-hosted-livekit/CLOUD_DEPLOYMENT_RUNBOOK.md`
- `docs/SELF_HOSTED_LIVEKIT_DEPLOYMENT_GUIDE.md`
- `docs/SELF_HOSTED_LIVEKIT_ACCEPTANCE_TEST.md`
- `docs/CLOUD_MINIMAL_LOOP_PREP_REPORT.md`

Required cloud ports for Scheme B:

```text
443/tcp              HTTPS/WSS
80/tcp               Let's Encrypt HTTP challenge and redirect
7881/tcp             LiveKit ICE TCP fallback
50000-60000/udp      LiveKit WebRTC media ports
7880/tcp             Optional if LiveKit is exposed directly instead of only through Nginx
```

Do not expose Redis `6379/tcp` to the public internet.

## Checks

Backend:

```bash
cd backend
npm run lint
npm run test
npm run build
npm run check:livekit-env
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

Android robot:

```bash
cd android-robot
./gradlew test
./gradlew assembleDebug
```

## Manual Acceptance Path

1. Start backend with real LiveKit or self-hosted Scheme B env.
2. Start `web-client`.
3. Start `robot-web-publisher` and allow browser camera permission.
4. Join the same room from two Web users.
5. Confirm both Web users see robot publisher video.
6. Confirm chat works between Web users.
7. Request controller from one Web user.
8. Confirm viewer cannot control.
9. Confirm controller can send `1002`, `1003`, and `1000 stop`.
10. If meeting media is enabled, controller manually turns mic/camera on.
11. Build/install Android robot app.
12. Android joins the same room with `backendUrl=https://api.your-domain.com`.
13. Confirm Web sees Android robot camera.
14. Confirm Android only displays/logs received control messages and does not move real hardware.

## Safety Scope

- No real robot movement is implemented.
- No robot vendor SDK or MQTT control is connected.
- `robot_control` remains mock logging/WebSocket relay.
- Backend never forwards raw video or audio frames.
- Web and Android never contain `LIVEKIT_API_SECRET`.
- The command whitelist remains `1002`, `1003`, and `1000`.
