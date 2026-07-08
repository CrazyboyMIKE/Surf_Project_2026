# LiveKit Robot Remote Presence MVP

这是机器人远程临场项目的 Web + Backend + Android Robot MVP。

第一轮完成：

- Web 用户加入同一个房间。
- 同房间多人聊天。
- 每个房间最多一个 `controller`。
- `viewer` 可以观看和聊天，但不能控制。
- `controller` 可以发送 `1002`、`1003`、`1000` 三种安全白名单命令。
- Robot control 只做 mock 记录/广播。

第二轮完成：

- Backend 支持真实 LiveKit token 生成。
- 缺少 LiveKit 环境变量时继续使用 mock token。
- Web client 使用 `livekit-client` 连接 LiveKit 并显示 robot 视频。
- `robot-web-publisher/` 用浏览器摄像头模拟 Android 机器人发布端。

第三轮完成：

- `android-robot/` 提供 Android 8.1 / API 27+ 机器人发布端。
- Android App 调用 backend `POST /api/robots/join` 获取 LiveKit token。
- Android App 使用 LiveKit Android SDK 加入房间并发布摄像头画面。
- Android App 通过 backend WebSocket 接收 `robot_control`，但只显示/mock，不控制真实硬件。
- Web client 可以识别 identity/name 包含 `robot` 的 Android participant 并显示视频。

第四轮完成：

- Backend 支持生产启动和公网环境变量配置。
- Web client 支持 `VITE_API_BASE_URL` 和 `VITE_WS_BASE_URL`。
- Android App 可以填写公网 `https://` backendUrl。
- 新增部署文档和线上多人测试计划。

## LiveKit Config

创建本地 `backend/.env`：

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

不要提交 `.env`。如果 LiveKit 三个核心变量缺失，后端会返回 `tokenMode: "mock"`。

## Run

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
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

如果本地生成了 Gradle wrapper，也可以在 `android-robot/` 下运行：

```bash
./gradlew assembleDebug
```

Production backend:

```bash
cd backend
npm install
npm run build
npm run start
```

Production Web build:

```bash
cd web-client
VITE_API_BASE_URL=https://your-backend.example.com VITE_WS_BASE_URL=wss://your-backend.example.com npm run build
```

Open:

- Web client: `http://localhost:5173`
- Robot publisher: `http://localhost:5174`

## Checks

```bash
cd backend
npm run lint
npm run test
npm run build
```

```bash
cd web-client
npm run lint
npm run test
npm run build
```

```bash
cd robot-web-publisher
npm run lint
npm run test
npm run build
```

## Manual Video Test

1. Configure `backend/.env` with real LiveKit values.
2. Start backend and Web client.
3. Open `http://localhost:5173`, join `robot-room-001` as a Web user.
4. Install and open Android robot app.
5. Android `backendUrl` must be the computer LAN IP or a public backend URL, not `localhost`.
6. Android joins `robot-room-001` as `robot-001`.
7. Allow camera permission.
8. Confirm Web client LiveKit status is `connected`.
9. Confirm Web client shows the Android robot camera video.

Fallback simulator:

1. Start `robot-web-publisher`.
2. Open `http://localhost:5174`, join `robot-room-001` as `robot-001`.
3. Allow browser camera permission.
4. Confirm Web client LiveKit status is `connected`.
5. Confirm Web client shows the robot publisher camera video.

## Deployment

See:

- `docs/DEPLOYMENT.md`
- `docs/ONLINE_TEST_PLAN.md`

Online Android `backendUrl` should be:

```text
https://your-backend.example.com
```

Do not use `localhost` or `http://` for online tests.

## Mock Scope

- No real robot movement.
- No robot vendor SDK or MQTT control.
- `robot_control` remains mock logging/WebSocket relay.
- Backend never forwards video frames.
