# Android Robot App

Minimal Android 8.1 robot publisher for the third-round MVP.

## What It Does

- Calls backend `POST /api/robots/join`.
- Receives `liveKitUrl`, `token`, `participantId`, and `role`.
- Connects to LiveKit with the backend-generated token.
- Publishes the Android camera as a LiveKit camera track.
- Opens backend WebSocket `/ws` as the robot participant.
- Displays received `robot_control` messages.
- Uses `MockRobotControlAdapter` only; it never moves real hardware.

## Requirements

- Android Studio or Android SDK + Gradle.
- Android device running Android 8.1 / API 27 or newer.
- Backend configured with real LiveKit values.

## Build

Open in Android Studio:

1. Install Android Studio.
2. Open the `android-robot/` directory.
3. Let Gradle sync finish.
4. Install the requested Android SDK Platform, Build-Tools, and Platform-Tools from SDK Manager.
5. Build APK from Android Studio, or use the command line below.

From `android-robot/`:

```bash
gradle assembleDebug
```

If you generate a Gradle wrapper locally, use:

```bash
./gradlew assembleDebug
```

If `gradlew` is missing and system `gradle` is installed:

```bash
gradle wrapper
./gradlew test
./gradlew assembleDebug
```

Do not hand-write the Gradle wrapper files. Generate them with Gradle or Android Studio.

The debug APK is normally created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Install

With USB debugging enabled:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## backendUrl

Do not use `localhost` on the robot. On Android, `localhost` means the robot device itself.

Use one of:

- `http://<your-computer-LAN-IP>:3001`
- an HTTPS public backend URL

For local MVP testing, keep the robot and computer on the same network.

For online deployment, use:

```text
https://your-backend.example.com
```

Do not use `localhost` or `http://` for public online tests. Android may reject self-signed or invalid HTTPS certificates.

The manifest enables cleartext traffic for LAN debugging. Online backend URLs must still use trusted `https://`.

## Safety

- No LiveKit secret is stored in Android.
- No real robot movement is implemented.
- `1002`, `1003`, and `1000` are displayed/logged only.
- Camera permission denial and camera-open errors are shown in the UI.
