# Fifth-Round Acceptance Report

测试日期：2026-07-10（Asia/Shanghai）

## 1. 验收范围

本次验收依据：

- `docs/FIFTH_ROUND_REAL_ENV_READINESS_REPORT.md`
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md`
- 当前项目代码

本次只做第五轮验收，不开发新功能，不改业务代码，不写真实 `.env`，不打印 secret，不伪造真实 LiveKit、Android 真机或公网部署测试结果。

重点验收项：

- 真实 LiveKit 视频链路准备情况。
- `robot-web-publisher` 摄像头发布链路。
- Android 构建可复现性。
- 文档完整性。
- 安全检查。
- 前四轮房间、聊天、controller/viewer、控制命令权限回归。

## 2. 总体结论

当前项目第五轮 readiness 目标 **部分通过**：

- 本地 Node 项目构建、测试、权限回归、安全扫描：通过。
- LiveKit token grant 逻辑：通过本地假签名解码验证。
- `robot-web-publisher` 代码与构建：通过。
- Android 项目静态结构：通过。
- 文档完整性：通过。
- Android 命令行可复现构建：失败，项目缺少 `gradlew`，本机无 `gradle`/`adb`/Android SDK。
- 真实 LiveKit 视频、浏览器摄像头发布、Android 真机摄像头、公网 HTTPS/WSS：未能验证，原因是缺少真实 LiveKit 凭证、Android SDK/真机、机器人设备和公网部署环境。

是否可进入真实环境测试：**可以开始准备真实 LiveKit/Android/公网测试，但不能签署完整真实环境通过**。

## 3. 工作区和结构检查

已确认存在：

- `backend/`
- `web-client/`
- `robot-web-publisher/`
- `android-robot/`
- `docs/`
- `docs/FIFTH_ROUND_REAL_ENV_READINESS_REPORT.md`
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md`

当前 git 工作区在本次验收前已有以下变更：

- `android-robot/README.md`
- `docs/ANDROID_ROBOT_SETUP.md`
- `docs/DEPLOYMENT.md`
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md`
- `docs/LIVEKIT_SETUP.md`
- `docs/FIFTH_ROUND_REAL_ENV_READINESS_REPORT.md`

本次新增：

- `docs/FIFTH_ROUND_ACCEPTANCE_REPORT.md`

## 4. 命令执行结果

### 4.1 Backend

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm ci --no-audit --fund=false` | 通过 | lockfile 可复现安装 |
| `npm run lint` | 通过 | TypeScript noEmit |
| `npm run test` | 通过 | `commandValidation tests passed` |
| `npm run build` | 通过 | 生成/更新 `dist/` |

### 4.2 Web Client

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm ci --no-audit --fund=false` | 通过 | lockfile 可复现安装 |
| `npm run lint` | 通过 | TypeScript noEmit |
| `npm run test` | 通过 | 当前 test 为 TypeScript noEmit |
| `npm run build` | 通过 | Vite build 成功 |

备注：Vite 提示 chunk size warning，主要来自 LiveKit client bundle，当前为非阻塞问题。

### 4.3 Robot Web Publisher

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm ci --no-audit --fund=false` | 通过 | lockfile 可复现安装 |
| `npm run lint` | 通过 | TypeScript noEmit |
| `npm run test` | 通过 | 当前 test 为 TypeScript noEmit |
| `npm run build` | 通过 | Vite build 成功 |

备注：Vite 提示 chunk size warning，当前为非阻塞问题。

### 4.4 Android Robot

| 命令 | 结果 | 说明 |
|---|---|---|
| `./gradlew test` | 失败 | `./gradlew` 不存在 |
| `./gradlew assembleDebug` | 失败 | `./gradlew` 不存在 |
| `gradle test` | 失败 | 本机无 `gradle` 命令 |
| `gradle assembleDebug` | 失败 | 本机无 `gradle` 命令 |
| `command -v adb` | 失败 | 本机 PATH 中无 `adb` |
| `printenv ANDROID_HOME` | 失败 | 未设置 `ANDROID_HOME` |
| `ls /Users/linziwei/Library/Android` | 失败 | 常规 Android SDK 目录不存在 |

环境观察：

- `/Applications` 中存在 `Android Studio.app`。
- 但当前命令行环境没有 Android SDK、ADB、Gradle，也没有项目内 Gradle wrapper。
- 因此 Android 真正可复现构建仍失败。

### 4.5 前四轮权限回归

运行 backend 本地 mock 环境：

```text
PORT=3101
MOCK_ROBOT_ONLINE=false
LiveKit token mode: mock
```

黑盒脚本结果：12 项通过，0 项失败。

覆盖项：

- `/health` 正常。
- Alice 成为 controller。
- Bob 请求 controller 时保持 viewer。
- join 响应不包含 `LIVEKIT_API_SECRET` 字段。
- 新房间 `MOCK_ROBOT_ONLINE=false` 时 robot offline。
- WebSocket chat 广播。
- viewer 直接 WebSocket 控制被拒绝，错误码 `NOT_CONTROLLER`。
- controller 在 robot offline 时控制被拒绝，错误码 `ROBOT_OFFLINE`。
- robot join 后 online。
- controller 可发送 `1002`、`1003`、`1000`。
- `1001` 被拒绝，错误码 `COMMAND_NOT_ALLOWED`。
- `9999` 被拒绝，错误码 `COMMAND_NOT_ALLOWED`。
- sender mismatch 被拒绝，错误码 `SENDER_MISMATCH`。

## 5. 真实 LiveKit 视频链路验收

已通过：

- backend `.env.example` 包含 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` 占位。
- `backend/src/services/liveKitTokenService.ts` 统一生成 LiveKit token。
- 本地假签名 token grant 解码验证通过：
  - viewer: `roomJoin=true`、`canSubscribe=true`、`canPublish=false`
  - controller: `roomJoin=true`、`canSubscribe=true`、`canPublish=false`
  - robot: `roomJoin=true`、`canSubscribe=true`、`canPublish=true`
  - grant room 限定到请求 room。
  - metadata role 正确。
- Web client 使用 backend 返回的 `liveKitUrl` 和 `token` 连接 LiveKit。
- Web client 会自动订阅 remote track，并筛选 identity/name 包含 `robot` 的 participant。
- `RobotVideo` 会 attach robot video track。
- backend 不代理视频帧。

未能验证：

- backend 使用真实 LiveKit 凭证返回 `tokenMode: "livekit"`。
- Web client 真实连接 LiveKit Cloud。
- Web client 真实看到 robot participant video track。

原因：

- 工作区没有真实 `backend/.env`。
- 未提供真实 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`。
- 未启动真实 LiveKit Cloud/Server 环境。

结论：**代码路径和 grant 逻辑通过；真实 LiveKit 视频链路未实测。**

## 6. robot-web-publisher 摄像头发布验收

已通过：

- `robot-web-publisher` 依赖安装通过。
- `robot-web-publisher` lint/test/build 通过。
- `.env.example` 支持 `VITE_API_BASE_URL` 和 `VITE_WS_BASE_URL`。
- 源码调用 `POST /api/robots/join` 获取 robot token。
- 源码打开 backend WebSocket `/ws`，并以 robot participant 发送 `hello`。
- 源码在 mock token mode 下不会请求摄像头，也不会尝试发布视频。
- 源码在 real LiveKit token mode 下会：
  - `room.connect(joinResponse.liveKitUrl, joinResponse.token)`
  - `createLocalVideoTrack()`
  - `publishTrack(videoTrack, { source: Track.Source.Camera })`

未能验证：

- 浏览器实际弹出/允许摄像头权限。
- 本机摄像头实际打开。
- robot-web-publisher 实际 publish camera video track 到 LiveKit。
- Web client 实际看到 robot-web-publisher 的视频。

原因：

- 没有真实 LiveKit 凭证。
- 未进入 real token mode。
- 未请求浏览器摄像头权限。

结论：**robot-web-publisher 代码和构建通过；真实摄像头发布未实测。**

## 7. Android 构建可复现性验收

静态通过：

- `android-robot/settings.gradle` 存在。
- `android-robot/build.gradle` 存在。
- `android-robot/app/build.gradle` 存在。
- `android-robot/app/src/main/AndroidManifest.xml` 存在。
- `minSdk 27`，满足 Android 8.1 / API 27。
- Manifest 包含：
  - `INTERNET`
  - `CAMERA`
  - `RECORD_AUDIO`
- Android UI 可输入：
  - `backendUrl`
  - `robotId`
  - `roomName`
- Android 通过 backend `/api/robots/join` 获取 token。
- Android 使用 backend 返回的 `liveKitUrl` 和 `token` 连接 LiveKit。
- Android 运行时请求 camera 权限。
- Android 可启用 camera track。
- Android 默认 microphone 关闭。
- Android WebSocket 会从 `https://` backendUrl 推导 `wss://.../ws`。
- Android 控制接收仍使用 `MockRobotControlAdapter`，不会移动真实硬件。

失败：

- `./gradlew test` 失败，因为没有 `gradlew`。
- `./gradlew assembleDebug` 失败，因为没有 `gradlew`。
- `gradle test` 失败，因为没有系统 `gradle`。
- `gradle assembleDebug` 失败，因为没有系统 `gradle`。
- `adb` 不可用。
- `ANDROID_HOME` 未设置。
- 常规 Android SDK 路径不存在。

观察：

- 本机有 `Android Studio.app`，但还不能证明 Android SDK/Gradle/ADB 已配置到命令行。

结论：**Android 项目结构通过；命令行可复现构建失败。**

## 8. 文档完整性验收

通过：

- `docs/FIFTH_ROUND_REAL_ENV_READINESS_REPORT.md` 存在，并明确第五轮不开发新功能，只补真实环境验收准备。
- `docs/FOUR_ROUND_FULL_TEST_PLAN.md` 存在，并覆盖：
  - backend build/test
  - web-client build/test
  - robot-web-publisher build/test
  - Android build/install
  - real LiveKit video test
  - Android camera test
  - online HTTPS/WSS test
  - controller/viewer permission test
  - secret safety check
  - final checklist
- `docs/ANDROID_ROBOT_SETUP.md` 和 `android-robot/README.md` 覆盖 Android Studio、Android SDK、Platform-Tools、Gradle wrapper、`assembleDebug`、`adb install`。
- `docs/LIVEKIT_SETUP.md` 覆盖真实 LiveKit env、`tokenMode: "livekit"` 确认、robot-web-publisher 摄像头测试、常见问题。
- `docs/DEPLOYMENT.md` 和 `docs/ONLINE_TEST_PLAN.md` 覆盖 HTTPS/WSS、`CORS_ORIGIN`、`VITE_API_BASE_URL`、`VITE_WS_BASE_URL`、WebSocket upgrade、Android 不能填 `localhost`。
- `docs/ROBOT_CONTROL_PROTOCOL.md` 明确只允许 `1002`、`1003`、`1000`，并禁止 `1001` 作为默认产品控制命令。

结论：**文档完整性通过。**

## 9. 安全验收

通过：

- 未发现 `.env`、`.env.local`、`.env.production`。
- `.env.example` 使用空值或示例占位。
- Web source/dist 未发现 `LIVEKIT_API_SECRET`。
- robot-web-publisher source/dist 未发现 `LIVEKIT_API_SECRET`。
- Android source 未发现 `LIVEKIT_API_SECRET`。
- 长 JWT / private key / OpenAI-style secret 形态未命中。
- 未发现 `eval`、`Function`、pickle/unsafe deserialization 等明显危险模式。
- backend 日志只打印请求方法、路径、状态、耗时、token mode 和 mock 控制参数，未发现 token/secret 打印路径。
- backend 错误处理返回通用 `INTERNAL_ERROR`，不直接返回 stack trace。
- viewer 越权控制在服务端被拒绝。

注意：

- `android:usesCleartextTraffic="true"` 仍存在。文档已说明这是 LAN 调试需要；线上必须使用可信 `https://` backendUrl。

结论：**安全扫描通过；Android cleartext 线上风险已由文档约束，但真实设备上仍需验证。**

## 10. 未能验证项目和原因

| 项目 | 状态 | 原因 |
|---|---|---|
| backend 返回真实 `tokenMode: "livekit"` | 未验证 | 没有真实 LiveKit env |
| Web client 连接真实 LiveKit | 未验证 | 没有真实 LiveKit env |
| robot-web-publisher 打开摄像头 | 未验证 | 没有真实 LiveKit env，未请求摄像头权限 |
| robot-web-publisher 发布真实 video track | 未验证 | 没有真实 LiveKit env |
| Web client 渲染 robot-web-publisher 视频 | 未验证 | 没有真实 LiveKit env 和摄像头发布 |
| Android `./gradlew test` | 失败 | 没有 `gradlew` |
| Android `./gradlew assembleDebug` | 失败 | 没有 `gradlew` |
| Android 真机安装 APK | 未验证 | 无 APK、无 `adb`、无设备 |
| Android 发布真机摄像头 | 未验证 | 无 Android SDK/ADB/真机/LiveKit env |
| 公网 backend HTTPS/WSS | 未验证 | 未部署 |
| 公网 Web HTTPS | 未验证 | 未部署 |
| 公网 CORS/WSS upgrade | 未验证 | 未部署 |
| A/B 公网用户观看机器人视频 | 未验证 | 无公网环境、无真实视频 |
| 机器人真机硬件安全行为 | 未验证 | 无机器人真机；当前代码仍 mock-only |

## 11. 阻塞问题

正式第五轮验收阻塞于：

- 无真实 LiveKit 凭证。
- 无真实 LiveKit Cloud/Server 测试环境。
- `android-robot/` 缺少 Gradle wrapper。
- 当前命令行没有 `gradle`。
- 当前命令行没有 `adb`。
- 当前未设置 `ANDROID_HOME`。
- 当前没有可用 Android SDK 目录。
- 没有 Android 8.1/API 27+ 真机或机器人。
- 没有公网 backend/web 部署。
- 没有 HTTPS/WSS 域名和 WebSocket upgrade 验证。

## 12. 非阻塞问题

- Web client 和 robot-web-publisher build 均有 Vite chunk size warning，当前不影响 MVP 验收。
- Android Studio app 存在，但 CLI 构建链路仍未配置，不能替代 `./gradlew` 可复现构建。
- Android Manifest 允许 cleartext traffic，LAN 调试可接受；线上必须按文档使用 HTTPS。
- 当前 Node test 主要是 TypeScript check 和 command validation，前端/robot publisher 还没有更细的自动化单元测试。

## 13. 下一步建议

建议按顺序补齐真实验收：

1. 通过 Android Studio 或系统 Gradle 生成 `android-robot/gradlew` 和 wrapper 文件，不要手写 wrapper。
2. 安装/配置 Android SDK、Platform-Tools，并确保 `adb` 可用。
3. 运行 `./gradlew test` 和 `./gradlew assembleDebug`。
4. 配置真实 `backend/.env`：
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `MOCK_ROBOT_ONLINE=false`
5. 启动 backend，确认日志为 `LiveKit token mode: livekit`。
6. 启动 web-client 和 robot-web-publisher。
7. 允许浏览器摄像头权限，验证 Web 能看到 robot-web-publisher 视频。
8. 安装 Android APK 到 Android 8.1/API 27+ 设备，验证 Android 摄像头发布。
9. 部署 backend/web 到 HTTPS/WSS 公网环境。
10. 按 `docs/ONLINE_TEST_PLAN.md` 做 A/B 用户 + Android robot 线上验收。

## 14. 最终签署状态

第五轮验收状态：**条件通过，但真实环境项未完成**。

可以签署：

- 本地构建和静态检查。
- LiveKit grant 逻辑。
- `robot-web-publisher` 代码路径和构建。
- Android 项目静态结构。
- 文档完整性。
- 安全扫描。
- 前四轮权限回归。

不能签署：

- 真实 LiveKit 视频链路。
- robot-web-publisher 真实摄像头发布。
- Android 命令行可复现构建。
- Android 真机摄像头发布。
- 公网 HTTPS/WSS 端到端验收。
