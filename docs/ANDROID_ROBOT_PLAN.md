# Android Robot Plan

## 1. Purpose

The second round uses `robot-web-publisher/` to validate LiveKit video before building the Android robot app.

The third round should replace the browser publisher with an Android 8.1 robot app.

## 2. Android Target

```text
Language: Kotlin or Java
Minimum Android: Android 8.1 / API 27
Media SDK: LiveKit Android SDK
Control: RobotControlAdapter, initially mock-only
```

## 3. Startup Flow

1. Android app collects or receives:
   - `backendBaseUrl`
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
4. If `tokenMode` is `livekit`, Android joins the LiveKit room.
5. Android publishes camera video.
6. Android opens backend WebSocket `hello` as the robot participant.
7. Android keeps robot online status updated through WebSocket lifecycle.

## 4. Camera Publishing

Third-round app should:

- Request camera permission explicitly.
- Avoid publishing automatically before user/operator confirmation.
- Publish one camera track to LiveKit.
- Use low or moderate resolution at first.
- Show local camera preview for debugging.
- Log connection status without secrets.

## 5. Control Receiving

Third round can receive `robot_control` messages but should still keep hardware movement disabled by default.

Initial adapter:

```kotlin
interface RobotControlAdapter {
    fun moveDistance(distanceCm: Int)
    fun rotateAngle(angleDeg: Int)
    fun stop()
}
```

First Android implementation should be:

```text
MockRobotControlAdapter
```

It should log commands only.

## 6. Safety Rules

- Do not store `LIVEKIT_API_SECRET` in Android.
- Do not move real hardware on app launch.
- Keep stop command visible and tested.
- Keep accepted commands limited to `1002`, `1003`, `1000`.
- Add a physical test checklist before enabling real movement.
- Require a human near the robot during hardware tests.

## 7. Third-Round Milestones

1. Create Android project skeleton.
2. Add backend robot join API client.
3. Add LiveKit Android dependency.
4. Join LiveKit room with backend token.
5. Publish camera video.
6. Open backend WebSocket as robot.
7. Receive and log `robot_control`.
8. Add mock `RobotControlAdapter`.
9. Only after review, add real robot SDK/MQTT adapter behind a feature flag.
