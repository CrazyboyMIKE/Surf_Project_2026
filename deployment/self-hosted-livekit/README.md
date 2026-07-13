# Self-hosted LiveKit Deployment Templates

这些文件是“方案B：自建 LiveKit Server”的部署模板。

不要直接把示例 key、secret、domain 用于生产。生产环境必须生成自己的 LiveKit API key/secret，并使用可信 HTTPS/WSS 证书。

## 1. Address Roles

示例中刻意区分这些地址：

- LiveKit Server: `wss://livekit.example.com`
- Backend API: `https://api.example.com`
- Backend WebSocket: `wss://api.example.com/ws`
- Web client: `https://web.example.com`
- TURN server, optional: `turns://turn.example.com:5349`

Web、robot-web-publisher 和 Android 都不需要 `LIVEKIT_API_SECRET`。它们只连接 backend，并使用 backend 返回的 `liveKitUrl` 和短期 token。

## 2. Files

- `livekit.yaml.example`: LiveKit Server 示例配置。
- `docker-compose.example.yml`: LiveKit + Redis 示例 compose。
- `nginx-livekit.example.conf`: `livekit.example.com` 的 WSS 反向代理示例。
- `nginx-backend.example.conf`: `api.example.com` 的 HTTPS API + `/ws` 反向代理示例。
- `nginx-web.example.conf`: `web.example.com` 静态 Web 前端示例。
- `backend.env.selfhost.example`: backend 连接自建 LiveKit 的环境变量示例。
- `backend.env.cloud.example`: 云端真实联调用 backend env 示例。
- `web.env.selfhost.example`: Web client 连接线上 backend 的环境变量示例。
- `web.env.cloud.example`: 云端真实联调用 Web env 示例。
- `robot-web-publisher.env.selfhost.example`: robot web publisher 连接线上 backend 的环境变量示例。
- `robot-web-publisher.env.cloud.example`: 云端真实联调用 publisher env 示例。
- `android-config.selfhost.example.md`: Android robot app 的自建 LiveKit 配置说明。
- `android-cloud-config.example.md`: Android 公网云端联调配置说明。
- `CLOUD_DEPLOYMENT_RUNBOOK.md`: 云服务器逐步部署 runbook。
- `CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`: 部署过程打勾记录模板。

## 3. Basic Flow

1. 在云服务器上部署 LiveKit Server。
2. 给 `livekit.example.com` 配 HTTPS/WSS 反向代理。
3. 在 backend 环境变量中设置:
   - `LIVEKIT_URL=wss://livekit.example.com`
   - `LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET`
4. 部署 backend 到 `https://api.example.com`。
5. 部署 Web client 到 `https://web.example.com`。
6. Android robot app 填写 `backendUrl=https://api.example.com`。

## 4. Firewall Checklist

云服务器至少需要开放：

- `443/tcp`: HTTPS/WSS for Web, backend API/WebSocket, and LiveKit WSS proxy.
- `7880/tcp`: LiveKit HTTP/WebSocket，通常放在 Nginx HTTPS/WSS 反向代理后。
- `7881/tcp`: LiveKit RTC TCP fallback。
- `50000-60000/udp`: WebRTC UDP media ports。
- TURN ports, only if TURN is enabled. Common examples:
  - `3478/udp`
  - `3478/tcp`
  - `5349/tcp` for TLS TURN

如果用户或机器人在严格 NAT、校园网、公司网、移动网络下连接失败，通常需要配置 TURN。

注意：

- Nginx 只代理 HTTPS/WSS/API。
- LiveKit WebRTC UDP media ports `50000-60000/udp` 不经过 Nginx，必须在云厂商安全组和服务器系统防火墙中直接放行。
- `7880/tcp` 是否公网暴露取决于你的 Nginx 方案；如果只允许 Nginx 访问，可以只在内网/本机开放。
- 云厂商安全组和服务器系统防火墙都要检查。

## 5. Cost Notes

方案B不消耗 LiveKit Cloud 额度，因为媒体进入你自建的 LiveKit Server。

仍然会产生：

- 云服务器费用。
- 云服务器公网出入带宽费用。
- 域名费用。
- HTTPS 证书管理成本，Let's Encrypt 免费但需要续期。
- TURN 流量费用，如果启用 TURN。

## 6. Production Reminders

- 不要使用 `YOUR_LIVEKIT_API_KEY` 或 `YOUR_LIVEKIT_API_SECRET` 作为真实值。
- 不要把 `LIVEKIT_API_SECRET` 放进 Web、robot-web-publisher、Android 或截图。
- 生产 Web/Android 应使用 `https://` 和 `wss://`。
- Android 8.1 和手机公网测试不要使用自签证书；生产环境使用 Let's Encrypt 或其他可信证书。
- backend 仍负责 controller/viewer 权限和 robot_control whitelist。
- 云端最小闭环优先验证 LiveKit、Redis、Nginx、backend token、robot-web-publisher 摄像头、两个 Web 用户观看/聊天、viewer 越权拒绝、`1002`、`1003`、`1000 stop` 和 Android 真机摄像头。
