# Android Robot App

Minimal Android 8.1 / API 27+ robot publisher for the remote-presence MVP.

The app joins a backend-managed room, receives a backend-generated LiveKit token, publishes the Android camera, and displays received mock control messages. It does not contain any LiveKit API secret and does not move real robot hardware.

## What It Does

- Calls backend `POST /api/robots/join`.
- Receives `liveKitUrl`, `token`, `participantId`, and `role`.
- Connects to LiveKit with the backend-generated token.
- Publishes the Android camera as a LiveKit camera track.
- Optionally publishes microphone audio only when the user enables it.
- Subscribes to remote audio, primarily so the robot can hear the Web controller.
- Opens backend WebSocket `/ws` as the robot participant.
- Displays received `robot_control` messages.
- Uses `MockRobotControlAdapter` only; it never moves real hardware.

## Requirements

- Android Studio or Android SDK + Gradle.
- Android device running Android 8.1 / API 27 or newer.
- Backend configured with real LiveKit values, either LiveKit Cloud or Scheme B self-hosted LiveKit.
- `ANDROID_HOME` and `ANDROID_SDK_ROOT` pointing to the Android SDK for command-line builds.
- Android SDK Platform-Tools for `adb`.

## Build

Open in Android Studio:

1. Install Android Studio.
2. Open the `android-robot/` directory.
3. Let Gradle sync finish.
4. Install the requested Android SDK Platform, Build-Tools, and Platform-Tools from SDK Manager.
5. Install Android SDK Platform 27 as well, so the Android 8.1/API 27 minimum can be validated.
6. Build APK from Android Studio, or use the command line below.

From `android-robot/`, configure SDK paths first:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

If you prefer `local.properties`, create it locally and do not commit it:

```properties
sdk.dir=/Users/your-user/Library/Android/sdk
```

Check `adb`:

```bash
adb version
which adb
```

Run build checks:

```bash
./gradlew test
./gradlew assembleDebug
```

If `gradlew` is missing and system `gradle` is installed:

```bash
gradle wrapper
./gradlew test
./gradlew assembleDebug
```

Do not hand-write the Gradle wrapper files. Generate them with Gradle or Android Studio.

If `gradle`, `adb`, or `ANDROID_HOME` is missing, install Android Studio or Android SDK command-line tools first. A reproducible APK build needs the Android SDK, Platform-Tools, and either a generated wrapper or system Gradle.

The debug APK is normally created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Building the APK does not require a robot to be connected.

## Install

Installing, `logcat`, and real camera testing require an Android robot or Android test device connected and authorized.

With USB debugging enabled:

```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

If `adb devices` shows `unauthorized`, unlock the robot screen and allow USB debugging.

View logs:

```bash
adb logcat
adb shell pidof com.surf.robot
adb logcat --pid=<PID>
```

## backendUrl

Do not use `localhost` on the robot. On Android, `localhost` means the robot device itself.

Use one of:

- `http://<your-computer-LAN-IP>:3001`
- an HTTPS public backend URL

For local MVP testing, keep the robot and computer on the same network.

For online deployment or Scheme B self-hosted cloud testing, use:

```text
https://api.your-domain.com
```

Do not use `localhost` or `http://` for public online tests. Android may reject self-signed or invalid HTTPS certificates.

The manifest enables cleartext traffic for LAN debugging. Online backend URLs must still use trusted `https://`.

Android only stores ordinary operator-entered config such as `backendUrl`, `robotId`, and `roomName`. It does not store LiveKit key/secret. Backend returns the LiveKit URL and short-lived token after `POST /api/robots/join`.

## Safety

- No LiveKit secret is stored in Android.
- No real robot movement is implemented.
- `1002`, `1003`, and `1000` are displayed/logged only.
- Camera permission denial and camera-open errors are shown in the UI.
- Microphone publishing is not automatic.
- Remote controller audio is a meeting feature only; it is separate from robot movement control.

## Android 8.1 True-device Checks

- Confirm network access to `https://api.example.com/health`.
- Confirm LiveKit WSS is reachable.
- Confirm Android app has camera permission.
- Confirm `INTERNET` permission exists in the manifest.
- Confirm foreground/background switching does not permanently stop camera publishing.
- Confirm the camera is not occupied by vendor software.
- Confirm self-signed certificates are not used for public tests.

## Scheme B / Self-hosted Cloud Test

Before installing on the robot, confirm the cloud path works with `robot-web-publisher`.

Then:

1. Build the APK with `./gradlew assembleDebug`.
2. Install it with `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
3. Open the app on the robot.
4. Enter:

```text
backendUrl=https://api.your-domain.com
robotId=robot-001
roomName=<same room as Web users>
```

5. Tap Join.
6. Allow camera permission.
7. Confirm Web users see the Android robot video.
8. Send `1002`, `1003`, and `1000 stop` from a Web controller.
9. Confirm Android only displays/logs the control messages.

If the app joins but Web cannot see video, check:

- cloud security-group/firewall UDP `50000-60000`
- LiveKit `7881/tcp`
- `LIVEKIT_URL=wss://livekit.your-domain.com`
- trusted HTTPS/WSS certificates
- camera permission and camera availability
