# LiveKit Cloud 方案实现报告

日期：2026-07-14

## 1. 本轮完成了什么

本轮新建了独立目录 `livekit_cloud_mvp/`，作为只使用 LiveKit Cloud 的机器人远程临场 MVP 项目。

本项目和旧的自建 LiveKit Server 方案分开，不复用旧部署目录，不包含自建 LiveKit Server、Redis、coturn/TURN、LiveKit Nginx 反代或媒体端口开放配置。

完成内容：

- 新建独立 backend、web-client、robot-web-publisher、android-robot 目录。
- 从当前已验证 MVP 复制可运行代码，并在新目录内调整为 LiveKit Cloud-only 语义。
- backend 只允许真实媒体模式使用 `wss://*.livekit.cloud`。
- backend 继续负责 LiveKit token、房间、角色、聊天、controller 权限和 mock robot_control。
- web-client 支持房间加入、状态显示、机器人视频、聊天、controller/viewer 控制 UI。
- robot-web-publisher 支持通过 backend 获取 robot token 并发布电脑摄像头到 LiveKit Cloud。
- android-robot 保留 Android 8.1 机器人摄像头发布端代码，并补充 LiveKit Cloud 配置文档。
- 新增 Cloud-only Nginx backend/web 示例。
- 新增 LiveKit Cloud 需求、架构、部署、验收、部署日志、上线前说明文档。
- 新增本报告。

## 2. 新建文件

根目录：

- `livekit_cloud_mvp/AGENTS.md`
- `livekit_cloud_mvp/.gitignore`
- `livekit_cloud_mvp/README.md`

Backend：

- `livekit_cloud_mvp/backend/src/*`
- `livekit_cloud_mvp/backend/package.json`
- `livekit_cloud_mvp/backend/tsconfig.json`
- `livekit_cloud_mvp/backend/.env.example`
- `livekit_cloud_mvp/backend/.env.livekit-cloud.example`
- `livekit_cloud_mvp/backend/README.md`

Web client：

- `livekit_cloud_mvp/web-client/src/*`
- `livekit_cloud_mvp/web-client/package.json`
- `livekit_cloud_mvp/web-client/tsconfig.json`
- `livekit_cloud_mvp/web-client/tsconfig.node.json`
- `livekit_cloud_mvp/web-client/vite.config.ts`
- `livekit_cloud_mvp/web-client/index.html`
- `livekit_cloud_mvp/web-client/.env.example`
- `livekit_cloud_mvp/web-client/.env.livekit-cloud.example`
- `livekit_cloud_mvp/web-client/README.md`

Robot web publisher：

- `livekit_cloud_mvp/robot-web-publisher/src/*`
- `livekit_cloud_mvp/robot-web-publisher/package.json`
- `livekit_cloud_mvp/robot-web-publisher/tsconfig.json`
- `livekit_cloud_mvp/robot-web-publisher/vite.config.ts`
- `livekit_cloud_mvp/robot-web-publisher/index.html`
- `livekit_cloud_mvp/robot-web-publisher/.env.example`
- `livekit_cloud_mvp/robot-web-publisher/.env.livekit-cloud.example`
- `livekit_cloud_mvp/robot-web-publisher/README.md`

Android robot：

- `livekit_cloud_mvp/android-robot/settings.gradle`
- `livekit_cloud_mvp/android-robot/build.gradle`
- `livekit_cloud_mvp/android-robot/gradle.properties`
- `livekit_cloud_mvp/android-robot/gradlew`
- `livekit_cloud_mvp/android-robot/gradlew.bat`
- `livekit_cloud_mvp/android-robot/gradle/wrapper/*`
- `livekit_cloud_mvp/android-robot/app/build.gradle`
- `livekit_cloud_mvp/android-robot/app/src/*`
- `livekit_cloud_mvp/android-robot/README.md`
- `livekit_cloud_mvp/android-robot/LIVEKIT_CLOUD_CONFIG.md`

Deployment：

- `livekit_cloud_mvp/deployment/nginx-backend.example.conf`
- `livekit_cloud_mvp/deployment/nginx-web.example.conf`

Docs：

- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_REQUIREMENTS.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_ARCHITECTURE.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_DEPLOYMENT_GUIDE.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_PRE_PRODUCTION_NOTES.md`
- `livekit_cloud_mvp/docs/LIVEKIT_CLOUD_IMPLEMENTATION_REPORT.md`

## 3. 哪些代码可以运行

可以运行和构建：

- `livekit_cloud_mvp/backend`
  - TypeScript build 通过。
  - command whitelist test 通过。
  - LiveKit Cloud env check 通过。
  - 非 Cloud URL 被正确拒绝。
- `livekit_cloud_mvp/web-client`
  - TypeScript check 通过。
  - production build 通过。
- `livekit_cloud_mvp/robot-web-publisher`
  - TypeScript check 通过。
  - production build 通过。
- `livekit_cloud_mvp/android-robot`
  - Gradle wrapper 可用。
  - `./gradlew test` 通过。
  - `./gradlew assembleDebug` 单独运行通过。

## 4. 哪些只是文档或模板

这些文件是模板或操作文档，不会自动部署真实云资源：

- `.env.example`
- `.env.livekit-cloud.example`
- `deployment/nginx-backend.example.conf`
- `deployment/nginx-web.example.conf`
- `docs/LIVEKIT_CLOUD_DEPLOYMENT_GUIDE.md`
- `docs/LIVEKIT_CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`
- `docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`
- `docs/LIVEKIT_CLOUD_PRE_PRODUCTION_NOTES.md`

这些模板使用 `YOUR_*` 和 `example.com` 占位符，没有真实密钥。

## 5. 是否完全独立于自建 LiveKit Server 方案

是。

隔离方式：

- 所有新增代码和文档都在 `livekit_cloud_mvp/`。
- 没有修改旧的 `deployment/self-hosted-livekit/`。
- 没有修改旧的 `plan_b_self_hosted_livekit/`。
- 没有修改旧的 `docs/SELF_HOSTED_LIVEKIT_*` 或 `docs/CLOUD_MINIMAL_LOOP_*`。
- 新 backend 的真实媒体 URL 校验只接受 `wss://*.livekit.cloud`。

## 6. 是否仍然包含自建 LiveKit / Redis / TURN 内容

没有自建 LiveKit / Redis / TURN 配置。

扫描命中项只出现在禁止项或“不需要开放”的说明里，例如文档明确说明本项目不部署这些内容。没有：

- 自建 LiveKit Server 配置文件。
- Redis service 配置。
- coturn/TURN service 配置。
- LiveKit Nginx 反代配置。
- 自建 LiveKit 域名示例。

Cloud 部署文档明确说明云服务器只需要 `22/tcp`、`80/tcp`、`443/tcp`。

## 7. 安全检查结果

已检查：

- 未发现真实 `.env`、`.env.local`、`.env.production`。
- 未发现 `package-lock.json` 被复制到新项目。
- 未发现真实 JWT、private key、OpenAI-style `sk-` key、AWS-style key。
- Web 源码没有 `LIVEKIT_API_SECRET` 实际值。
- robot-web-publisher 源码没有 `LIVEKIT_API_SECRET` 实际值。
- Android 源码没有 `LIVEKIT_API_SECRET` 实际值。
- 示例文件只使用 `YOUR_*` 和 `example.com` 占位符。
- backend 只打印 key/secret 是否存在，不打印值。
- backend 不转发原始视频帧。

注意：文档和 backend 源码中会出现 `LIVEKIT_API_SECRET` 变量名，这是预期的配置说明和 backend-only 读取逻辑，不是真实 secret。

## 8. 构建/测试结果

依赖安装：

- `backend npm install --package-lock=false`: 通过。
- `web-client npm install --package-lock=false`: 通过。
- `robot-web-publisher npm install --package-lock=false`: 通过。

Backend：

- `npm run lint`: 通过。
- `npm run test`: 通过。
- `npm run build`: 通过。
- `npm run check:livekit-env`: 通过，默认 mock 检查通过。
- `LIVEKIT_URL=wss://your-project.livekit.cloud ... npm run check:livekit-env`: 通过，显示 `token mode: livekit`。
- `LIVEKIT_URL=ws://127.0.0.1:7880 ... npm run check:livekit-env`: 按预期失败，错误为必须使用 LiveKit Cloud URL。

Web client：

- `npm run lint`: 通过。
- `npm run test`: 通过。
- `npm run build`: 通过。
- Vite 有 LiveKit bundle size 警告，不阻塞。

Robot web publisher：

- `npm run lint`: 通过。
- `npm run test`: 通过。
- `npm run build`: 通过。
- Vite 有 LiveKit bundle size 警告，不阻塞。

Android robot：

- `./gradlew test`: 通过。
- `./gradlew assembleDebug`: 单独重跑后通过。
- 第一次并行运行 `test` 和 `assembleDebug` 时，`assembleDebug` 因 Kotlin 增量缓存并发冲突失败；单独重跑后成功，不是源码错误。
- Gradle 有未来 Gradle 10 兼容性弃用提示，不阻塞。

格式检查：

- `git diff --check`: 通过。

## 9. 当前是否可以开始 LiveKit Cloud 最小闭环测试

可以开始准备真实 LiveKit Cloud 最小闭环测试。

仍然需要用户提供真实外部资源：

- LiveKit Cloud 项目。
- 真实 `LIVEKIT_URL`。
- 真实 `LIVEKIT_API_KEY`。
- 真实 `LIVEKIT_API_SECRET`。
- 云服务器。
- `api.example.com` / `web.example.com` 对应的真实域名。
- HTTPS 证书。
- Android 8.1 真机或机器人设备。

本轮没有声称真实 LiveKit Cloud 视频链路已通过，因为没有真实 Cloud 凭证和公网部署环境。

## 10. 用户下一步

1. 创建 LiveKit Cloud 项目。
2. 把 LiveKit Cloud 的 URL、API key、API secret 填入 `livekit_cloud_mvp/backend/.env`。
3. 部署 backend，并确认 `https://api.example.com/health` 正常。
4. 部署 web-client，并确认 `https://web.example.com` 可访问。
5. 本地或云端运行 robot-web-publisher。
6. 用 robot-web-publisher 发布电脑摄像头。
7. 两个 Web 用户加入同一房间并观看机器人视频。
8. 测试聊天和 controller/viewer 权限。
9. 测试 `1000 stop`。
10. 安装 Android APK 到 Android 8.1 机器人。
11. Android 填 `backendUrl=https://api.example.com` 并加入同一房间。
12. Web 端确认 Android 机器人摄像头画面。
