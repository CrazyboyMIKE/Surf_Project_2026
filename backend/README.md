# Backend

Node.js + TypeScript + Express backend for the robot remote-presence MVP.

## Run

```bash
npm install
npm run dev
```

The backend listens on `http://localhost:3001` by default.

## LiveKit

Create `backend/.env` locally:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_TOKEN_TTL=1h
```

If any LiveKit value is missing, backend stays in mock token mode. The API secret is only read by backend and is never returned to frontend.

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Behavior

- Room, participant, controller, and robot state are stored in memory.
- WebSocket `/ws` handles `hello`, `chat`, and `robot_control`.
- LiveKit token service returns real JWTs when configured and mock tokens otherwise.
- Robot control is mock relay/logging only.
