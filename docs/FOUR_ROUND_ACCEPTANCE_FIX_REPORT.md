# Four-Round Acceptance Fix Report

日期：2026-07-09（Asia/Shanghai）

## 1. Scope

本次只做前四轮验收补强：

- 不开发第五轮功能。
- 不接真实机器人运动。
- 不调用厂商导航 SDK。
- 不接 MQTT 真实控制。
- 不重构大结构。
- 不修改真实 `.env`。
- 不伪造 Android 或真实 LiveKit 测试通过。

注意：用户要求读取根目录 `FOUR_ROUND_ACCEPTANCE_REPORT.md`，实际工作区中该报告位于 `docs/FOUR_ROUND_ACCEPTANCE_REPORT.md`。本次按该实际存在文件执行补强。

## 2. Fixed Acceptance Issues

### 2.1 Added Missing Full Test Plan

新增：

```text
docs/FOUR_ROUND_FULL_TEST_PLAN.md
```

覆盖内容：

- backend build/test。
- web-client build/test。
- robot-web-publisher build/test。
- android-robot build/install。
- LiveKit 真实视频测试。
- Android 机器人摄像头测试。
- 线上 HTTPS/WSS 测试。
- controller/viewer 权限测试。
- secret 安全检查。
- 最终验收 checklist。

### 2.2 Android Build Reproducibility Documentation

已补充：

- `android-robot/README.md`
- `docs/ANDROID_ROBOT_SETUP.md`

新增说明：

- 如何用 Android Studio 打开 `android-robot/`。
- 如何通过 SDK Manager 安装 Android SDK Platform、Build-Tools、Platform-Tools。
- 如何在有系统 Gradle 时运行 `gradle wrapper`。
- 如何运行 `./gradlew test`。
- 如何运行 `./gradlew assembleDebug`。
- 如何用 `adb install -r app/build/outputs/apk/debug/app-debug.apk` 安装 APK。
- 明确不要手写或伪造 `gradlew` / `gradle-wrapper.jar`。

当前环境结论：

- `android-robot/` 是 Gradle Android 项目。
- 当前没有 `gradlew`。
- 当前没有系统 `gradle`。
- 当前没有 `adb`。
- 当前没有 `ANDROID_HOME`。
- 当前没有 Android Studio。
- 因此本轮不能生成 wrapper，不能构建 APK，不能安装真机。

### 2.3 Real LiveKit Acceptance Preparation

已补充：

- `docs/LIVEKIT_SETUP.md`
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md`

新增说明：

- LiveKit Cloud 项目创建路径。
- `backend/.env` 应填写的 LiveKit 变量。
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` 只允许放在 backend。
- 如何用 `robot-web-publisher` 测试真实视频链路。
- 如何确认 Web 端看到 robot participant video track。
- 如何排查 `tokenMode: "mock"`、摄像头权限、roomName 不一致、token 过期等问题。

未写入任何真实 LiveKit secret。

### 2.4 Online Deployment Acceptance Preparation

已补充：

- `docs/DEPLOYMENT.md`
- `docs/ONLINE_TEST_PLAN.md`
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md`

新增部署前 checklist：

- backend `/health`。
- `PUBLIC_BASE_URL=https://...`。
- `CORS_ORIGIN=https://线上 Web 域名`。
- `VITE_API_BASE_URL=https://...`。
- `VITE_WS_BASE_URL=wss://...`。
- Android `backendUrl` 不能填 `localhost`。
- Android online `backendUrl` 不能填 `http://...`。
- hosting provider 必须支持 WebSocket upgrade `/ws`。
- public certificate 必须可信。

### 2.5 Security Hardening Documentation

已检查 Android manifest：

```text
android:usesCleartextTraffic="true"
```

结论：

- 当前保留它用于 LAN 调试。
- 文档已明确线上必须使用可信 `https://` backendUrl。
- 文档已明确不要在线上使用 `http://`，即使 manifest 允许 cleartext。
- 文档已明确 Android 可能拒绝自签名证书。

其他安全补强：

- 没有提交真实 `.env`。
- 没有把 `LIVEKIT_API_SECRET` 放进 Web 或 Android 配置。
- 没有新增 token/secret 日志。
- 补充了 secret safety check。

## 3. Commands Run

### Backend

```bash
cd backend
npm run lint
```

结果：通过。

```bash
cd backend
npm run test
```

结果：通过。`commandValidation tests passed`。

```bash
cd backend
npm run build
```

结果：通过。

### Web Client

```bash
cd web-client
npm run lint
```

结果：通过。

```bash
cd web-client
npm run test
```

结果：通过。

```bash
cd web-client
npm run build
```

结果：通过。Vite 有非阻塞 chunk size warning，主要来自 LiveKit client 包体积。

### Robot Web Publisher

```bash
cd robot-web-publisher
npm run lint
```

结果：通过。

```bash
cd robot-web-publisher
npm run test
```

结果：通过。

```bash
cd robot-web-publisher
npm run build
```

结果：通过。Vite 有非阻塞 chunk size warning，主要来自 LiveKit client 包体积。

### Android Robot

```bash
cd android-robot
./gradlew test
```

结果：失败。

原因：

```text
no such file or directory: ./gradlew
```

```bash
cd android-robot
./gradlew assembleDebug
```

结果：失败。

原因：

```text
no such file or directory: ./gradlew
```

```bash
cd android-robot
gradle test
```

结果：失败。

原因：

```text
command not found: gradle
```

```bash
cd android-robot
gradle assembleDebug
```

结果：失败。

原因：

```text
command not found: gradle
```

环境检查：

- `command -v adb`：未找到。
- `ANDROID_HOME`：未设置。
- `/Applications`：未发现 Android Studio。

### Safety / Static Checks

```bash
find . -name '.env' -o -name '.env.local' -o -name '.env.production'
```

结果：无输出，未发现真实配置文件。

```bash
git diff --check
```

结果：通过。

```bash
rg -n "LIVEKIT_API_SECRET|LIVEKIT_API_KEY|eyJ|BEGIN PRIVATE KEY|password|token" backend web-client robot-web-publisher android-robot docs README.md
```

结果：仅发现文档占位符、配置变量名、源码字段名、package lock 中 `js-tokens` 包名等预期命中；未发现真实 secret。

## 4. Issues Still Requiring Real Environment Validation

这些事项无法只靠代码/文档彻底验收：

1. 真实 LiveKit Cloud 视频链路。
   - 需要真实 `LIVEKIT_URL`。
   - 需要真实 `LIVEKIT_API_KEY`。
   - 需要真实 `LIVEKIT_API_SECRET`。
   - 需要浏览器摄像头权限。

2. Android robot build/install/camera publish。
   - 需要 Android Studio 或 Android SDK。
   - 需要 Gradle 或生成后的 Gradle wrapper。
   - 需要 ADB。
   - 需要 Android 8.1 / API 27+ 设备或机器人。

3. 公网线上验收。
   - 需要部署 backend。
   - 需要部署 Web client。
   - 需要 HTTPS/WSS 域名。
   - 需要 hosting provider 支持 WebSocket upgrade。
   - 需要真实 CORS 验证。

4. Android online TLS behavior。
   - 需要真实设备连接可信 HTTPS backend。
   - 自签名证书行为必须在设备上验证。

## 5. Remaining Formal Acceptance Blockers

正式前四轮验收仍阻塞于：

- `android-robot/` 仍未生成 Gradle wrapper，因为当前环境没有系统 Gradle。
- 未能运行 `./gradlew test`。
- 未能运行 `./gradlew assembleDebug`。
- 未能安装 APK 到 Android robot。
- 未能用真实 LiveKit Cloud 凭证跑 Web + robot publisher 视频链路。
- 未能用 Android robot 发布真实摄像头。
- 未能部署公网 HTTPS/WSS backend 和 Web。
- 未能做公网 A/B 用户 + Android robot 完整端到端测试。

## 6. Next Real Test Order

建议按以下顺序补齐真实环境验收：

1. 安装 Android Studio。
2. 打开 `android-robot/` 并完成 Gradle sync。
3. 安装 Android SDK Platform、Build-Tools、Platform-Tools。
4. 在 `android-robot/` 中生成 Gradle wrapper：

```bash
gradle wrapper
```

5. 运行：

```bash
./gradlew test
./gradlew assembleDebug
```

6. 配置真实 LiveKit Cloud 到 `backend/.env`。
7. 启动 backend、web-client、robot-web-publisher。
8. 先用 robot-web-publisher 验证 Web 端真实视频。
9. 安装 Android APK 到机器人。
10. Android App 使用 LAN backendUrl 验证本地摄像头发布。
11. 部署 backend 到 HTTPS/WSS。
12. 部署 Web client 到 HTTPS。
13. 配置 production env：

```text
CORS_ORIGIN=https://your-web.example.com
VITE_API_BASE_URL=https://your-backend.example.com
VITE_WS_BASE_URL=wss://your-backend.example.com
```

14. Android App 使用：

```text
backendUrl=https://your-backend.example.com
```

15. 执行 `docs/ONLINE_TEST_PLAN.md` 的 A/B 用户 + Android robot 验收。

## 7. Final Status

本次补强后：

- 能通过代码/文档解决的验收缺口已补齐。
- 未伪造 Android、LiveKit、线上部署测试结果。
- 前四轮核心本地代码仍可构建。
- 正式验收仍需要真实 Android 工具链、真实 LiveKit、真实公网部署环境。
