# Android Robot Plan

## 1. Purpose

The second round used `robot-web-publisher/` to validate LiveKit video with a browser camera.

The third round adds `android-robot/`, a minimal Android 8.1 robot app that publishes the real Android camera to LiveKit.

## 2. Android Target

```text
Language: Kotlin
Minimum Android: Android 8.1 / API 27
Media SDK: LiveKit Android SDK
Control: RobotControlAdapter, currently mock-only
```

## 3. Implemented Third-Round Flow

1. Android operator enters:
   - `backendUrl`
   - `roomName`
   - `robotId`
2. Android app calls:

```text
POST /api/robots/join
```

3. Backend returns:
   - `participantId`
   - `liveKitUrl`
   - `token`
   - `tokenMode`
   - `role`
4. Android opens backend WebSocket `/ws` with `hello`.
5. If `tokenMode` is `livekit`, Android joins the LiveKit room.
6. Android requests camera permission.
7. Android publishes camera video.
8. Android displays received `robot_control` messages.

## 4. Android Modules

`MainActivity.kt`:

- Minimal native UI.
- Reads `backendUrl`, `robotId`, `roomName`, and optional audio checkbox.
- Shows backend, WebSocket, LiveKit, camera, control, and error status.
- Requests runtime camera/audio permissions.

`RobotJoinApi.kt`:

- Calls backend `POST /api/robots/join`.
- Parses `liveKitUrl`, `token`, `participantId`, and `tokenMode`.
- Does not know any LiveKit API secret.

`LiveKitRobotClient.kt`:

- Creates LiveKit room.
- Connects with backend-generated token.
- Enables camera publishing.
- Optionally enables microphone publishing.
- Shows clear status on connection or camera failure.

`RobotControlMessageHandler.kt`:

- Connects to backend WebSocket `/ws`.
- Sends `hello` with `roomName` and robot `participantId`.
- Handles broadcast `robot_control` messages.

`RobotControlAdapter.kt`:

- Defines the future hardware-control interface.

`MockRobotControlAdapter.kt`:

- Current implementation.
- Only returns display/log strings.
- Does not move real hardware.

## 5. Camera Publishing Rules

Android app should:

- Request camera permission explicitly.
- Avoid publishing automatically before user/operator taps Join.
- Publish one camera track to LiveKit.
- Keep microphone off by default.
- Log/display connection status without secrets.
- Report camera-open failure clearly, including possible camera occupancy.

## 6. Control Receiving Rules

Third round may receive `robot_control` messages but keeps hardware movement disabled.

Current adapter:

```kotlin
interface RobotControlAdapter {
    fun moveDistance(distanceCm: Int): String
    fun rotateAngle(angleDeg: Int): String
    fun stop(): String
}
```

Current implementation:

```text
MockRobotControlAdapter
```

It displays/logs commands only.

## 7. Safety Rules

- Do not store `LIVEKIT_API_SECRET` in Android.
- Do not move real hardware on app launch.
- Keep accepted commands limited to `1002`, `1003`, `1000`.
- Keep stop command visible and tested in Web UI.
- Add a physical test checklist before enabling real movement.
- Require a human near the robot during later hardware tests.

## 8. Fourth-Round Online Direction

Fourth round keeps the same Android app but runs it against a public backend:

- `backendUrl` should be `https://your-backend.example.com`.
- The app derives backend WebSocket as `wss://your-backend.example.com/ws`.
- Android still gets LiveKit token from backend.
- Android still does not store LiveKit API secret.
- Android still uses `MockRobotControlAdapter`.

## 9. Fifth-Round Android Direction

Before real robot motion:

1. Decide production network path for backend and LiveKit.
2. Add Android reconnect behavior and richer lifecycle handling.
3. Add optional local camera preview if useful for field debugging.
4. Decide whether control should use backend WebSocket or LiveKit data channel.
5. Add a feature-flagged real `RobotControlAdapter`.
6. Integrate vendor navigation SDK or MQTT only after a safety review.
7. Keep `MockRobotControlAdapter` as the default until hardware tests are explicitly approved.
