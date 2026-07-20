# Robot Control Server Config Guide

本指南只适用于 `livekit_cloud_mvp/` 的 LiveKit Cloud 方案。

## 本轮做了什么

- Web 前端仍然只发送抽象控制命令：`1002`、`1003`、`1000`。
- backend 继续先做房间、participant、controller、robot online、命令白名单和参数校验。
- 校验通过后，backend 统一调用 `RobotControlAdapter`。
- 默认 `mock` 模式只记录已通过校验的控制命令，不连接真实机器人。
- `real` 模式读取 backend 环境变量，按 PadBot Python SDK 的流程申请 MQTT 信息并发布控制命令。
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

PadBot 真实控制配置示例。这里的 `ROBOT_VENDOR_TOKEN` 对应你 JSON 里的 `apptoken`：

```env
ROBOT_CONTROL_MODE=real
ROBOT_CONTROL_ENABLED=true
ROBOT_VENDOR_API_BASE_URL=http://s.padbot.cn:9080
ROBOT_VENDOR_APP_KEY=YOUR_ROBOT_VENDOR_APP_KEY
ROBOT_VENDOR_APP_SECRET=
ROBOT_VENDOR_TOKEN=YOUR_ROBOT_VENDOR_APP_TOKEN
ROBOT_VENDOR_LANGUAGE=zh-CN
ROBOT_SERIAL_NUMBER=YOUR_ROBOT_SERIAL_NUMBER
ROBOT_LINEAR_SPEED=200
ROBOT_ANGULAR_SPEED=25
ROBOT_SEND_INTERVAL_MS=300
```

MQTT 字段支持两种方式。

通常情况下，你的 JSON 里 `robotPostTopic` 是空的，此时这些 MQTT 字段保持空即可，backend 会先调用厂商接口动态获取 MQTT host、clientId、username、token 和 topic：

```env
ROBOT_MQTT_HOST=
ROBOT_MQTT_PORT=1883
ROBOT_MQTT_USERNAME=
ROBOT_MQTT_PASSWORD=
ROBOT_MQTT_CLIENT_ID=
ROBOT_MQTT_POST_TOPIC=
ROBOT_MQTT_RECEIVE_TOPIC=
ROBOT_MQTT_KEEPALIVE_SECONDS=60
```

如果厂商以后直接给了静态 MQTT 信息，也可以在服务器 `.env` 中填写 `ROBOT_MQTT_HOST`、`ROBOT_MQTT_USERNAME`、`ROBOT_MQTT_PASSWORD`、`ROBOT_MQTT_CLIENT_ID`、`ROBOT_MQTT_POST_TOPIC` 来跳过动态申请。

当前 `VendorRobotControlAdapter` 已按 `pc_keyboard_controller/keyboard_robot_controller.py` 的逻辑实现：

```text
POST {ROBOT_VENDOR_API_BASE_URL}/cloud/openapirobot/applyRobotMqttInfo.action
```

backend 会用 `appkey` 和 `apptoken` 做 MD5 签名，拿到 MQTT 信息后发布：

```text
1002 -> {"t":"83","m":"{\"a\":\"1002\",\"m\":{\"d\":distanceCm,\"lv\":linearSpeed}}"}
1003 -> {"t":"83","m":"{\"a\":\"1003\",\"m\":{\"a\":angleDeg,\"av\":angularSpeed}}"}
1000 -> {"t":"83","m":"{\"a\":\"1000\"}"}
```

backend 不使用 `1001` 作为 Web 默认控制命令。如果 receive topic 拿不到，不会伪造机器人状态。

## 用户需要自己完成的事项

- 向机器人厂商确认真实控制接口方式：HTTP API、MQTT、Android SDK 还是局域网协议。
- 准备真实机器人 appkey / apptoken。
- 准备机器人 serial number。
- 如果厂商不返回 post topic，确认 `robotPostTopic` 或 `ROBOT_MQTT_POST_TOPIC`。
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
   ROBOT_VENDOR_API_BASE_URL=http://s.padbot.cn:9080
   ROBOT_VENDOR_APP_KEY=...
   ROBOT_VENDOR_TOKEN=...
   ROBOT_SERIAL_NUMBER=...
   ```

2. 重启 backend，让 `.env` 生效。
3. 确认 backend 日志显示 `Robot control mode: real` 和 `Robot real control: enabled`。
4. 先让 controller 发送 `1000 stop`。
5. 再低速测试 `1002` 和 `1003`。
6. 如果配置缺失，backend 会返回：

   ```text
   Robot real control is enabled but vendor config is incomplete
   ```

7. 如果厂商接口失败，backend 会返回泛化错误，不会返回 secret。常见错误：

   - `Robot MQTT info request failed with HTTP 404`：`ROBOT_VENDOR_API_BASE_URL` 不应包含额外路径，应类似 `http://s.padbot.cn:9080`。
   - `Robot MQTT info request was rejected by vendor`：通常是 `appkey`、`apptoken`、`serialNumber` 或签名权限问题。
   - `Robot MQTT post topic was not returned by vendor`：厂商没有返回 topic，需要手动补 `ROBOT_MQTT_POST_TOPIC` 或联系厂商确认。

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
