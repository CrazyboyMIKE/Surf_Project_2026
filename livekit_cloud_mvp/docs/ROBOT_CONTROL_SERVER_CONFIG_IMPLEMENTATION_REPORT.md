# Robot Control Server Config Implementation Report

## 本轮完成内容

本轮只在 `livekit_cloud_mvp/` 中补齐服务端机器人运动控制集成框架：

- 新增 backend 侧 `RobotControlAdapter` 接口。
- 新增 `MockRobotControlAdapter`，默认记录已通过校验的控制命令。
- 新增 `VendorRobotControlAdapter`，为真实厂商 HTTP 控制接口预留服务端适配层。
- 新增 `robotControlConfig`，从 backend 环境变量读取机器人厂商 API / token / MQTT 占位配置。
- WebSocket `robot_control` 消息现在会先通过后端权限和参数校验，再进入 `RobotControlAdapter`。
- Web 端继续只发送抽象命令，不输入、不显示、不保存任何机器人 key/token。
- `1000 stop` 在真实适配请求中标记为 `high` priority。

## 修改文件列表

- `backend/.env.example`
- `backend/.env.livekit-cloud.example`
- `backend/package.json`
- `backend/src/config.ts`
- `backend/src/control/commandValidation.ts`
- `backend/src/control/commandValidation.test.ts`
- `backend/src/index.ts`
- `backend/src/robotControl/config.ts`
- `backend/src/robotControl/adapter.ts`
- `backend/src/robotControl/adapter.test.ts`
- `backend/src/types.ts`
- `backend/src/ws/webSocketServer.ts`
- `web-client/src/types.ts`
- `web-client/src/useRoomSocket.ts`
- `docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`
- `docs/ROBOT_CONTROL_SERVER_CONFIG_GUIDE.md`
- `docs/ROBOT_CONTROL_SERVER_CONFIG_IMPLEMENTATION_REPORT.md`

## 新增环境变量

```env
ROBOT_CONTROL_MODE=mock
ROBOT_CONTROL_ENABLED=false
ROBOT_VENDOR_API_BASE_URL=https://example.robot-vendor-api.com
ROBOT_VENDOR_APP_KEY=YOUR_ROBOT_VENDOR_APP_KEY
ROBOT_VENDOR_APP_SECRET=YOUR_ROBOT_VENDOR_APP_SECRET
ROBOT_VENDOR_TOKEN=YOUR_ROBOT_VENDOR_TOKEN
ROBOT_SERIAL_NUMBER=YOUR_ROBOT_SERIAL_NUMBER
ROBOT_MQTT_HOST=YOUR_ROBOT_MQTT_HOST
ROBOT_MQTT_PORT=1883
ROBOT_MQTT_USERNAME=YOUR_ROBOT_MQTT_USERNAME
ROBOT_MQTT_PASSWORD=YOUR_ROBOT_MQTT_PASSWORD
ROBOT_MQTT_CLIENT_ID=YOUR_ROBOT_MQTT_CLIENT_ID
ROBOT_MQTT_POST_TOPIC=YOUR_ROBOT_POST_TOPIC
ROBOT_MQTT_RECEIVE_TOPIC=YOUR_ROBOT_RECEIVE_TOPIC
```

这些值在示例文件中全部是占位符。本轮没有修改真实 `.env`，没有提交真实凭证。

## RobotControlAdapter 设计

`RobotControlAdapter` 只接收后端已经校验过的命令：

- `roomName`
- `senderId`
- `robotId`
- `command`
- 已清洗的 `parameters`
- `timestamp`

backend 的校验顺序：

1. room 必须存在。
2. sender 必须在 room 中。
3. sender 必须是当前 controller。
4. robot 必须 online。
5. command 必须在白名单内。
6. 参数只能是明确允许字段。
7. 校验通过后才调用 adapter。

## mock 模式行为

默认：

```env
ROBOT_CONTROL_MODE=mock
ROBOT_CONTROL_ENABLED=false
```

mock 模式不会连接真实机器人，只记录：

- roomName
- senderId
- command
- sanitized parameters

日志不会包含 key、token、secret、MQTT password。

## real 模式行为

真实控制需要显式开启：

```env
ROBOT_CONTROL_MODE=real
ROBOT_CONTROL_ENABLED=true
```

当前 `VendorRobotControlAdapter` 预留 HTTP 控制方式，默认调用：

```text
POST {ROBOT_VENDOR_API_BASE_URL}/robots/{ROBOT_SERIAL_NUMBER}/commands
```

必填字段：

- `ROBOT_VENDOR_API_BASE_URL`
- `ROBOT_VENDOR_TOKEN`
- `ROBOT_SERIAL_NUMBER`

如果 real 模式开启但配置缺失，会返回：

```text
Robot real control is enabled but vendor config is incomplete
```

不同机器人厂商的真实 endpoint、认证 header、body 格式可能不同，接真实机器人前必须按厂商文档调整适配层。

MQTT 字段已预留，但当前没有实现 MQTT 发布；如果 receive topic 拿不到，不会伪造机器人状态。

## 控制命令白名单

仍然只允许：

- `1002`
- `1003`
- `1000`

`1001` 仍被拒绝，不能作为默认控制命令。

参数规则：

- `1002` 只接受 `distanceCm` 和可选 `speed`。
- `1003` 只接受 `angleDeg` 和可选 `speed`。
- `1000` 不接受运动参数。
- 不允许任意 JSON 透传到机器人。

## 1000 stop 处理

- `1000` 仍在白名单内。
- `1000` 不需要复杂参数。
- `1000` 在 real adapter 请求体里标记 `priority: "high"`。
- 真实机器人联调必须先测 `1000 stop`。

## 用户需要自己完成什么

- 向机器人厂商确认真实控制方式：HTTP API、MQTT、Android SDK 或局域网协议。
- 准备真实 app key / app secret / token。
- 准备机器人 serial number。
- 如果走 MQTT，确认 post topic / receive topic。
- 确认 `1002`、`1003`、`1000` 的真实参数格式。
- 在 backend `.env` 中填入真实凭证。
- 不要提交 `.env`。
- 把机器人放在安全空旷区域。
- 安排人员准备物理急停。
- 先测 `1000 stop`，再低速测 `1002` 和 `1003`。
- 记录每次机器人响应。

## 测试命令和结果

```text
backend npm run lint: passed
backend npm run test: passed
backend npm run build: passed
web-client npm run lint: passed
web-client npm run test: passed
web-client npm run build: passed
```

说明：

- backend `npm run test` 首次在沙箱内因既有 `adminRoutes.test` 监听 `127.0.0.1` 报 `EPERM`。
- 已用同一命令在允许本地监听的环境中重跑，通过。
- web-client build 仍有 LiveKit SDK bundle 的 Vite chunk size warning，不影响构建通过。

## 未验证项及原因

- 未调用真实机器人厂商 API：当前没有真实厂商 endpoint、token、serial number 和安全测试现场。
- 未验证 MQTT 控制：当前没有确认 MQTT post topic / receive topic，也没有接入 MQTT 客户端依赖。
- 未验证真实机器人动作：需要物理机器人、安全场地和现场急停。

## 安全检查结果

- 未修改真实 `.env`。
- 未提交真实机器人 key/token。
- 未提交真实 MQTT password。
- 未把机器人凭证放入 Web、robot-web-publisher 或 Android。
- 错误响应不返回 secret。
- mock 日志测试覆盖了 sanitized logging，不包含伪造 token 字段。
- `1001` 搜索结果只出现在拒绝测试或文档说明中。

## 真实机器人测试前安全提醒

1. 先确认 Web viewer 无法发送控制。
2. 先确认非当前 controller 无法发送控制。
3. 先确认 robot offline 时控制被拒绝。
4. 先在真实场地测试 `1000 stop`。
5. 再以最低速度测试 `1002` 小距离。
6. 再以最低速度测试 `1003` 小角度。
7. 现场必须有人能物理急停。
