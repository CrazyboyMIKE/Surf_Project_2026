# LiveKit Setup

## 1. Purpose

Second, third, and fourth-round development use LiveKit for real audio/video transport.

The backend only generates LiveKit tokens. It does not proxy video frames.

## 2. Required Values

Create `backend/.env` locally:

```text
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

Never commit `backend/.env`.

Use `backend/.env.example` as the committed template.

## 3. LiveKit Cloud Project Setup

Use this path when validating the real video link with LiveKit Cloud:

1. Sign in to LiveKit Cloud.
2. Create a new project for this MVP.
3. Open the project settings or keys page.
4. Copy the project WebSocket URL, usually:

```text
wss://your-project.livekit.cloud
```

5. Create or copy an API key and API secret.
6. Put these values only in `backend/.env`.
7. Do not put the API key or API secret in `web-client`, `robot-web-publisher`, Android source, screenshots, or logs.

Backend local `.env` example:

```text
PORT=3001
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
ALLOW_VIEWER_PUBLISH=false
MOCK_ROBOT_ONLINE=false
```

Keep these values backend-only:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Do not copy them into `web-client/.env`, `robot-web-publisher/.env`, Android source, screenshots, chat messages, or reports.

After backend starts, confirm the log says:

```text
LiveKit token mode: livekit
```

You can also confirm real token mode without printing token contents:

```bash
curl -s http://localhost:3001/api/robots/join \
  -H "Content-Type: application/json" \
  -d '{"robotId":"robot-001","roomName":"robot-room-001"}'
```

Expected fields:

- `tokenMode` is `livekit`.
- `liveKitUrl` is your `wss://...livekit.cloud` URL.
- `participantId` starts with `robot-`.
- The response includes a `token`, but you should not paste it into reports or screenshots.
- The response must not include `LIVEKIT_API_SECRET`.

If you want to avoid printing the token while checking the response, use:

```bash
curl -s http://localhost:3001/api/robots/join \
  -H "Content-Type: application/json" \
  -d '{"robotId":"robot-001","roomName":"robot-room-001"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s);console.log({tokenMode:j.tokenMode,liveKitUrl:j.liveKitUrl,participantId:j.participantId,hasToken:Boolean(j.token),hasSecretField:Object.prototype.hasOwnProperty.call(j,"LIVEKIT_API_SECRET")});})'
```

## 4. Mock Mode

If any of these values are missing:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

the backend returns:

```json
{
  "tokenMode": "mock"
}
```

In mock mode:

- Web client does not connect to LiveKit.
- Robot publisher and Android robot app do not publish camera video to LiveKit.
- Business features still run for room, chat, role, and mock control testing.

## 5. Real LiveKit Mode

When all required values are configured:

- `POST /api/rooms/join` returns a real LiveKit JWT for Web users.
- `POST /api/robots/join` returns a real LiveKit JWT for the robot publisher or Android robot app.
- Web users can subscribe to tracks.
- Robot clients can publish camera video.
- Robot clients can subscribe if needed by later data/channel work.
- API secret remains only on the backend.

For online deployment, `LIVEKIT_URL` must be reachable from public Web clients and Android robots, usually `wss://...`.

## 6. Robot Web Publisher Real Video Test

Use this test before Android device testing. It validates the real LiveKit media path with the browser camera.

Before starting, confirm:

- Backend `.env` has real LiveKit values.
- Backend startup log says `LiveKit token mode: livekit`.
- `MOCK_ROBOT_ONLINE=false` if you want robot online/offline to reflect real robot publisher WebSocket state.
- `backend/.env` CORS includes both `http://localhost:5173` and `http://localhost:5174`.
- Browser camera permission is available for `localhost`.

Start backend:

```bash
cd backend
npm run dev
```

Start Web client:

```bash
cd web-client
npm run dev
```

Start robot publisher:

```bash
cd robot-web-publisher
npm run dev
```

Test:

1. Open `http://localhost:5173`.
2. Join room `robot-room-001` as `Alice`.
3. Open `http://localhost:5174`.
4. Join room `robot-room-001` as `robot-001`.
5. Allow browser camera permission.
6. Confirm robot publisher shows:
   - Backend joined or robot online.
   - WebSocket connected.
   - LiveKit connected.
   - Publish publishing.
   - Token livekit.
7. Confirm Web status shows:
   - backend connected.
   - websocket connected.
   - livekit connected.
   - robot online.
8. Confirm the Web robot video area shows the robot publisher camera.
9. Open browser developer tools only if needed, and do not copy the returned token into notes.

If the Web side does not show video:

- Check backend join response has `tokenMode: "livekit"`.
- Check both pages use exactly the same `roomName`.
- Check robot publisher camera permission.
- Check robot participant identity/name contains `robot`.
- Check `LIVEKIT_URL` starts with `wss://` for cloud tests.
- Refresh the Web client and rejoin if the token expired.
- Check that `MOCK_ROBOT_ONLINE=false` is set when validating real robot online/offline behavior.
- Check that the browser did not block camera access because the page is not `localhost` or HTTPS.
- Check LiveKit Cloud project status and usage limits.

## 7. Confirming the Robot Video Track

A successful Web-side video test should show:

- Web status: `livekit connected`.
- Robot status: `online`.
- Video badge with robot identity/name, usually `robot-...` or the submitted `robotId`.
- No `Robot offline` placeholder.
- No `Waiting for robot video` placeholder after camera publishing starts.

For low-level inspection:

1. Open browser developer tools.
2. Check the Network tab for successful backend `/api/rooms/join` and `/api/robots/join` responses.
3. Confirm both responses contain `tokenMode: "livekit"`.
4. Do not copy or share the returned LiveKit token.
5. Check console for LiveKit connection errors.

## 8. Meeting Media Test

Sixth-round meeting media uses the same LiveKit room as robot video.

Backend media grant defaults:

```text
ALLOW_VIEWER_PUBLISH=false
```

With this default:

- `controller` can manually publish microphone and camera.
- `viewer` can subscribe to audio/video but cannot publish microphone or camera.
- `robot` can publish camera and subscribe to controller audio.

To test viewer publishing in a controlled development room only:

```text
ALLOW_VIEWER_PUBLISH=true
```

Restart backend after changing the value.

Controller microphone/camera test:

1. Configure real LiveKit credentials and confirm backend log says `LiveKit token mode: livekit`.
2. Start backend, Web client, and either Android robot or `robot-web-publisher`.
3. Join Web as Alice requesting `controller`.
4. Confirm Web status shows `livekit connected`.
5. Click `Turn mic on`.
6. Allow browser microphone permission.
7. Confirm local media status shows `Mic on`.
8. Click `Turn camera on`.
9. Allow browser camera permission.
10. Confirm local preview appears.
11. Join another Web user in the same room and confirm Alice appears in `Participants`.

Viewer locked test:

1. Join Web as Bob requesting `viewer`.
2. Confirm Meeting Media shows `viewer locked`.
3. Confirm mic/camera buttons are disabled.
4. If Bob tries to publish by bypassing UI, the LiveKit token grant should reject publishing while `ALLOW_VIEWER_PUBLISH=false`.

Remote audio playback:

- Browser autoplay policy may block remote audio until a user gesture.
- If the Web client shows `Enable sound`, click it.
- Make sure the computer output device is not muted.
- Use HTTPS or `localhost`; browsers may block media devices on insecure origins.

Permission troubleshooting:

- `permission denied`: unblock microphone/camera in browser site settings and reload.
- `device not found`: connect a microphone/camera or close broken virtual devices.
- Camera busy: close other video apps.
- LiveKit connected but no audio: check that the publishing participant actually clicked `Turn mic on`.

Android robot controller-audio test:

1. Android joins the same LiveKit room with real token mode.
2. Web controller turns microphone on.
3. Android status should indicate remote audio is subscribed or connected.
4. Confirm robot speaker volume is up and no Bluetooth/output routing issue exists.
5. If no sound is heard, check Android system volume, LiveKit connection, token mode, and whether controller mic permission was granted.

## 9. Local Ports

Default local services:

```text
backend: http://localhost:3001
web-client: http://localhost:5173
robot-web-publisher: http://localhost:5174
android-robot: installed APK, uses backend LAN/public URL
```

The backend CORS list must include both frontend origins.

Android is not a browser and does not use CORS, but it must be able to reach the backend URL over the network.

Production services:

```text
backend: https://your-backend.example.com
backend websocket: wss://your-backend.example.com/ws
web-client: https://your-web.example.com
android-robot backendUrl: https://your-backend.example.com
```

## 10. Verification

1. Start backend.
2. Join a Web user.
3. Confirm response has `tokenMode: "livekit"`.
4. Start robot publisher or install the Android robot app.
5. Join the same room as robot.
6. Allow camera permission.
7. Confirm Web client shows the robot camera.

## 11. Common Problems

`tokenMode` is `mock`:

- One or more LiveKit env values is missing.
- `LIVEKIT_URL` is still `mock://livekit`.

Web client stays on placeholder:

- Robot publisher is not in the same room.
- Android robot app is not in the same room.
- Camera permission was denied.
- Robot participant identity/name does not contain `robot`.
- LiveKit URL is wrong.
- Token expired.

Browser camera does not open:

- Use `localhost` during development.
- Check system camera permission.
- Close other apps using the camera.

Android camera does not open:

- Grant Android camera permission.
- Close vendor camera/navigation apps.
- Reboot the robot if the camera driver is stuck.
- Do not use `localhost` for `backendUrl`; use the computer LAN IP or a public backend URL.

Online connection fails:

- Use HTTPS/WSS, not HTTP/WS, for public deployment.
- Avoid self-signed certificates for Android online tests.
- Confirm Web build env uses `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.
- Confirm backend `CORS_ORIGIN` exactly matches the deployed Web origin.
