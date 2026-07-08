# First Round Development Prompt

把下面内容复制给 Codex，即可开始第一轮开发。

```text
请先阅读并严格遵守项目根目录的 AGENTS.md，以及 livekit_robot_mvp_codex_supervision.md。

当前项目是一个全新项目，已有的是开发规则和需求文档。请完成第一轮 MVP 开发。

产品目标：
开发一个机器人远程临场 MVP。第一轮不接真实机器人、不接真实 Android 摄像头，只先完成 Web + Backend 的最小业务闭环。

第一轮范围：

1. 新建 backend/
   - 使用 Node.js + TypeScript + Express
   - 实现 GET /health
   - 实现 POST /api/rooms/join
   - 实现 POST /api/robots/join
   - 实现 POST /api/rooms/control/request
   - 实现 POST /api/rooms/control/release
   - 使用内存 Map 管理 room、participants、currentControllerId、robotOnline
   - 加入 WebSocket 服务
   - 支持 chat 消息广播
   - 支持 robot_control 消息转发或 mock 记录
   - robot_control 必须校验：
     1. room 存在
     2. sender 在 room 内
     3. sender 是当前 controller
     4. command 只能是 1002 / 1003 / 1000
     5. robot 在线或 mock online
   - LiveKit token 生成逻辑先封装好
   - 如果没有真实 LIVEKIT_API_KEY / LIVEKIT_API_SECRET，允许提供 mock/dev token 模式
   - 不能硬编码任何 secret

2. 新建 web-client/
   - 使用 React + TypeScript
   - 实现一个简单页面
   - 可以输入 roomName、participantName
   - 可以加入房间
   - 可以申请 controller 或保持 viewer
   - 显示当前连接状态、角色、房间名
   - 显示聊天区域
   - 可以发送和接收文字消息
   - 显示机器人视频占位区域，文字为 “Robot video will appear here”
   - 显示控制按钮：前进、后退、左转、右转、停止
   - viewer 角色必须禁用控制按钮
   - controller 才能发送控制消息

3. 新建或更新 docs/
   - docs/MVP_SPEC.md
   - docs/API_CONTRACT.md
   - docs/ARCHITECTURE.md
   - docs/ROBOT_CONTROL_PROTOCOL.md
   - docs/TEST_PLAN.md
   - 文档说明：
     - 第一轮完成了什么
     - 第一轮没完成什么
     - 怎么运行
     - 怎么测试
     - 哪些地方是 mock

4. 第一轮明确不做：
   - 不做真实 Android App
   - 不接真实机器人
   - 不接真实摄像头
   - 不做账号系统
   - 不做数据库
   - 不做复杂 UI
   - 不自己实现 WebRTC
   - 不做真实 LiveKit 视频推流，只预留结构

5. 安全要求：
   - 不要硬编码 API key、secret、token
   - 不要打印 secret
   - 不要加入数据库
   - 不要加入无关依赖
   - 不要实现任意命令执行
   - 不允许 viewer 绕过权限发送控制指令

6. 验证要求：
   - 尽量运行 backend 和 web-client 的 install、lint、build 或 typecheck
   - 如果因为网络或依赖无法运行，要明确说明
   - 给出本地启动命令
   - 给出手动测试步骤：
     1. 启动 backend
     2. 启动 web-client
     3. 打开两个浏览器窗口
     4. 加入同一个 room
     5. 一个成为 controller，一个保持 viewer
     6. 验证 viewer 不能控制
     7. 验证 controller 可以发送 1002 / 1003 / 1000
     8. 验证聊天互通

交付要求：
- 开始前先简短说明开发计划
- 完成后总结：
  - 改了哪些文件
  - 怎么运行
  - 怎么测试
  - 哪些功能是 mock
  - 第二轮建议做什么
```
