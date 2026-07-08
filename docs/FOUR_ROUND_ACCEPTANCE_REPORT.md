# Four-Round MVP Acceptance Report

测试日期：2026-07-09（Asia/Shanghai）

## 1. 验收结论

当前工作区已经具备前四轮 MVP 的主要代码与文档结构，本地自动化验收显示：

- 第一轮 Web + Backend 房间、角色、聊天、控制权限闭环：通过本地黑盒测试。
- 第二轮 LiveKit 视频链路：代码、构建、token grant 通过；真实 LiveKit 视频未实测，因为本机没有真实 LiveKit 凭证。
- 第三轮 Android robot app：静态验收通过；未能编译运行，因为当前环境没有 Gradle/Android SDK，项目也没有 `gradlew`。
- 第四轮线上部署：文档和环境变量支持基本齐全；未实际部署，因为没有公网部署账号、域名、HTTPS/WSS 服务和真实 LiveKit 环境。

是否达到前四轮 MVP 标准：**本地业务闭环达到；不能判定完全达到真实 Android 视频与线上部署标准**。正式通过第四轮验收前，还需要在真实 LiveKit + Android SDK/设备 + 公网部署环境中完成端到端测试。

## 2. 当前项目结构

已确认存在：

- `backend/`
- `web-client/`
- `robot-web-publisher/`
- `android-robot/`
- `docs/`
- `backend/.env.example`
- `web-client/.env.example`
- `robot-web-publisher/.env.example`

未发现真实配置文件：

- 未发现 `.env`
- 未发现 `.env.local`
- 未发现 `.env.production`

文档状态：

- 存在 `docs/TEST_PLAN.md`
- 存在 `docs/API_CONTRACT.md`
- 存在 `docs/ROBOT_CONTROL_PROTOCOL.md`
- 存在 `docs/ARCHITECTURE.md`
- 存在 `docs/DEPLOYMENT.md`
- 存在 `docs/ONLINE_TEST_PLAN.md`
- 存在 `docs/ANDROID_ROBOT_SETUP.md`
- 存在 `docs/LIVEKIT_SETUP.md`
- 缺少用户提到的 `docs/FOUR_ROUND_FULL_TEST_PLAN.md`

注意：当前 git 工作区已有大量未提交/未跟踪的前序开发结果，本报告只新增验收报告，不回滚或修改这些文件。

## 3. 运行过的命令

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm ci --no-audit --fund=false` in `backend/` | 通过 | 依赖可按 lockfile 安装 |
| `npm run lint` in `backend/` | 通过 | TypeScript noEmit |
| `npm run test` in `backend/` | 通过 | command validation tests |
| `npm run build` in `backend/` | 通过 | TypeScript build |
| `npm ci --no-audit --fund=false` in `web-client/` | 通过 | 依赖可安装 |
| `npm run lint` in `web-client/` | 通过 | TypeScript noEmit |
| `npm run test` in `web-client/` | 通过 | 当前 test 为 TypeScript noEmit |
| `npm run build` in `web-client/` | 通过 | Vite build 成功，有非阻塞 chunk size warning |
| `npm ci --no-audit --fund=false` in `robot-web-publisher/` | 通过 | 依赖可安装 |
| `npm run lint` in `robot-web-publisher/` | 通过 | TypeScript noEmit |
| `npm run test` in `robot-web-publisher/` | 通过 | 当前 test 为 TypeScript noEmit |
| `npm run build` in `robot-web-publisher/` | 通过 | Vite build 成功，有非阻塞 chunk size warning |
| `./gradlew test` in `android-robot/` | 失败 | `./gradlew` 不存在 |
| `./gradlew assembleDebug` in `android-robot/` | 失败 | `./gradlew` 不存在 |
| `gradle test` in `android-robot/` | 失败 | 本机没有 `gradle` 命令 |
| `gradle assembleDebug` in `android-robot/` | 失败 | 本机没有 `gradle` 命令 |
| backend HTTP/WebSocket acceptance script | 通过 | 19 项通过，0 项失败 |
| Web UI smoke test | 通过 | 单标签页 26 项通过，0 项失败 |
| LiveKit token grant decode test | 通过 | 未输出 token，只检查 grant |
| secret/static scan | 通过 | 未发现真实 `.env` 或高风险长 token 形态 |

## 4. 后端验收结果

通过：

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`
- WebSocket `chat`
- WebSocket `robot_control`
- viewer 直接绕过前端发控制会被拒绝，错误码 `NOT_CONTROLLER`
- robot offline 时 controller 控制会被拒绝，错误码 `ROBOT_OFFLINE`
- `1001` 被拒绝，错误码 `COMMAND_NOT_ALLOWED`
- `9999` 被拒绝，错误码 `COMMAND_NOT_ALLOWED`
- sender 与 WebSocket `hello` 身份不一致会被拒绝，错误码 `SENDER_MISMATCH`
- controller 在 robot online 后可以发送 `1002`、`1003`、`1000`
- LiveKit token 由 backend 生成，API 响应未返回 `LIVEKIT_API_SECRET` 字段
- 错误处理返回通用 `INTERNAL_ERROR`，不向用户返回 stack trace

静态审阅通过：

- room 状态在 `backend/src/state/roomStore.ts`
- WebSocket 处理在 `backend/src/ws/webSocketServer.ts`
- 控制命令白名单和参数校验在 `backend/src/control/commandValidation.ts`
- LiveKit token 生成在 `backend/src/services/liveKitTokenService.ts`
- 日志只打印请求路径、状态、耗时、token mode 和 mock 控制参数，未发现打印 secret 或 token

## 5. Web Client 验收结果

通过：

- 可以输入 `roomName` 和 `participantName`
- 可以选择初始角色并加入房间
- 状态栏显示 room、user、role、backend、WebSocket、LiveKit、robot、controller、participants
- `Robot offline` 占位在机器人离线时可见
- mock token + robot online 时显示 `Robot video will appear here`
- controller 在 robot online 后控制按钮可用
- viewer 控制按钮禁用
- Stop 按钮可发送 `1000` 并显示 mock event
- 聊天输入可发送，消息通过 WebSocket 回显到 UI
- 构建支持 `VITE_API_BASE_URL`
- 构建支持 `VITE_WS_BASE_URL`
- 生产文档要求 `VITE_WS_BASE_URL=wss://...`

静态审阅通过：

- `web-client/src/api.ts` 将前端 API 与组件分离
- `web-client/src/useRoomSocket.ts` 处理 WebSocket
- `web-client/src/useLiveKitRoom.ts` 使用 backend 返回的 LiveKit URL/token
- `web-client/src/components/RobotVideo.tsx` 会 attach robot participant 的 remote video track
- 当 LiveKit connected 但没有 robot video track 时，代码会显示 `Waiting for robot video`

限制：

- 本次没有真实 LiveKit 凭证，因此 Web 没有连接真实 LiveKit，也没有看到真实机器人视频。
- 内置浏览器环境只保留一个活动标签页，多窗口 UI 场景没有可靠实测；双客户端聊天与权限已由后端 WebSocket 黑盒脚本覆盖。

## 6. robot-web-publisher 验收结果

通过：

- 目录存在
- `.env.example` 存在
- 依赖安装通过
- lint/test/build 通过
- 静态审阅确认可以输入 `roomName` 和 `robotId`
- 静态审阅确认调用 `POST /api/robots/join` 获取 robot token
- 静态审阅确认 mock token 时不会尝试发布视频
- 静态审阅确认 real LiveKit token 时会调用 browser camera，并 publish camera video track
- 静态审阅确认会打开 backend WebSocket `/ws` 并发送 robot `hello`

未实测：

- 未打开本机摄像头。
- 未发布真实 video track 到 LiveKit。
- 未在 Web Client 中看到 `robot-web-publisher` 视频。

原因：当前没有真实 LiveKit 凭证，且浏览器摄像头权限不应在无真实视频验收环境时自动请求。

## 7. Android Robot App 验收结果

静态验收通过：

- `android-robot/` 存在
- `minSdk 27`，满足 Android 8.1 / API 27
- `AndroidManifest.xml` 包含 `INTERNET`
- `AndroidManifest.xml` 包含 `CAMERA`
- `AndroidManifest.xml` 包含 `RECORD_AUDIO`
- Android 不包含 `LIVEKIT_API_SECRET`
- Android 通过 `RobotJoinApi.kt` 调用 backend `POST /api/robots/join`
- UI 可配置 `backendUrl`
- UI 可配置 `robotId`
- UI 可配置 `roomName`
- 默认 `backendUrl` 是 LAN 示例，不是 `localhost`
- `RobotJoinApi.normalizeBackendUrl` 要求 `http://` 或 `https://`
- `RobotControlMessageHandler` 会从 `https://` 推导 `wss://.../ws`
- `LiveKitRobotClient` 使用 backend 返回的 `liveKitUrl` 和 `token`
- `LiveKitRobotClient` 会启用 camera track
- 音频发布默认关闭，勾选后才启用 microphone
- `RobotControlMessageHandler` 接收 `robot_control`
- `MockRobotControlAdapter` 只返回显示/log 字符串，不移动真实硬件

未通过/未实测：

- `./gradlew test` 未运行成功：项目没有 Gradle wrapper。
- `./gradlew assembleDebug` 未运行成功：项目没有 Gradle wrapper。
- `gradle test` 未运行成功：当前环境没有系统 Gradle。
- `gradle assembleDebug` 未运行成功：当前环境没有系统 Gradle。
- 没有 Android SDK/设备，无法安装 APK、授权摄像头或发布真实 Android 摄像头。

## 8. LiveKit 验收结果

通过：

- backend `.env.example` 包含 `LIVEKIT_URL`
- backend `.env.example` 包含 `LIVEKIT_API_KEY`
- backend `.env.example` 包含 `LIVEKIT_API_SECRET`
- backend 缺少任一 LiveKit 配置时返回 mock token mode
- backend token grant 本地解码验证通过：
  - viewer: `roomJoin=true`、`canSubscribe=true`、`canPublish=false`
  - controller: `roomJoin=true`、`canSubscribe=true`、`canPublish=false`
  - robot: `roomJoin=true`、`canSubscribe=true`、`canPublish=true`
  - grant room 限定到请求的 room
  - metadata role 正确

未实测：

- Web 连接真实 LiveKit。
- Android robot 或 robot-web-publisher 连接真实 LiveKit。
- Web 看到 robot participant 的真实 video track。

原因：当前没有真实 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`。

## 9. 线上部署验收结果

通过静态审阅：

- 存在 `docs/DEPLOYMENT.md`
- 存在 `docs/ONLINE_TEST_PLAN.md`
- backend 支持 `PORT`
- backend 支持 `PUBLIC_BASE_URL`
- backend 支持 `CORS_ORIGIN`
- backend 支持 `LIVEKIT_URL`
- backend 支持 `LIVEKIT_API_KEY`
- backend 支持 `LIVEKIT_API_SECRET`
- backend 支持 `NODE_ENV`
- web-client 支持 `VITE_API_BASE_URL`
- web-client 支持 `VITE_WS_BASE_URL`
- 文档要求生产环境使用 HTTPS/WSS
- Android 文档说明线上不能填 `localhost`
- Android app 可输入公网 backendUrl
- backend CORS 可通过 `CORS_ORIGIN` 限定线上 Web 域名

未实测：

- 未部署 backend 到公网。
- 未部署 Web client 到公网。
- 未配置真实 HTTPS/WSS 域名。
- 未让公网用户 A/B 加入同一房间。
- 未让 Android robot 使用公网 backendUrl。

部署前检查项：

- 配置生产 backend env，且不要使用 `CORS_ORIGIN=*`
- 确认 hosting provider 支持 WebSocket upgrade `/ws`
- Web build 设置 `VITE_API_BASE_URL=https://...`
- Web build 设置 `VITE_WS_BASE_URL=wss://...`
- Android 使用可信证书的 `https://` backendUrl
- backend 配置真实 LiveKit Cloud 或公网 LiveKit Server

## 10. 安全验收结果

通过：

- 未发现真实 `.env`、`.env.local`、`.env.production`
- `.gitignore` 包含 `.env`、`.env.local`、`.env.production`
- `.env.example` 只包含空值或示例占位
- 未在 Web 源码或 Web dist 中发现 `LIVEKIT_API_SECRET`
- 未在 Android 源码中发现 `LIVEKIT_API_SECRET`
- 未发现常见长 secret/token/JWT 形态
- 未发现 `eval` 或明显 unsafe deserialization
- viewer 直接 WebSocket 控制被 backend 拒绝
- backend 不返回 stack trace
- backend API 响应未返回 LiveKit API secret 字段

注意：

- Android Manifest 当前设置 `android:usesCleartextTraffic="true"`，适合 LAN 调试；线上测试仍必须使用文档要求的 `https://` backendUrl。

## 11. 手动/端到端场景结果

已实测：

- 启动 backend：通过，但需要本机端口监听权限。
- 启动 web-client：通过，但需要本机端口监听权限。
- 用户 Alice 加入 room 成为 controller：通过。
- robot offline 时显示 `Robot offline`：通过。
- robot online mock 状态后 controller 控制按钮启用：通过。
- controller 发送 `1000` Stop 并显示 mock event：通过。
- viewer 显式加入时控制按钮禁用：通过。
- WebSocket 双客户端 chat 广播：通过，使用黑盒脚本。
- WebSocket 双客户端 viewer 越权控制拒绝：通过，使用黑盒脚本。
- `1001` / `9999` 拒绝：通过。

未实测：

- 启动 robot-web-publisher 并打开摄像头。
- Android robot app 真机加入。
- A/B 两个真实浏览器窗口同时看到机器人视频。
- 关闭机器人端后 Web 从 online 变 offline，再重新加入恢复视频。

原因：

- 没有真实 LiveKit 凭证。
- 没有 Android SDK/Gradle/设备。
- 没有公网部署环境。
- 内置浏览器测试环境不可靠支持多窗口 UI。

## 12. 阻塞问题

这些问题会阻塞“完整前四轮正式验收”：

- 缺少真实 LiveKit 配置，无法验证真实视频链路。
- 缺少 Android SDK/Gradle/设备，无法验证 Android build、安装、摄像头发布。
- `android-robot/` 没有 `gradlew`，降低 Android 构建可复现性。
- 未部署公网 backend/web，无法验证 HTTPS/WSS、公网 CORS、外部用户访问。
- 缺少用户提到的 `docs/FOUR_ROUND_FULL_TEST_PLAN.md`。

## 13. 非阻塞问题

- Web 和 robot-web-publisher production build 有 Vite chunk size warning，主要由 LiveKit client 包体积造成，不影响当前 MVP 功能。
- Android Manifest 允许 cleartext traffic，LAN 调试可接受，线上必须使用 HTTPS。
- 当前工作区有未提交/未跟踪文件；如果要交付仓库，需要确认这些开发结果都被纳入版本控制。
- Web mock token + robot online 时显示 `Robot video will appear here`；真实 LiveKit connected 但无视频时才显示 `Waiting for robot video`。

## 14. 下一步建议

1. 在 Android 开发环境中添加或生成 Gradle wrapper，并运行 `./gradlew test`、`./gradlew assembleDebug`。
2. 配置真实 LiveKit Cloud 凭证到 backend 本地 `.env`，重新跑 robot-web-publisher 视频链路。
3. 用 Android 8.1/API 27+ 设备安装 debug APK，验证 camera permission、LiveKit publish、Web 订阅视频。
4. 部署 backend 和 Web 到公网 HTTPS/WSS 环境，按 `docs/ONLINE_TEST_PLAN.md` 做 A/B 用户验收。
5. 补充或恢复 `docs/FOUR_ROUND_FULL_TEST_PLAN.md`，让四轮验收计划与本报告可追踪对应。
