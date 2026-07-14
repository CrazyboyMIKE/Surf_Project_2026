# Android LiveKit Cloud Config

Android robot configuration for the isolated LiveKit Cloud MVP.

## Runtime Values

Android only needs:

```text
backendUrl=https://api.example.com
robotId=robot-001
roomName=robot-room-001
```

Do not configure `LIVEKIT_API_SECRET` in Android.

## Flow

1. Android calls backend `POST /api/robots/join`.
2. Backend signs a LiveKit Cloud token.
3. Android receives `liveKitUrl` and token.
4. Android joins the LiveKit Cloud room.
5. Android publishes the robot camera video.
6. Android opens backend WebSocket `/ws` for chat/control status messages.

## Android 8.1 Requirements

- Android 8.1 / API 27 or newer.
- `INTERNET` permission.
- `CAMERA` permission.
- Camera permission granted by the user/operator.
- Network path to `https://api.example.com`.
- Real device test for camera publishing.

## Build And Device Notes

- Configure `ANDROID_HOME` and `ANDROID_SDK_ROOT`.
- Use `local.properties` for local `sdk.dir` if needed.
- APK build does not require the robot to be connected.
- Install, `logcat`, and real camera tests require a connected Android device.
- If camera open fails, check camera permission and whether another app occupies the camera.
