# Robot Control Server Config Guide

本指南只适用于 `livekit_cloud_mvp/` 的 LiveKit Cloud 方案。

## 本轮做了什么

- Web 前端仍然只发送抽象控制命令：`1002`、`1003`、`1000`。
- backend 继续先做房间、participant、controller、robot online、命令白名单和参数校验。
- 校验通过后，backend 统一调用 `RobotControlAdapter`。
- 默认 `mock` 模式只记录已通过校验的控制命令，不连接真实机器人。
- `real` 模式读取 backend 环境变量，调用服务端真实机器人厂商适配层。
- backend 不转发 LiveKit 音视频帧。

## 为什么不能把 key/token 写进前端

Web 前端代码会被浏览器下载，用户可以直接查看 bundle。Android APK 也可能被反编译。因此机器人厂商 key、app secret、token、MQTT password 等凭证只能放在 backend 的运行环境变量或服务器本地配置里。

禁止：

- 把真实 `ROBOT_VENDOR_APP_SECRET` 放进 Web。
- 把真实 `ROBOT_VENDOR_TOKEN` 放进 robot-web-publisher。
- 把真实 MQTT password 放进 Android。
- 把真实 `.env` 提交到 Git。
- 在日志里打印 key、token、secret、password。

## 环境变量

默认安全配置：

```env
ROBOT_CONTROL_MODE=mock
ROBOT_CONTROL_ENABLED=false
```

真实控制配置示例：

```env
ROBOT_CONTROL_MODE=real
ROBOT_CONTROL_ENABLED=true
ROBOT_VENDOR_API_BASE_URL=https://example.robot-vendor-api.com
ROBOT_VENDOR_APP_KEY=YOUR_ROBOT_VENDOR_APP_KEY
ROBOT_VENDOR_APP_SECRET=YOUR_ROBOT_VENDOR_APP_SECRET
ROBOT_VENDOR_TOKEN=YOUR_ROBOT_VENDOR_TOKEN
ROBOT_SERIAL_NUMBER=YOUR_ROBOT_SERIAL_NUMBER
```

MQTT 字段已预留：

```env
ROBOT_MQTT_HOST=YOUR_ROBOT_MQTT_HOST
ROBOT_MQTT_PORT=1883
ROBOT_MQTT_USERNAME=YOUR_ROBOT_MQTT_USERNAME
ROBOT_MQTT_PASSWORD=YOUR_ROBOT_MQTT_PASSWORD
ROBOT_MQTT_CLIENT_ID=YOUR_ROBOT_MQTT_CLIENT_ID
ROBOT_MQTT_POST_TOPIC=YOUR_ROBOT_POST_TOPIC
ROBOT_MQTT_RECEIVE_TOPIC=YOUR_ROBOT_RECEIVE_TOPIC
```

当前代码中的 `VendorRobotControlAdapter` 使用 HTTP 适配层，默认尝试调用：

```text
POST {ROBOT_VENDOR_API_BASE_URL}/robots/{ROBOT_SERIAL_NUMBER}/commands
```

请求只包含已校验和清洗后的命令参数。不同厂商的真实路径、认证头、body 格式可能不同，需要按厂商文档调整 `VendorRobotControlAdapter`。MQTT 字段目前是配置预留；如果 receive topic 拿不到，不要伪造机器人状态。

## 用户需要自己完成的事项

- 向机器人厂商确认真实控制接口方式：HTTP API、MQTT、Android SDK 还是局域网协议。
- 准备真实机器人 app key / app secret / token。
- 准备机器人 serial number。
- 如果走 MQTT，确认 post topic / receive topic。
- 确认 `1002`、`1003`、`1000` 的真实参数格式。
- 在 backend `.env` 中填入真实凭证。
- 不要把 `.env` 提交到 Git。
- 把机器人放在安全空旷区域。
- 旁边安排人员准备物理急停。
- 先测试 `1000 stop`。
- 再低速测试 `1002` 前进小距离。
- 再低速测试 `1003` 小角度旋转。
- 记录每次机器人响应。
- 如果 receive topic 缺失，需要联系厂商或继续抓包/查文档确认状态订阅方式。

## mock 模式怎么测

1. backend `.env` 保持：

   ```env
   ROBOT_CONTROL_MODE=mock
   ROBOT_CONTROL_ENABLED=false
   ```

2. 启动 backend。
3. Web controller 加入房间。
4. robot-web-publisher 或 Android robot 加入同一房间，让 robot online。
5. controller 点击 `1002`、`1003`、`1000`。
6. backend 日志应出现类似：

   ```text
   [robot-control:mock] room=... from=... command=1000 parameters={}
   ```

日志只应包含 room、sender、command 和清洗后的参数，不应包含 secret。

## real 模式怎么测

1. 在 backend `.env` 中配置：

   ```env
   ROBOT_CONTROL_MODE=real
   ROBOT_CONTROL_ENABLED=true
   ROBOT_VENDOR_API_BASE_URL=...
   ROBOT_VENDOR_TOKEN=...
   ROBOT_SERIAL_NUMBER=...
   ```

2. 根据厂商文档确认 `VendorRobotControlAdapter` 的 endpoint、header、body 是否匹配。
3. 启动 backend。
4. 先让 controller 发送 `1000 stop`。
5. 再低速测试 `1002` 和 `1003`。
6. 如果配置缺失，backend 会返回：

   ```text
   Robot real control is enabled but vendor config is incomplete
   ```

7. 如果厂商接口失败，backend 会返回泛化错误，不会返回 secret。

## 控制命令白名单

只允许：

- `1002`：移动指定距离，可带 `distanceCm` 和可选 `speed`。
- `1003`：旋转指定角度，可带 `angleDeg` 和可选 `speed`。
- `1000`：stop，不允许携带运动参数。

不允许：

- `1001`
- 任意字符串命令
- 任意 JSON 透传

## 安全测试清单

- viewer 不能控制。
- 非当前 controller 不能控制。
- robot 离线不能控制。
- `1001` 被拒绝。
- `1000 stop` 可用。
- 错误凭证不泄露 secret。
- 日志不打印 secret。
- Web 不显示机器人 key/token。
- Android 不保存机器人 key/token。
- 真实机器人测试现场必须有人准备物理急停。
