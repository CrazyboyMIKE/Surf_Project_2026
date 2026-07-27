# SURF Project 2026 - LiveKit Cloud Robot Remote Presence MVP

这是一个机器人远程临场 MVP。当前主线项目位于 `livekit_cloud_mvp/`，采用 **LiveKit Cloud + Node.js Backend + React Web Client + Robot Web Publisher + Android Robot** 的方案。

项目目标是让多个远程用户进入同一个机器人房间，观看机器人第一视角视频，进行聊天和会议式音视频互动，并让唯一的 active controller 通过 backend 安全校验后控制机器人。

## Current Main Project

当前主要维护目录：

```text
livekit_cloud_mvp/
```

旧的根目录 `backend/`、`web-client/`、`robot-web-publisher/`、`android-robot/` 记录了早期 MVP 轮次。现在组会、部署、云端测试和后续开发应优先看 `livekit_cloud_mvp/`。

推荐先读：

- `livekit_cloud_mvp/README.md`
- `livekit_cloud_mvp/docs/GROUP_MEETING_SUMMARY_AND_DIAGRAMS.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_ARCHITECTURE.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_DEPLOYMENT_GUIDE.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`

## What This System Does

### Media

- LiveKit Cloud 负责所有音视频房间和 WebRTC 传输。
- Backend 只生成 LiveKit token，不转发 raw audio/video frames。
- Web client 可以观看 robot video，也可以手动开启 microphone/camera。
- robot-web-publisher 可以用浏览器摄像头/麦克风模拟机器人端。
- Android robot 通过 backend 获取 token 后发布真实机器人摄像头。

### Room and Role

- Web 用户通过 roomName 加入房间。
- 角色包括：
  - `viewer`
  - `controller`
  - `robot`
- 每个房间最多一个 active controller。
- controller 可以转交控制权给在线 viewer。
- viewer 可以观看、聊天、开麦/开摄像头，但不能控制机器人。

### Chat

- 公共 Room Chat 通过 backend WebSocket 广播给同房间用户。
- controller/viewer private chat 只投递给 sender 和 recipient。
- 私聊内容当前不做数据库持久化。

### Robot Control

机器人控制必须经过 backend：

1. 检查 room 是否存在。
2. 检查 sender 是否属于该 room。
3. 检查 sender 是否为当前 controller。
4. 检查 robot 是否在线。
5. 检查 command whitelist。
6. 校验参数范围。
7. mock 模式记录日志，real 模式通过 PadBot MQTT 适配层发送。

当前控制命令：

| Command | Meaning | Status |
|---|---|---|
| `1000` | whole robot stop | enabled |
| `1001` | continuous chassis movement | keyboard-control only, gated by env |
| `1002` | chassis move distance | enabled |
| `1003` | chassis rotate angle | enabled |
| `1004` | head stop | gated by head-control env |
| `1005` | head absolute angle control | gated by head-control env |
| `1006` | head reset | gated by head-control env |
| `1007-1009` | arm commands | not implemented |

Real robot credentials are backend-only. They must never appear in Web, Android, GitHub, screenshots, or logs.

### Admin and Persistence

- `/admin` 管理后台使用 backend `ADMIN_TOKEN` 保护。
- SQLite 持久化最近 30 天房间历史。
- 管理员可以：
  - 查看在线房间。
  - 查看 30 天 room records。
  - 查看 participants/events history。
  - kick participant。
  - close room。
- 数据库不会保存 LiveKit secret、LiveKit token、机器人 key/token、原始音视频帧。

## Current Capability Summary

| Area | Current Status |
|---|---|
| LiveKit Cloud video/audio | implemented |
| Web room join | implemented |
| Viewer/controller role | implemented |
| Controller transfer | implemented |
| Public chat | implemented |
| Controller/viewer private chat | implemented |
| Robot web publisher camera | implemented |
| Robot web publisher microphone | implemented |
| Web robot audio playback | implemented |
| Web local mute per participant | implemented |
| Admin console | implemented |
| SQLite 30-day history | implemented |
| PadBot MQTT chassis control | implemented and field-tested |
| Head control | implemented, needs real-robot angle calibration |
| Android robot app | present, needs more true-device acceptance |
| Account system | not implemented |
| Full production auth/audit | not implemented |

## Project Structure

```text
livekit_cloud_mvp/
  backend/                 Node.js + TypeScript + Express + WebSocket
  web-client/              React + TypeScript Web app
  robot-web-publisher/     Browser robot camera/mic publisher
  android-robot/           Android 8.1 robot app/docs
  deployment/              Nginx examples for LiveKit Cloud deployment
  docs/                    Architecture, deployment, reports, test plans

deployment/self-hosted-livekit/
  Legacy Scheme B self-hosted LiveKit templates
```

## Local Development

Backend:

```bash
cd livekit_cloud_mvp/backend
npm install
npm run dev
```

Web client:

```bash
cd livekit_cloud_mvp/web-client
npm install
npm run dev
```

Robot web publisher:

```bash
cd livekit_cloud_mvp/robot-web-publisher
npm install
npm run dev
```

Android robot:

```bash
cd livekit_cloud_mvp/android-robot
./gradlew assembleDebug
```

## Production Environment

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
ADMIN_ENABLED=true
ADMIN_TOKEN=CHANGE_ME_ADMIN_TOKEN
ROBOT_CONTROL_MODE=mock
ROBOT_CONTROL_ENABLED=false
```

Real robot control requires backend-only vendor/MQTT environment variables. Do not commit them.

Web client:

```text
VITE_API_BASE_URL=https://robotapi.example.com
VITE_WS_BASE_URL=wss://robotapi.example.com/ws
```

Robot web publisher:

```text
VITE_API_BASE_URL=https://robotapi.example.com
VITE_WS_BASE_URL=wss://robotapi.example.com/ws
```

Android robot:

```text
backendUrl=https://robotapi.example.com
```

Android must not use `localhost`; use a public HTTPS URL or LAN IP during local testing.

## Cloud Deployment Notes

For the LiveKit Cloud project, your cloud server only hosts backend and static Web pages.

Required public ports:

```text
22/tcp    SSH
80/tcp    HTTP challenge / redirect
443/tcp   HTTPS / WSS
```

Do **not** open LiveKit media ports for the LiveKit Cloud version. LiveKit Cloud handles media transport.

Typical cloud services:

- `robot.example.com`: web-client static site.
- `robotpub.example.com`: robot-web-publisher static site.
- `robotapi.example.com`: backend API + WebSocket.

## Checks

Backend:

```bash
cd livekit_cloud_mvp/backend
npm run lint
npm run test
npm run build
```

Web client:

```bash
cd livekit_cloud_mvp/web-client
npm run lint
npm run test
npm run build
```

Robot web publisher:

```bash
cd livekit_cloud_mvp/robot-web-publisher
npm run lint
npm run test
npm run build
```

Android robot:

```bash
cd livekit_cloud_mvp/android-robot
./gradlew test
./gradlew assembleDebug
```

## Safety Rules

- Do not commit `.env`, `.env.local`, `.env.production`.
- Do not print or expose LiveKit API secret.
- Do not put robot vendor key/token/MQTT password in frontend or Android.
- Backend must not forward raw audio/video frames.
- Viewer must never send robot control.
- `1000 stop` must always remain available.
- Test real movement in a safe open area with a person ready for physical emergency stop.

## Suggested Meeting Summary

The current MVP separates media, business state, and hardware control:

- LiveKit Cloud handles media.
- Backend handles trust, permissions, room state, token generation, chat, admin, and robot control validation.
- Web client handles user interaction.
- Robot publisher or Android robot publishes camera/audio.
- RobotControlAdapter isolates hardware-specific PadBot MQTT logic.

This separation keeps secrets out of clients and prevents viewers from bypassing backend permission checks.
