# Self-hosted LiveKit Acceptance Test

日期：2026-07-11（Asia/Shanghai）

## 1. Preconditions

Required real resources:

- Cloud server for LiveKit Server.
- Domain for LiveKit, for example `livekit.example.com`.
- Domain for backend, for example `api.example.com`.
- Domain for Web, for example `web.example.com`.
- Trusted HTTPS certificates.
- LiveKit API key and API secret generated for the self-hosted LiveKit Server.
- Firewall open for LiveKit ports.
- Android robot or Android 8.1+ test device for Android camera test.

Do not use real secrets in screenshots or reports.

## 2. Backend Health Check

```bash
curl https://api.example.com/health
```

Expected:

```json
{ "ok": true }
```

## 3. Backend LiveKit Env Check

Run on backend deployment host or locally with the same env:

```bash
cd backend
npm run check:livekit-env
```

Expected:

- token mode is `livekit`.
- `LIVEKIT_URL scheme` is `wss://`.
- API key present is `yes`.
- API secret present is `yes`.
- no secret value is printed.

## 4. Token Generation Check

Robot token check without copying token value:

```bash
curl -s https://api.example.com/api/robots/join \
  -H "Content-Type: application/json" \
  -d '{"robotId":"robot-001","roomName":"robot-room-001"}'
```

Expected fields:

- `tokenMode` is `livekit`.
- `liveKitUrl` is `wss://livekit.example.com`.
- `participantId` starts with `robot-`.
- response includes `token`.
- response does not include `LIVEKIT_API_SECRET`.

## 5. Web Join Room

1. Open `https://web.example.com`.
2. Join `robot-room-001` as Alice.
3. Request `controller`.
4. Confirm status:
   - backend connected.
   - websocket connected.
   - livekit connected.
   - role controller.

## 6. Robot Web Publisher Camera Test

1. Open robot-web-publisher deployment or local publisher configured with:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

2. Join `robot-room-001` as `robot-001`.
3. Allow browser camera permission.
4. Confirm publisher status:
   - backend joined.
   - websocket connected.
   - livekit connected.
   - publishing camera.
5. Confirm Web client shows robot video.

## 7. Two Web Users Watching

1. Alice opens `https://web.example.com` on one machine/network.
2. Bob opens `https://web.example.com` on another browser or device.
3. Both join `robot-room-001`.
4. robot-web-publisher or Android robot publishes camera.

Expected:

- Alice sees robot video.
- Bob sees robot video.
- Chat messages appear for both.

## 8. Android Robot Camera Test

1. Install Android robot APK on Android 8.1+ robot/device.
2. Enter:

```text
backendUrl=https://api.example.com
robotId=robot-001
roomName=robot-room-001
```

3. Tap `Join and publish camera`.
4. Allow camera permission.
5. Confirm Android status:
   - backend joined.
   - WebSocket connected.
   - LiveKit connected.
   - camera publishing.
6. Confirm Web client sees Android camera video.

If Android cannot connect:

- Check certificate trust.
- Check Android can reach `https://api.example.com/health`.
- Check Android can reach `wss://livekit.example.com`.
- Check firewall and UDP media ports.

## 9. External 4G/5G Viewing

1. Turn Wi-Fi off on a phone.
2. Open `https://web.example.com` on 4G/5G.
3. Join the same room.
4. Confirm robot video appears.

If video fails on mobile data:

- Check UDP `50000-60000` is open.
- Check RTC TCP `7881` is open.
- Consider enabling TURN.

## 10. Controller Request/Release

1. Alice requests controller.
2. Confirm Alice is controller.
3. Bob requests controller while Alice is active.
4. Confirm Bob remains viewer.
5. Alice releases control.
6. Bob requests controller again.
7. Confirm Bob becomes controller.

## 11. Viewer Control Rejected

1. Bob is viewer.
2. Bob's control buttons should be disabled.
3. Bob attempts manual WebSocket `robot_control`.

Expected:

- backend rejects with `NOT_CONTROLLER`.
- robot does not move.
- Android only displays/logs accepted commands.

## 12. Chat Test

1. Alice sends a chat message.
2. Bob receives it.
3. Bob sends a chat message.
4. Alice receives it.

Expected:

- Messages stay in the same room.
- Empty messages are rejected.

## 13. LiveKit Cloud No-consumption Check

To confirm this test did not consume LiveKit Cloud:

1. Open LiveKit Cloud dashboard.
2. Confirm no project using this room shows new participant minutes or bandwidth for the test window.
3. Confirm backend `LIVEKIT_URL` points to `wss://livekit.example.com`, not `wss://*.livekit.cloud`.
4. Confirm Web network logs connect to `livekit.example.com`.
5. Confirm Android status or logs use backend-returned `wss://livekit.example.com`.

## 14. Final Checklist

- [ ] Backend `/health` works.
- [ ] Backend env check passes without printing secrets.
- [ ] Backend token response has `tokenMode=livekit`.
- [ ] Web joins room.
- [ ] robot-web-publisher publishes camera.
- [ ] Two Web users watch robot video.
- [ ] Android robot publishes camera.
- [ ] 4G/5G external user can watch.
- [ ] Controller request/release works.
- [ ] Viewer control is rejected.
- [ ] Chat works.
- [ ] LiveKit Cloud shows no consumption.
- [ ] No real robot movement is enabled.
