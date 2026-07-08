# Architecture

## 1. Second-Round Architecture

```text
Browser Web Client
  | HTTP join/control APIs
  | WebSocket hello/chat/control messages
  | LiveKit subscribe to robot video
  v
Backend Server
  | in-memory room state
  | LiveKit token generation
  | WebSocket chat/control relay
  v
LiveKit Server
  ^ publishes camera video
  |
Robot Web Publisher
```

The backend never forwards raw video frames. LiveKit transports media directly between publisher and subscribers.

## 2. Implemented Project Structure

```text
backend/
  src/
    control/commandValidation.ts
    http/routes.ts
    services/liveKitTokenService.ts
    state/roomStore.ts
    ws/webSocketServer.ts
    index.ts
web-client/
  src/
    api.ts
    useRoomSocket.ts
    useLiveKitRoom.ts
    components/RobotVideo.tsx
    components/
robot-web-publisher/
  src/
    main.tsx
docs/
```

Key separation:

- Backend room logic lives in `state/roomStore.ts`.
- WebSocket message handling lives in `ws/webSocketServer.ts`.
- Robot command whitelist and parameter validation live in `control/commandValidation.ts`.
- LiveKit token logic lives in `services/liveKitTokenService.ts`.
- Frontend HTTP calls live in `web-client/src/api.ts`.
- Frontend WebSocket handling lives in `web-client/src/useRoomSocket.ts`.
- Frontend LiveKit media handling lives in `web-client/src/useLiveKitRoom.ts`.
- Robot video rendering lives in `web-client/src/components/RobotVideo.tsx`.

## 3. State Model

```ts
type Role = "robot" | "controller" | "viewer";

type Participant = {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
};

type RoomState = {
  roomName: string;
  robotId?: string;
  robotOnline: boolean;
  participants: Map<string, Participant>;
  currentControllerId?: string;
};
```

Current storage is process memory only. Restarting backend clears all rooms and users.

## 4. Backend Responsibilities

- Validate JSON request bodies.
- Create and read room state.
- Assign viewer/controller roles.
- Enforce single-controller rule.
- Generate real LiveKit tokens when credentials are configured.
- Fall back to mock token mode when credentials are missing.
- Accept WebSocket `hello`.
- Broadcast chat inside one room.
- Validate and mock relay robot control commands.
- Release controller role when controller WebSocket disconnects.
- Mark robot offline when robot WebSocket disconnects.

## 5. LiveKit Token Rules

Backend reads:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

Rules:

- All three values must exist to use real LiveKit token mode.
- If any value is missing, backend returns mock tokens.
- The API secret is never returned to frontend or robot publisher.
- Web users receive subscribe-only LiveKit permission.
- Robot publisher receives publish permission.

## 6. Web Responsibilities

- Join room through backend.
- Display backend, WebSocket, LiveKit, robot, room, role, and controller state.
- Connect to LiveKit with backend-returned URL/token.
- Listen for remote participants and video tracks.
- Prefer remote participant identity/name containing `robot`.
- Render robot video track.
- Show `Robot video will appear here` when no robot video is available.
- Send/receive chat through WebSocket.
- Disable robot control buttons unless current role is `controller`.
- Send only whitelisted command IDs from the control panel.

## 7. Robot Web Publisher Responsibilities

- Join backend as robot through `POST /api/robots/join`.
- Open backend WebSocket `hello` as robot.
- Connect to LiveKit with robot token.
- Request local camera permission.
- Publish one camera video track.
- Show local camera preview and status.

## 8. Mock Boundaries

Still mocked in round two:

- Real robot movement.
- Robot vendor SDK.
- MQTT or hardware control.
- `robot_control` execution.
- Android app implementation.

Real in round two when configured:

- LiveKit token signing.
- Web LiveKit room connection.
- Robot publisher LiveKit room connection.
- Browser camera video publishing.
- Web remote robot video rendering.

## 9. Third-Round Direction

Third round should add:

- Android 8.1 robot app skeleton.
- Android LiveKit SDK connection.
- Android camera publishing.
- Android backend robot join/token flow.
- WebSocket or backend-mediated robot control receiving.
- A robot control adapter interface that still keeps real hardware disabled until explicitly tested.
