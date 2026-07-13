# Self-hosted LiveKit Acceptance Test

日期：2026-07-12（Asia/Shanghai）

This checklist validates the minimum cloud loop for Scheme B.

Do not mark a real cloud test as passed unless it has been run on real cloud infrastructure.

## 1. Preconditions

Required real resources:

- Cloud server.
- `livekit.example.com`.
- `api.example.com`.
- `web.example.com`.
- Trusted HTTPS certificates.
- Real self-hosted LiveKit API key/secret.
- Firewall/security group access.
- Android robot or Android 8.1+ test device.

Do not paste real secrets into this document.

## 2. Infrastructure Startup

Self-hosted LiveKit:

- [ ] `livekit` container/service is running.
- [ ] LiveKit config contains `port: 7880`.
- [ ] LiveKit config uses Redis.
- [ ] LiveKit config has `rtc.tcp_port: 7881`.
- [ ] LiveKit config has `rtc.port_range_start: 50000`.
- [ ] LiveKit config has `rtc.port_range_end: 60000`.
- [ ] LiveKit config has `rtc.use_external_ip: true`.
- [ ] LiveKit key/secret are real values on server only.

Redis:

- [ ] Redis container/service is running.
- [ ] LiveKit can connect to Redis.

Nginx:

- [ ] `https://livekit.example.com` reaches LiveKit WSS proxy.
- [ ] `https://api.example.com/health` reaches backend.
- [ ] `https://web.example.com` serves Web client.
- [ ] WebSocket Upgrade headers are configured for LiveKit.
- [ ] WebSocket Upgrade headers are configured for backend `/ws`.
- [ ] Certificates are trusted CA certificates, not self-signed.

Firewall/security group:

- [ ] `443/tcp` open.
- [ ] `7880/tcp` open or intentionally restricted behind Nginx.
- [ ] `7881/tcp` open.
- [ ] `50000-60000/udp` open.
- [ ] TURN ports open if TURN is enabled.
- [ ] Cloud security group checked.
- [ ] Server firewall checked.

## 3. Backend Checks

Health:

```bash
curl https://api.example.com/health
```

Expected:

```json
{ "ok": true }
```

Env check:

```bash
cd backend
npm run check:livekit-env
```

Expected:

- token mode is `livekit`.
- URL scheme is `wss://`.
- key present is `yes`.
- secret present is `yes`.
- secret value is not printed.

Token generation:

```bash
curl -s https://api.example.com/api/robots/join \
  -H "Content-Type: application/json" \
  -d '{"robotId":"robot-001","roomName":"robot-room-001"}'
```

Expected:

- [ ] `tokenMode=livekit`.
- [ ] `liveKitUrl=wss://livekit.example.com`.
- [ ] response contains `token`.
- [ ] response does not contain `LIVEKIT_API_SECRET`.

## 4. Web Client Config

Build/deploy Web with:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

Checks:

- [ ] Web user can open `https://web.example.com`.
- [ ] Web user can join `robot-room-001`.
- [ ] Status shows backend connected.
- [ ] Status shows websocket connected.
- [ ] Status shows livekit connected.

## 5. Robot Web Publisher Test

Configure robot-web-publisher with:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

Steps:

1. Open robot-web-publisher.
2. Join room `robot-room-001` as `robot-001`.
3. Allow browser camera permission.
4. Confirm publisher status:
   - backend joined.
   - websocket connected.
   - livekit connected.
   - publishing camera.

Expected:

- [ ] Computer camera publishes to self-hosted LiveKit.
- [ ] Web user sees robot video.
- [ ] If camera fails, error message identifies permission/device/browser/API/LiveKit cause.

## 6. Two Web Users Watching

Steps:

1. Alice opens `https://web.example.com`.
2. Bob opens `https://web.example.com`.
3. Both join `robot-room-001`.
4. robot-web-publisher publishes camera.

Expected:

- [ ] Alice sees robot video.
- [ ] Bob sees robot video.
- [ ] Robot video remains visible when both are connected.

## 7. Chat Test

Steps:

1. Alice sends a chat message.
2. Bob receives it.
3. Bob sends a chat message.
4. Alice receives it.

Expected:

- [ ] Chat works between two Web users.
- [ ] Empty messages are rejected.
- [ ] Messages stay in the same room.

## 8. Controller / Viewer Permission Test

Steps:

1. Alice requests controller.
2. Confirm Alice becomes controller.
3. Bob requests controller while Alice is active.
4. Confirm Bob remains viewer.
5. Bob attempts control from UI or manual WebSocket.

Expected:

- [ ] Alice can be controller.
- [ ] Bob cannot override active controller.
- [ ] Viewer control is rejected with backend error.
- [ ] Robot does not move; current behavior remains mock/log only.

## 9. Controller Commands

Controller sends:

- [ ] `1002`.
- [ ] `1003`.
- [ ] `1000 stop`.

Expected:

- [ ] Backend accepts `1002`.
- [ ] Backend accepts `1003`.
- [ ] Backend accepts `1000`.
- [ ] Backend rejects any command outside `1002`, `1003`, `1000`.
- [ ] Android or robot mock only displays/logs commands.

## 10. Controller Media

If current Web build includes meeting media controls:

- [ ] Controller can click `Turn mic on`.
- [ ] Controller can click `Turn camera on`.
- [ ] Viewer cannot publish by default when `ALLOW_VIEWER_PUBLISH=false`.

If this build does not include meeting media controls, mark as pending for the sixth round.

## 11. Android Robot True-device Test

Steps:

1. Build APK.
2. Install APK on Android 8.1+ robot/device.
3. Enter:

```text
backendUrl=https://api.example.com
robotId=robot-001
roomName=robot-room-001
```

4. Tap `Join and publish camera`.
5. Allow camera permission.

Expected:

- [ ] Android backend join succeeds.
- [ ] Android WebSocket connects.
- [ ] Android LiveKit connects.
- [ ] Android publishes robot camera.
- [ ] Web users see Android robot video.
- [ ] Android logs/displays control messages only, no real movement.

## 12. Phone 4G/5G Test

Steps:

1. Turn phone Wi-Fi off.
2. Open `https://web.example.com` on 4G/5G.
3. Join `robot-room-001`.
4. Watch robot video.

Expected:

- [ ] Phone can load Web.
- [ ] Phone can join backend WebSocket.
- [ ] Phone can connect LiveKit.
- [ ] Phone can see robot video.

If 4G/5G joins but cannot see video:

- [ ] Record TURN as pending.
- [ ] Check `50000-60000/udp`.
- [ ] Check `7881/tcp`.
- [ ] Read `docs/TURN_TROUBLESHOOTING_GUIDE.md`.

## 13. LiveKit Cloud No-consumption Check

To confirm Scheme B did not use LiveKit Cloud:

- [ ] Backend `LIVEKIT_URL` points to `wss://livekit.example.com`.
- [ ] Web network logs connect to `livekit.example.com`, not `*.livekit.cloud`.
- [ ] Android receives `wss://livekit.example.com`.
- [ ] LiveKit Cloud dashboard shows no usage increase during the test window.

## 14. Final Status

Only mark cloud minimal loop passed when all are true:

- [ ] Self-hosted LiveKit running.
- [ ] Redis running.
- [ ] Nginx HTTPS/WSS reachable.
- [ ] Backend generates self-hosted LiveKit token.
- [ ] robot-web-publisher publishes camera.
- [ ] Two Web users watch video.
- [ ] Two Web users chat.
- [ ] Controller media works if current build supports it.
- [ ] Viewer cannot control.
- [ ] Controller sends `1002`, `1003`, `1000 stop`.
- [ ] Android true device joins and publishes camera.
- [ ] Phone 4G/5G test recorded.
- [ ] LiveKit Cloud shows no usage.
