# LiveKit Robot Remote Presence MVP

这是机器人远程临场项目的 Web + Backend MVP。

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

## LiveKit Config

创建本地 `backend/.env`：

```text
PORT=3001
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
2. Start backend, Web client, and robot publisher.
3. Open `http://localhost:5173`, join `robot-room-001` as a Web user.
4. Open `http://localhost:5174`, join `robot-room-001` as `robot-001`.
5. Allow camera permission.
6. Confirm Web client LiveKit status is `connected`.
7. Confirm Web client shows the robot publisher camera video.

## Mock Scope

- No real Android app yet.
- No real robot movement.
- No robot vendor SDK or MQTT control.
- `robot_control` remains mock logging/WebSocket relay.
- Backend never forwards video frames.
