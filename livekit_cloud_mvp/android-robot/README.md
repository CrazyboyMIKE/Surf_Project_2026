# LiveKit Cloud MVP Android Robot

Android 8.1 / API 27+ robot camera publisher for the LiveKit Cloud MVP.

This directory contains the Android app copied from the main MVP and Cloud-only setup docs. The app gets a robot token from backend and publishes the Android camera to LiveKit Cloud.

## What It Does

- Calls backend `POST /api/robots/join`.
- Receives `liveKitUrl`, token, participant id, role, and media permissions.
- Connects to LiveKit Cloud with the backend-issued token.
- Publishes Android camera video.
- Opens backend WebSocket `/ws` as the robot participant.
- Displays received `robot_control` messages.
- Uses a mock robot-control adapter only.

## Build

Configure Android SDK:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

Optional local `local.properties`:

```properties
sdk.dir=/Users/your-user/Library/Android/sdk
```

Build:

```bash
./gradlew test
./gradlew assembleDebug
```

The debug APK is normally:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Building the APK does not require the robot to be connected.

## Install And Logs

Installing and real camera testing require an Android robot or test device:

```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat
```

If `adb devices` shows `unauthorized`, unlock the robot screen and allow USB debugging.

## Safety

- Android stores only ordinary config such as backend URL, robot id, and room name.
- Android does not store LiveKit Cloud API key or secret.
- `1002`, `1003`, and `1000` are displayed/logged only.
- No real robot movement is implemented.

See `LIVEKIT_CLOUD_CONFIG.md` for Cloud connection details.
