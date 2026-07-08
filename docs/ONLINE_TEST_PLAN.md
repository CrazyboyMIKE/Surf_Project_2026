# Online Test Plan

## 1. Purpose

This plan verifies fourth-round public deployment:

- Public Web users can join the same room.
- Android robot can join through a public backend URL.
- Web users can watch Android robot camera video.
- Web users can chat.
- Controller/viewer permissions still work.
- Robot control remains mock display/log only.

## 2. Pre-Flight Checklist

Backend:

- `GET /health` works before the full test.
- `NODE_ENV=production`
- `PUBLIC_BASE_URL=https://your-backend.example.com`
- `CORS_ORIGIN=https://your-web.example.com`
- `LIVEKIT_URL=wss://your-project.livekit.cloud`
- `LIVEKIT_API_KEY` configured on backend only.
- `LIVEKIT_API_SECRET` configured on backend only.
- `/health` returns `{ "ok": true }`.
- Hosting provider supports WebSocket upgrade on `/ws`.

Web:

- `VITE_API_BASE_URL=https://your-backend.example.com`
- `VITE_WS_BASE_URL=wss://your-backend.example.com`
- Production build is deployed over HTTPS.
- Browser console shows no mixed-content errors.

Android:

- App installed on Android 8.1 / API 27+ robot.
- Camera permission is allowed.
- Robot has internet access.
- App `backendUrl` is `https://your-backend.example.com`.
- App `backendUrl` is not `localhost`.
- App `backendUrl` is not `http://...` for online tests.
- App `roomName` matches Web users.

LiveKit:

- LiveKit URL is public and reachable.
- Backend token mode is `livekit`.
- Robot token can publish.
- Web token can subscribe.

## 3. Test Scenario

1. External user A opens the deployed Web URL.
2. External user B opens the deployed Web URL on another network or device.
3. Android robot app enters:
   - `backendUrl=https://your-backend.example.com`
   - `robotId=robot-001`
   - `roomName=robot-room-001`
4. Android taps `Join and publish camera`.
5. Android allows camera permission.
6. A joins `robot-room-001` as controller or requests control after joining.
7. B joins `robot-room-001` as viewer.
8. A and B both see status:
   - backend connected
   - websocket connected
   - livekit connected
   - robot online
9. A and B both see Android robot camera video.
10. A sends a chat message.
11. B sees A's chat message.
12. B sends a chat message.
13. A sees B's chat message.
14. B confirms control buttons are disabled.
15. B tries to send control manually if testing low-level rejection; backend rejects with `NOT_CONTROLLER`.
16. A sends Forward.
17. A sends Left or Right.
18. A sends Stop.
19. Android app displays received `1002`, `1003`, and `1000`.
20. Android app does not move real hardware.

## 4. Expected Results

Web user A:

- Can join room.
- Can become controller if no controller exists.
- Can see robot video.
- Can chat.
- Can send only `1002`, `1003`, and `1000`.

Web user B:

- Can join room.
- Can see robot video.
- Can chat.
- Cannot send robot control as viewer.

Android robot:

- Can join backend.
- Can open backend WebSocket.
- Can connect to LiveKit.
- Can publish camera video.
- Displays control commands only.
- Does not call real movement hardware.

Backend:

- `/health` stays healthy.
- Does not expose LiveKit secret.
- Logs requests without printing secrets.
- Rejects non-controller control.
- Rejects commands outside `1002`, `1003`, and `1000`.

## 5. Failure Triage

Backend health:

```bash
curl https://your-backend.example.com/health
```

If it fails:

- Check backend deployment logs.
- Check `PORT`.
- Check start command is `npm run start` after `npm run build`.
- Check environment variables exist in the hosting dashboard.

Web cannot join:

- Check `VITE_API_BASE_URL`.
- Check browser console for CORS.
- Check backend `CORS_ORIGIN`.
- Check backend `/health`.

WebSocket fails:

- Check `VITE_WS_BASE_URL` starts with `wss://`.
- Check hosting provider supports WebSocket upgrade.
- Check public certificate is trusted.
- Check `/ws` is routed to the backend service.

LiveKit fails:

- Check backend join response has `tokenMode: "livekit"`.
- Check `LIVEKIT_URL`.
- Check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are configured only on backend.
- Check token TTL.
- Check LiveKit project/server is reachable from Web and Android networks.

Robot offline:

- Android did not complete backend join.
- Android WebSocket failed.
- Android `backendUrl` is wrong.
- Robot has no internet access.
- Backend deployment blocks WebSocket.

Waiting for robot video:

- Android is online but camera did not publish.
- Camera permission was denied.
- Camera is occupied by vendor software.
- Android and Web are in different `roomName`.
- LiveKit publish failed.

Viewer can control:

- This is a blocker.
- Re-test backend WebSocket `hello` identity.
- Re-test `currentControllerId`.
- Confirm backend command whitelist and role checks are active.

Android moves hardware:

- This must not happen in fourth round.
- Remove any real hardware adapter.
- Confirm `MockRobotControlAdapter` is still used.

## 6. Evidence to Capture

Capture for each online test:

- Backend `/health` result.
- Backend env checklist without secret values.
- Web status screenshot showing backend/websocket/livekit/robot states.
- Android status screenshot.
- A/B chat screenshot.
- Controller/viewer permission result.
- Android last control message display.

Do not capture or share LiveKit secrets, tokens, or private keys.
