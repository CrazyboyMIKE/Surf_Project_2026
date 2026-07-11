# Self-hosted LiveKit Deployment Guide

日期：2026-07-11（Asia/Shanghai）

## 1. Purpose

方案B使用用户自己的云服务器部署 LiveKit Server，不使用 LiveKit Cloud。

本项目仍然保持同一条媒体架构：

```text
Web client / robot-web-publisher / Android robot
  -> backend HTTP/WebSocket
  -> backend generates LiveKit token
  -> clients connect directly to self-hosted LiveKit Server
```

Backend 只生成 token 和处理业务消息，不转发音视频帧。

## 2. Why It Does Not Consume LiveKit Cloud Quota

当 backend 配置为：

```text
LIVEKIT_URL=wss://livekit.example.com
```

并且 `livekit.example.com` 指向你的自建 LiveKit Server 时，媒体和房间都在你的服务器上运行，不进入 LiveKit Cloud 项目，因此不消耗 LiveKit Cloud 额度。

仍会产生这些成本：

- 云服务器费用。
- 公网流量和带宽费用。
- 域名费用。
- HTTPS 证书运维成本。
- TURN 中继流量费用，如果启用 TURN。

## 3. Architecture

Recommended public domains:

```text
LiveKit Server: wss://livekit.example.com
Backend API: https://api.example.com
Backend WebSocket: wss://api.example.com/ws
Web Client: https://web.example.com
TURN, optional: turns://turn.example.com:5349
```

Component responsibilities:

- LiveKit Server: audio/video SFU and room media transport.
- Backend: room state, role/controller permission, LiveKit token signing, chat/control WebSocket.
- Web client: room join, chat, robot video, controller media publish, remote participant display.
- robot-web-publisher: browser camera simulator for robot video.
- Android robot: backend join, LiveKit token use, camera publishing, controller audio subscription.

## 4. Deployment Templates

Templates are under:

```text
deployment/self-hosted-livekit/
```

Files:

- `livekit.yaml.example`
- `docker-compose.example.yml`
- `nginx-livekit.example.conf`
- `backend.env.selfhost.example`
- `web.env.selfhost.example`
- `robot-web-publisher.env.selfhost.example`
- `android-config.selfhost.example.md`

All key, secret, domain, and certificate paths are placeholders.

## 5. LiveKit Server Config

Minimum LiveKit ports:

- `7880/tcp`: LiveKit HTTP/WebSocket. Usually reverse proxied as HTTPS/WSS.
- `7881/tcp`: RTC TCP fallback.
- `50000-60000/udp`: WebRTC media UDP range.

Production recommendation:

- Use trusted HTTPS/WSS certificates, such as Let's Encrypt.
- Avoid self-signed certs for Android tests.
- Enable TURN when users or robots are behind restrictive NAT or mobile networks.

## 6. Backend Config

Use `deployment/self-hosted-livekit/backend.env.selfhost.example` as a template.

Required values:

```text
PORT=3001
NODE_ENV=production
PUBLIC_BASE_URL=https://api.example.com
CORS_ORIGIN=https://web.example.com
LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

Rules:

- `LIVEKIT_API_SECRET` is backend-only.
- Do not put `LIVEKIT_API_SECRET` in Web, robot-web-publisher, Android, screenshots, or logs.
- `ALLOW_VIEWER_PUBLISH=false` keeps viewer microphone/camera publishing disabled by default.
- For local self-hosted LAN tests, `LIVEKIT_URL=ws://<server-lan-ip>:7880` can be used only when clients are also on a compatible insecure local origin.
- For public tests, use `wss://livekit.example.com`.

Backend env check:

```bash
cd backend
npm run check:livekit-env
```

This checks whether `LIVEKIT_URL` is `mock://`, `ws://`, or `wss://` and whether required credentials are present. It does not print secret values.

## 7. Web Client Config

Use `deployment/self-hosted-livekit/web.env.selfhost.example`:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

The Web client does not need `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET`. It receives `liveKitUrl` and a short-lived token from backend after room join.

## 8. Robot Web Publisher Config

Use `deployment/self-hosted-livekit/robot-web-publisher.env.selfhost.example`:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

The robot web publisher calls backend `POST /api/robots/join`, receives robot token, then publishes browser camera to the self-hosted LiveKit Server.

## 9. Android Robot Config

Android app field:

```text
backendUrl=https://api.example.com
```

Android does not need LiveKit secret.

Flow:

1. Android calls backend `/api/robots/join`.
2. Backend returns `liveKitUrl=wss://livekit.example.com` and `token`.
3. Android connects to LiveKit with the returned token.
4. Android publishes camera video.

Android requirements:

- Android 8.1 robot can reach public HTTPS/WSS.
- Certificate must be trusted by Android.
- If using self-signed certs, Android may fail to connect.

## 10. LAN Test vs Public Test

LAN test:

- Backend can run on `http://<computer-lan-ip>:3001`.
- LiveKit can run on `ws://<server-lan-ip>:7880`.
- Android `backendUrl` uses the computer/server LAN IP.
- Browser media permissions work on `localhost`; non-local insecure origins may be blocked.

Public test:

- Backend must use `https://api.example.com`.
- Backend WebSocket must use `wss://api.example.com/ws`.
- LiveKit must use `wss://livekit.example.com`.
- Web must use `https://web.example.com`.
- Android must use trusted public certificates.

## 11. TURN

TURN relays media when direct WebRTC connectivity fails.

You may need TURN when:

- Users are on 4G/5G.
- Users are behind symmetric NAT.
- Robot is on a restricted campus/company network.
- UDP media ports are blocked.

TURN increases bandwidth cost because media may relay through the server.

## 12. Safety Boundaries

方案B only changes media infrastructure.

It does not change:

- controller/viewer robot-control permissions.
- allowed robot command IDs: `1002`, `1003`, `1000`.
- Android `MockRobotControlAdapter`.
- no real robot movement.
- no backend audio/video frame proxying.
