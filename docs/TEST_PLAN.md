# Test Plan

## 1. Automated Checks

Run from `backend/`:

```bash
npm run lint
npm run test
npm run build
```

Run from `web-client/`:

```bash
npm run lint
npm run test
npm run build
```

Run from `robot-web-publisher/`:

```bash
npm run lint
npm run test
npm run build
```

Backend `npm run test` currently runs command validation unit checks. Web projects currently use TypeScript checking for `test`.

## 2. LiveKit Configuration Test

Create `backend/.env` locally:

```text
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
```

Do not commit `backend/.env`.

If LiveKit values are missing, backend should still start and return `tokenMode: "mock"`.

## 3. Backend Manual Test

Start backend:

```bash
cd backend
npm run dev
```

Check health:

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "ok": true
}
```

Join robot:

```bash
curl -X POST http://localhost:3001/api/robots/join \
  -H "Content-Type: application/json" \
  -d '{"robotId":"robot-001","roomName":"robot-room-001"}'
```

Expected:

- `role` is `robot`.
- `tokenMode` is `livekit` when LiveKit env is configured.
- `tokenMode` is `mock` when LiveKit env is not configured.
- Response must not contain `LIVEKIT_API_SECRET`.

Join user:

```bash
curl -X POST http://localhost:3001/api/rooms/join \
  -H "Content-Type: application/json" \
  -d '{"roomName":"robot-room-001","participantName":"Alice","requestedRole":"controller"}'
```

## 4. Real Video Link Test

1. Configure `backend/.env` with real LiveKit values.
2. Start backend:

```bash
cd backend
npm run dev
```

3. Start Web client:

```bash
cd web-client
npm run dev
```

4. Start robot web publisher:

```bash
cd robot-web-publisher
npm run dev
```

5. Open Web client at `http://localhost:5173`.
6. Join room `robot-room-001` as Alice.
7. Open robot publisher at `http://localhost:5174`.
8. Join the same room as `robot-001`.
9. Allow browser camera permission.
10. Confirm publisher status becomes `publishing`.
11. Confirm Web client LiveKit status becomes `connected`.
12. Confirm Web client shows the robot camera video.

If Web still shows `Robot video will appear here`:

- Confirm `tokenMode` is `livekit`, not `mock`.
- Confirm both apps use the same room name.
- Confirm robot identity/name contains `robot`.
- Confirm camera permission was allowed.
- Confirm LiveKit URL starts with `wss://` or another valid LiveKit endpoint.

## 5. Chat Test

1. Alice sends `hello from Alice`.
2. Bob should see the message in another Web client window.
3. Bob sends `hello from Bob`.
4. Alice should see the message.
5. Empty chat message should not send from the UI.
6. Messages over 500 characters are rejected by backend.

## 6. Control Permission Test

As viewer Bob:

- Control buttons should be disabled.
- If Bob sends control manually through WebSocket, backend should reject with `NOT_CONTROLLER`.

As controller Alice:

- Forward sends command `1002`.
- Back sends command `1002`.
- Left/right send command `1003`.
- Stop sends command `1000`.
- Backend logs `[mock-robot]` for accepted control.
- Both Web client windows see the mock robot command event.

## 7. Rejection Test

Backend must reject:

- Command `1001`.
- Command `9999`.
- Missing `roomName`.
- Missing `senderId`.
- Sender not in room.
- Sender that does not match WebSocket `hello`.
- Viewer sender.
- Robot offline when `MOCK_ROBOT_ONLINE=false` and no robot joined.
- Out-of-range movement parameters.

## 8. Second-Round Done Criteria

The second round is done when:

- Backend and both Web apps can build.
- Backend can produce LiveKit JWTs without exposing secrets.
- Web client can connect to LiveKit with backend token.
- Robot publisher can publish browser camera.
- Web client can render robot publisher video.
- Existing chat and controller/viewer control permission still work.
