# Fifth-Round Repair Report

日期：2026-07-10（Asia/Shanghai）

## 1. Scope

本次只修补第五轮验收阻塞项：

- 不开发新功能。
- 不改业务代码。
- 不写入真实 `.env`。
- 不打印或提交任何 secret。
- 不做语音通话。
- 不接真实机器人运动。
- 不调用厂商导航 SDK。
- 不接 MQTT 真实控制。

## 2. What Was Repaired

Android 构建可复现性文档：

- 更新 `docs/ANDROID_ROBOT_SETUP.md`，补充 Android Studio、Android SDK Platform 35/27、`ANDROID_HOME`、`ANDROID_SDK_ROOT`、`PATH`、`adb`、`gradlew`、`assembleDebug`、`adb install` 的完整步骤。
- 明确 `android-robot/app/build.gradle` 使用 `compileSdk 35`，所以命令行构建必须安装 `platforms/android-35`。
- 明确 Android 8.1/API 27 验证需要安装 `platforms/android-27`。
- 明确 `gradlew` 和 `gradle-wrapper.jar` 不能手写，必须由 Gradle 或 Android Studio 生成。

LiveKit 真实视频验收准备：

- 更新 `docs/LIVEKIT_SETUP.md`，补充真实 LiveKit 凭证只放在 backend 的规则。
- 补充通过 `/api/robots/join` 判断 `tokenMode=livekit` 的方法。
- 补充一种不打印 token 内容的检查命令。
- 补充 `robot-web-publisher` 真实摄像头发布测试前置条件、状态判断和排查项。

Readiness 报告：

- 更新 `docs/FIFTH_ROUND_REAL_ENV_READINESS_REPORT.md`，记录当前真实环境状态：
  - Android Studio 存在。
  - Android SDK 目录存在。
  - SDK 内部有 `platform-tools/adb`。
  - `adb` 未加入当前 shell 的 `PATH`。
  - `ANDROID_HOME` 未设置。
  - 当前只观察到 `platforms/android-36.1`，未观察到 `android-35` 和 `android-27`。
  - 系统 `gradle` 不可用。
  - `android-robot/gradlew` 不存在。

## 3. Commands Passed

Backend:

```bash
cd backend
npm run lint
npm run test
npm run build
```

Results:

- `npm run lint`: passed.
- `npm run test`: passed, including `commandValidation tests passed`.
- `npm run build`: passed.

Web client:

```bash
cd web-client
npm run lint
npm run test
npm run build
```

Results:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Vite emitted a non-blocking LiveKit chunk size warning.

Robot web publisher:

```bash
cd robot-web-publisher
npm run lint
npm run test
npm run build
```

Results:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Vite emitted a non-blocking LiveKit chunk size warning.

Android/SDK discovery:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb version
```

Result: passed. ADB exists inside the SDK directory.

Output:

```text
Android Debug Bridge version 1.0.41
Version 37.0.0-14910828
Installed as /Users/linziwei/Library/Android/sdk/platform-tools/adb
Running on Darwin 25.3.0 (arm64)
```

ADB device discovery:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb devices
```

Result: passed after allowing the command to start the local ADB daemon. No device was attached or authorized.

Output:

```text
List of devices attached
```

Static safety checks:

```bash
find . -name .env -o -name .env.local -o -name .env.production
git diff --check
```

Results:

- No real `.env`, `.env.local`, or `.env.production` files were found.
- `git diff --check`: passed.

## 4. Commands Failed Or Blocked

Android build:

```bash
cd android-robot
./gradlew assembleDebug
```

Result: failed.

Reason:

```text
no such file or directory: ./gradlew
```

Wrapper presence:

```bash
cd android-robot
ls -l ./gradlew
find . -maxdepth 3 -type f -name gradlew -o -name gradle-wrapper.jar -o -name gradle-wrapper.properties
```

Result: failed/empty. No `gradlew`, `gradle-wrapper.jar`, or `gradle-wrapper.properties` exists in `android-robot/`.

Gradle wrapper generation:

```bash
command -v gradle
cd android-robot
gradle wrapper
```

Result: failed. System `gradle` is not on `PATH`, so wrapper generation was not possible.

Output:

```text
zsh:1: command not found: gradle
```

ADB on PATH:

```bash
command -v adb
```

Result: failed. ADB exists at `/Users/linziwei/Library/Android/sdk/platform-tools/adb`, but that directory is not on `PATH`.

Android environment:

```bash
printenv ANDROID_HOME
```

Result: failed. `ANDROID_HOME` is not set in the current shell.

Required SDK platforms:

```bash
find /Users/linziwei/Library/Android/sdk/platforms -maxdepth 1 -type d -print
```

Result: only `android-36.1` was observed. `android-35` and `android-27` still need to be installed for this project.

APK output:

```bash
ls -l android-robot/app/build/outputs/apk/debug/app-debug.apk
find android-robot/app/build -maxdepth 5 -type f -name '*.apk' -print
```

Result: failed. No APK exists because `assembleDebug` could not run without a Gradle wrapper or system Gradle.

APK install:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb install -r android-robot/app/build/outputs/apk/debug/app-debug.apk
```

Result: not run. Install requires both:

- `adb devices` showing a connected `device`.
- `android-robot/app/build/outputs/apk/debug/app-debug.apk` existing.

Neither condition is currently true.

If `adb devices` is empty, check:

- The robot or Android phone is connected by USB.
- USB debugging is enabled in Developer Options.
- The robot screen is unlocked.
- The robot screen has shown the USB debugging authorization dialog.
- The authorization dialog has been accepted.
- The USB cable supports data, not only charging.

If `adb devices` shows `unauthorized`, accept the USB debugging prompt on the robot screen and run:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb devices
```

again.

If `adb devices` shows `device` but install fails, check:

- Android version is API 27 or newer.
- Existing app signature conflict; uninstall the old debug app if needed.
- Package name conflict with a separately signed build.
- Device storage is not full.
- The robot allows installing debug APKs from USB.

## 5. Logcat Commands

General Android logs:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb logcat
```

Known package name from `android-robot/app/build.gradle`:

```text
com.surf.robot
```

Filter by package PID after the app is installed and running:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb shell pidof com.surf.robot
```

Then replace `<PID>` with the printed process id:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb logcat --pid=<PID>
```

Simple text filter if PID filtering is unavailable:

```bash
/Users/linziwei/Library/Android/sdk/platform-tools/adb logcat | grep com.surf.robot
```

## 6. Still Requires Real Environment

Real LiveKit:

- Real `LIVEKIT_URL`.
- Real `LIVEKIT_API_KEY`.
- Real `LIVEKIT_API_SECRET`.
- Backend `.env` configured locally or in deployment.
- Browser camera permission for `robot-web-publisher`.

Android:

- `ANDROID_HOME` / `ANDROID_SDK_ROOT` configured.
- `platform-tools` added to `PATH`.
- Android SDK Platform 35 installed.
- Android SDK Platform 27 installed.
- Gradle installed or wrapper generated by Android Studio/Gradle.
- `./gradlew assembleDebug` passing.
- Android 8.1/API 27+ robot or test phone.
- `adb install` verified on a real device.

Public deployment:

- Public backend deployment with HTTPS/WSS.
- Public web-client deployment with HTTPS.
- `CORS_ORIGIN` set to the deployed Web origin.
- `VITE_API_BASE_URL=https://...`.
- `VITE_WS_BASE_URL=wss://...`.
- Hosting provider WebSocket upgrade support on `/ws`.

## 7. Next Real LiveKit Test

1. Create a LiveKit Cloud project.
2. Copy the project WebSocket URL, API key, and API secret.
3. Create local `backend/.env` from `backend/.env.example`.
4. Set:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
MOCK_ROBOT_ONLINE=false
```

5. Start backend:

```bash
cd backend
npm run dev
```

6. Confirm backend log says `LiveKit token mode: livekit`.
7. Start Web client:

```bash
cd web-client
npm run dev
```

8. Start robot web publisher:

```bash
cd robot-web-publisher
npm run dev
```

9. Web joins `robot-room-001`.
10. Robot publisher joins the same room as `robot-001`.
11. Allow browser camera permission.
12. Confirm Web shows robot online, LiveKit connected, and the robot publisher camera video.

## 8. Next Android True-Device Test

1. Open Android Studio.
2. Open `android-robot/`.
3. In SDK Manager, install:
   - Android SDK Platform 35.
   - Android SDK Platform 27.
   - Android SDK Build-Tools.
   - Android SDK Platform-Tools.
   - Android SDK Command-line Tools, optional but useful for `sdkmanager`.
4. Configure shell:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

5. Confirm:

```bash
adb version
adb devices
```

6. Generate Gradle wrapper from Android Studio or system Gradle. Do not hand-write wrapper files.
7. Build:

```bash
cd android-robot
./gradlew assembleDebug
```

8. Install:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

9. Start backend with real LiveKit env.
10. On Android, enter:

```text
backendUrl=http://<computer-LAN-IP>:3001
robotId=robot-001
roomName=robot-room-001
```

11. Tap Join and publish camera.
12. Allow camera permission.
13. Web client joins the same room and confirms Android camera video.

## 9. Status

Repair status: documentation and readiness reporting improved.

Formal real-environment acceptance remains blocked by missing LiveKit credentials, missing Gradle wrapper/system Gradle, incomplete Android SDK shell setup, missing required SDK platforms, missing Android device test, and missing public HTTPS/WSS deployment.
