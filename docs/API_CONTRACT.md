# API Contract

Base URL in development:

```text
http://localhost:3001
```

Base URL in production:

```text
https://your-backend.example.com
```

WebSocket URL in development:

```text
ws://localhost:3001/ws
```

WebSocket URL in production:

```text
wss://your-backend.example.com/ws
```

All HTTP APIs use JSON.

Production notes:

- Public backend URL is configured by deployment env, not hard-coded.
- Web uses `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.
- Android operator enters the public `https://` backend URL.
- LiveKit API secret is never returned by any endpoint.

## 1. GET /health

Response:

```json
{
  "ok": true
}
```

## 2. POST /api/rooms/join

Joins a Web user to a room and returns a LiveKit join token.

Request:

```json
{
  "roomName": "robot-room-001",
  "participantName": "Alice",
  "requestedRole": "viewer"
}
```

`requestedRole` may be:

```text
viewer
controller
```

Success response:

```json
{
  "roomName": "robot-room-001",
  "participantId": "user-abc",
  "participantName": "Alice",
  "role": "viewer",
  "requestedControllerGranted": false,
  "liveKitUrl": "wss://example.livekit.cloud",
  "token": "jwt-or-mock-token",
  "tokenMode": "livekit",
  "robotOnline": true,
  "currentControllerId": "user-controller",
  "currentControllerName": "Alice"
}
```

Rules:

- If `requestedRole` is `controller` and no controller exists, backend grants `controller`.
- If another controller exists, backend joins the user as `viewer`.
- `tokenMode` is `livekit` only when backend has `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
- `tokenMode` is `mock` when LiveKit configuration is missing.
- LiveKit API secret is never returned.
- Web users get LiveKit subscribe permission but no media publish permission.

## 3. POST /api/robots/join

Registers a robot as online in a room and returns a LiveKit robot token. This endpoint is used by both the browser robot publisher and the Android robot app.

Request:

```json
{
  "robotId": "robot-001",
  "roomName": "robot-room-001"
}
```

Response:

```json
{
  "robotId": "robot-001",
  "roomName": "robot-room-001",
  "participantId": "robot-robot-001",
  "role": "robot",
  "online": true,
  "liveKitUrl": "wss://example.livekit.cloud",
  "token": "jwt-or-mock-token",
  "tokenMode": "livekit"
}
```

Rules:

- Robot token identity is `robot-${robotId}`.
- Robot token name is the submitted `robotId`.
- Robot token can join the exact requested room when `tokenMode` is `livekit`.
- Robot token can publish media when `tokenMode` is `livekit`.
- Robot token can subscribe when `tokenMode` is `livekit`, so a future Android round can receive LiveKit data or room media if needed.
- Robot token cannot expose or contain the LiveKit API secret in the response.
- The web client prioritizes LiveKit participants whose identity or name contains `robot`.
- Android robot clients must use the returned token as-is and must not store LiveKit API keys or secrets.

## 4. POST /api/rooms/control/request

Requests controller role.

Request:

```json
{
  "roomName": "robot-room-001",
  "participantId": "user-abc"
}
```

Success:

```json
{
  "ok": true,
  "role": "controller",
  "message": "Control granted"
}
```

Failure when another controller is active:

```json
{
  "ok": false,
  "code": "CONTROLLER_BUSY",
  "role": "viewer",
  "message": "Another controller is active"
}
```

## 5. POST /api/rooms/control/release

Releases controller role.

Request:

```json
{
  "roomName": "robot-room-001",
  "participantId": "user-abc"
}
```

Response:

```json
{
  "ok": true,
  "message": "Control released"
}
```

## 6. WebSocket Connection

Client identifies itself after opening the socket:

```json
{
  "type": "hello",
  "roomName": "robot-room-001",
  "participantId": "user-abc"
}
```

Server acknowledges:

```json
{
  "type": "hello",
  "roomName": "robot-room-001",
  "participantId": "user-abc",
  "role": "viewer",
  "timestamp": 1760000000000
}
```

The backend rejects later `chat` and `robot_control` messages when `senderId` does not match the `hello` identity.

Robot web publisher and Android robot app also open `hello` with their `robot-*` participant ID so backend can broadcast online/offline state and relay mock `robot_control` messages.

## 7. Chat Message

Client sends:

```json
{
  "type": "chat",
  "roomName": "robot-room-001",
  "senderId": "user-abc",
  "message": "Hello"
}
```

Server broadcasts:

```json
{
  "type": "chat",
  "roomName": "robot-room-001",
  "senderId": "user-abc",
  "senderName": "Alice",
  "message": "Hello",
  "timestamp": 1760000000000
}
```

Validation:

- Empty message is rejected.
- Maximum message length is 500 characters.
- Message is only broadcast inside the same room.

## 8. Robot Control Message

Client sends:

```json
{
  "type": "robot_control",
  "roomName": "robot-room-001",
  "senderId": "user-abc",
  "command": "1002",
  "parameters": {
    "distanceCm": 20
  }
}
```

Server broadcasts mock robot event:

```json
{
  "type": "robot_control",
  "roomName": "robot-room-001",
  "command": "1002",
  "parameters": {
    "distanceCm": 20
  },
  "from": "user-abc",
  "timestamp": 1760000000000
}
```

Allowed commands and parameters:

- `1002`: optional `{ "distanceCm": number }`, range `-100` to `100`, default `20`.
- `1003`: optional `{ "angleDeg": number }`, range `-180` to `180`, default `15`.
- `1000`: no movement parameters.

Backend rejects if:

- Room does not exist.
- Sender is not in room.
- Sender does not match WebSocket `hello`.
- Sender is not controller.
- Command is not `1002`, `1003`, or `1000`.
- Robot is not online.

Android robot behavior in the fourth round:

- Android receives this broadcast through backend WebSocket `/ws` after sending `hello`.
- Android only displays or logs accepted commands.
- Android ignores disallowed command IDs.
- Android does not call real motor, navigation, vendor SDK, or MQTT code.

## 9. Role Update Message

Broadcast when controller state changes or a participant connects:

```json
{
  "type": "role_update",
  "roomName": "robot-room-001",
  "currentControllerId": "user-abc",
  "currentControllerName": "Alice",
  "participants": [
    {
      "id": "user-abc",
      "name": "Alice",
      "role": "controller",
      "connected": true
    }
  ],
  "timestamp": 1760000000000
}
```

## 10. Robot Status Message

```json
{
  "type": "robot_status",
  "roomName": "robot-room-001",
  "robotId": "robot-001",
  "online": true,
  "timestamp": 1760000000000
}
```

## 11. Error Message

```json
{
  "type": "error",
  "code": "NOT_CONTROLLER",
  "message": "Only controller can send robot control"
}
```
