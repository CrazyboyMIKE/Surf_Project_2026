# Robot Publisher And Control Transfer Report

## 本轮范围

本轮只完成两个任务：

1. `robot-web-publisher` 从单页发布器改为两个视图：
   - `EntryView`：输入用户名和 roomName，提供“创建房间”和“加入房间”两个入口。
   - `RobotRoomView`：发布机器人本地摄像头，同时订阅并显示 controller / viewer 的远端视频。
2. 增加 controller 将控制权转交给在线 viewer 的能力：
   - 当前 controller 调用 backend transfer API。
   - 目标 viewer 成为新的 controller。
   - 原 controller 自动变为 viewer。
   - backend 通过 WebSocket `role_update` 广播最新状态。

没有做禁言、静音、管理员后台、邀请码系统、机器人 key/token 服务器配置、真实机器人运动控制或任何数据库持久化。

## robot-web-publisher 两页面说明

### EntryView

- 用户名输入框 placeholder 为 `请输入用户名`，不能为空。
- 房间名输入框继续使用 roomName。
- “创建房间”和“加入房间”当前都复用 `POST /api/robots/join`。
- 当前项目没有邀请码系统，本轮未新增邀请码逻辑。
- 页面显示当前 `VITE_API_BASE_URL`，不显示任何 secret。

说明：MVP 阶段 backend 没有独立 create room API，因此“创建房间”目前等价于“以 robot 身份创建/加入指定 roomName”。

### RobotRoomView

- 显示当前房间名、robot 用户名、backend/WebSocket/LiveKit/发布状态。
- 继续发布 robot 本地摄像头到 LiveKit Cloud。
- 显示 robot 本地摄像头预览。
- 订阅远端 Web 用户的视频轨道。
- controller 视频显示在 controller 区域。
- viewer 视频显示在 viewer 列表区域。
- 每个远端视频右下角显示用户名，左上角显示 role。
- 不把 robot 自己作为远端 viewer 显示。
- 没有 controller 视频时显示 `No controller video yet`。
- 没有 viewer 视频时显示 `No viewer video yet`。
- 保留摄像头权限、摄像头不存在、浏览器不支持摄像头 API、backend token 获取失败、LiveKit 连接失败、API/WS 配置错误等提示。

## 控制权转移 API

新增：

```text
POST /api/rooms/control/transfer
```

请求体：

```json
{
  "roomName": "robot-room-001",
  "fromParticipantId": "user-current-controller",
  "targetParticipantId": "user-target-viewer"
}
```

规则：

- 房间必须存在。
- `fromParticipantId` 必须是当前 active controller。
- `targetParticipantId` 必须在同一房间内。
- target 必须是在线 viewer。
- 不允许 viewer 主动把自己变成 controller。
- 不允许转交给 robot。
- 不允许转交给离线 participant。
- 不返回 LiveKit token、API key 或 secret。
- `roomName` 在该接口中只允许字母、数字、`.`、`_`、`:`、`-`。

成功响应包含新的 controller 信息和 participant 快照。

## Web 控制权转移 UI

`web-client` 的 controller 控制面板新增 `Transfer control` 区域：

- 只有当前用户是 controller 时显示。
- 只列出在线 viewer。
- robot 不会出现在可转交列表。
- 点击“转交控制权”前有浏览器确认提示。
- 成功后不在前端伪造角色变化，而是等待 backend 的 WebSocket `role_update`。
- viewer 看不到转交入口。

## WebSocket 状态同步

转交成功后 backend 调用已有 `broadcastRoleUpdate(roomName)`：

- 原 controller 收到更新后变为 viewer。
- 目标 viewer 收到更新后变为 controller。
- 其他 Web 用户和 robot-web-publisher 收到 participant role 更新后刷新 controller/viewer 展示。

## 未做事项

- 未新增禁言 viewer。
- 未新增静音 viewer。
- 未新增管理员后台。
- 未新增邀请码完整系统。
- 未处理机器人 key/token 写死服务器配置。
- 未接真实机器人运动控制。
- 未让 backend 转发音视频帧。
- 未新增数据库或账号系统。

## 验证命令

```text
backend npm run lint: passed
backend npm run test: passed
backend npm run build: passed
web-client npm run lint: passed
web-client npm run test: passed
web-client npm run build: passed
robot-web-publisher npm run lint: passed
robot-web-publisher npm run test: passed
robot-web-publisher npm run build: passed
```

说明：

- backend `npm run test` 首次在沙箱内因既有 `adminRoutes.test` 需要监听 `127.0.0.1` 报 `EPERM`。
- 已按同一命令在允许本地监听的环境中重跑，通过。
- web-client 和 robot-web-publisher build 均有 Vite chunk size warning，原因是 LiveKit SDK bundle 较大，不影响构建通过。

## 安全检查

- 未在 Web 或 robot-web-publisher 源码中加入 `LIVEKIT_API_SECRET`。
- 未提交或修改真实 `.env`。
- transfer API 不返回 token 或 secret。
- viewer 不能通过 transfer API 绕过后端成为 controller。
- robot 不能被转成 controller。
- robot_control 白名单仍为 `1002`、`1003`、`1000`。
- `1001` 仍被测试覆盖为拒绝命令。
- backend 仍不转发原始视频帧。

## 未验证项

- 未使用真实 LiveKit Cloud 房间实测 robot-web-publisher 同时观看 controller/viewer 视频。
- 未用两台真实外部设备实测控制权转交后的 UI 同步。
- 未用真实 Android robot app 参与本轮转交场景。

## 下一步建议

1. 启动 cloud backend 和 web-client。
2. 打开两个 Web 用户加入同一 room，一个 controller、一个 viewer。
3. 打开 robot-web-publisher，使用同一 roomName 加入并发布摄像头。
4. controller 和 viewer 分别开启摄像头。
5. 在 robot-web-publisher 确认 controller 区域和 viewer 区域能看到视频及用户名。
6. controller 点击“转交控制权”，选择在线 viewer。
7. 确认三个页面都收到最新 controller 状态。
