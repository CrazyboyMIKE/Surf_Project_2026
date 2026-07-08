# LiveKit Robot MVP Codex Supervision

目标：用 Codex 协助开发一个可运行的机器人远程临场 MVP。

第一轮先完成 Web + Backend 的最小业务闭环，不接真实 Android 摄像头，不接真实机器人运动。第二轮再接 LiveKit 真实视频和 Android 机器人端。

## 1. MVP 核心范围

必须完成：

| 编号 | 功能 | 第一轮要求 |
|---|---|---|
| MVP-01 | 一个机器人对应一个房间 | 用 `roomName` 和 `robotId` 表达 |
| MVP-02 | Web 用户加入房间 | 可输入 `roomName` 和用户名 |
| MVP-03 | 多人同时加入同一房间 | 至少两个浏览器窗口可测试 |
| MVP-04 | 角色区分 | `viewer` 和 `controller` |
| MVP-05 | 单 controller | 每个房间最多一个 controller |
| MVP-06 | 基础文字聊天 | 同房间广播 |
| MVP-07 | 控制权限检查 | 只有 controller 可以发控制 |
| MVP-08 | 控制命令白名单 | 只允许 `1002`、`1003`、`1000` |
| MVP-09 | Robot mock | 后端或 WebSocket 中模拟 robot 在线和收到控制 |
| MVP-10 | 视频区域占位 | Web 显示 robot video placeholder |

后续轮次再做：

- Android robot app 加入 LiveKit 房间。
- Robot 发布摄像头视频。
- Web 订阅真实机器人视频。
- Robot 接收控制并调用真实 SDK 或 MQTT 控制接口。

## 2. 非目标范围

第一轮不要做：

1. 不要自己从零实现 WebRTC。
2. 不要自己写 SFU。
3. 不要让后端转发视频帧。
4. 不要先做复杂 UI。
5. 不要先做账号注册系统。
6. 不要先做数据库。
7. 不要做录制、回放、权限后台。
8. 不要一开始支持多个机器人同屏调度。
9. 不要一开始支持多人抢控制权。
10. 不要把 LiveKit API Secret 写进前端。
11. 不要控制真实机器人硬件。

## 3. 推荐系统架构

```text
Web Client
  - join room
  - view robot video placeholder
  - chat
  - controller sends command

Backend Server
  - room state
  - participant state
  - controller ownership
  - LiveKit token service, mock allowed in first round
  - WebSocket chat and control relay

LiveKit Server
  - second round real media
  - first round only reserved by token service abstraction

Android Robot App
  - second round
  - joins LiveKit
  - publishes camera
  - receives control
```

## 4. 技术选型

Backend:

```text
Language: TypeScript
Runtime: Node.js
HTTP: Express
WebSocket: ws
Storage: in-memory Map
LiveKit: token service abstraction, mock/dev mode allowed
```

Web:

```text
Framework: React + TypeScript
Build: Vite or equivalent simple setup
UI: simple CSS
Communication: HTTP + WebSocket
```

Android later:

```text
Language: Kotlin or Java
Min Android: Android 8.1 / API 27
SDK: LiveKit Android SDK
Control: RobotControlAdapter
```

## 5. 角色与权限

```ts
type Role = "robot" | "controller" | "viewer";
```

权限：

| 角色 | 看视频 | 发聊天 | 发控制 | 发布机器人视频 |
|---|---:|---:|---:|---:|
| robot | 可选 | 可选 | 接收 | 后续轮次 |
| controller | 是 | 是 | 是 | 否 |
| viewer | 是 | 是 | 否 | 否 |

控制者规则：

1. 每个 room 最多一个 controller。
2. 用户可申请 controller。
3. 如果当前没有 controller，申请成功。
4. 如果已有 controller，申请失败。
5. controller 离开或释放后，控制权释放。

## 6. 控制指令协议

第一轮只允许：

```text
1002
1003
1000
```

推荐消息：

```json
{
  "type": "robot_control",
  "roomName": "robot-room-001",
  "senderId": "user-abc",
  "command": "1002",
  "timestamp": 1760000000000
}
```

后端转发前必须检查：

1. room 是否存在。
2. sender 是否属于 room。
3. sender 是否为 current controller。
4. command 是否在白名单。
5. robot 是否在线或 mock online。

## 7. 聊天消息协议

```json
{
  "type": "chat",
  "roomName": "robot-room-001",
  "senderId": "user-abc",
  "senderName": "Alice",
  "message": "Hello",
  "timestamp": 1760000000000
}
```

规则：

- 空消息不能发送。
- 消息最大长度建议 500 字符。
- 同房间广播。
- 第一轮不做历史消息存储。

## 8. 第一轮任务拆分

Backend:

1. 初始化 TypeScript + Express。
2. 实现 `/health`。
3. 实现 join robot 和 join room。
4. 实现 controller request/release。
5. 实现 WebSocket。
6. 实现 chat 广播。
7. 实现 robot_control 校验和 mock relay。

Web:

1. 初始化 React + TypeScript。
2. 实现 JoinRoom 表单。
3. 实现状态栏。
4. 实现 robot video placeholder。
5. 实现 ControlPanel。
6. 实现 ChatPanel。
7. 接入 HTTP 和 WebSocket。

Docs:

1. 更新 MVP 说明。
2. 更新 API 说明。
3. 更新测试说明。

## 9. Codex 工作规则

Codex 必须：

- 一次只做第一轮 MVP 范围内的事。
- 不要接真实机器人。
- 不要接真实摄像头。
- 不要写死 secret。
- 不要让 viewer 发送控制。
- 不要扩展命令白名单。
- 写完后给出运行和测试步骤。
