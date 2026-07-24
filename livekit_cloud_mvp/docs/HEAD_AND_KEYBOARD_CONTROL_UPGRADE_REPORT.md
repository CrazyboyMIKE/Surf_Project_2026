# Head And Keyboard Control Upgrade Report

本报告记录本轮只在 `livekit_cloud_mvp/` 中完成的机器人头部控制与键盘连续控制升级。

## 本轮完成内容

- Web controller 控制区新增头部控制按钮：
  - `1005` 抬头。
  - `1005` 低头。
  - `1004` 头部停止。
  - `1006` 头部复位。
- 普通 `robot_control` 白名单扩展为：
  - `1000`
  - `1002`
  - `1003`
  - `1004`
  - `1005`
  - `1006`
- `1001` 仍然只允许通过键盘连续控制专用 WebSocket 消息进入后端，不允许普通 `robot_control` 任意发送。
- 键盘控制支持：
  - `ArrowUp` / `W`
  - `ArrowDown` / `S`
  - `ArrowLeft` / `A`
  - `ArrowRight` / `D`
  - `Space` 急停
- 聊天输入框、textarea、select、contenteditable 聚焦时不会触发键盘运动控制。
- controller WebSocket 断开、释放控制权、转移控制权或离开房间时，backend 会保留原有 `1000 stop` 逻辑，并尽力发送 `1004 head stop`。

## 新增环境变量

```env
ROBOT_ENABLE_HEAD_CONTROL=false
```

说明：

- mock 模式下头部命令只记录，不会驱动真实机器人。
- real 模式下必须显式设置 `ROBOT_ENABLE_HEAD_CONTROL=true`，backend 才会把 `1004/1005/1006` 发给 PadBot MQTT 适配层。
- 不需要、也不允许在 Web 或 Android 中配置机器人 key/token。

## 1001 按住运动 / 松手停止

键盘控制仍然走专用 WebSocket 消息：

- `keyboard_control_start`
- `keyboard_control_keepalive`
- `keyboard_control_stop`

后端将方向转换为 `1001` 的 `lv/av`：

```text
forward  -> { lv: +linearSpeed, av: 0 }
backward -> { lv: -linearSpeed, av: 0 }
left     -> { lv: 0, av: +angularSpeed }
right    -> { lv: 0, av: -angularSpeed }
```

安全策略：

- 默认关闭。
- 必须同时开启 `ROBOT_ENABLE_KEYBOARD_CONTROL=true` 和 `ROBOT_ENABLE_CONTINUOUS_1001=true`。
- viewer 和非当前 controller 会被后端拒绝。
- 后端校验 direction、线速度、角速度和机器人在线状态。
- 松手、空格、失焦、deadman timeout、断线、释放/转移控制权都会触发 `1000 stop`；单次最大时长保护已改为可选，默认 `ROBOT_KEYBOARD_MAX_SESSION_MS=0` 表示不启用。

## 1004 / 1005 / 1006 头部控制

后端参数校验：

- `1004`：不接受运动参数。
- `1005`：只接受 `d/a/av`。
- `1005.d`：只允许 `1` 或 `2`。
- `1005.a`：按厂商协议示例使用非负绝对角度，限制在 `0` 到 `180` deg。
- `1005.av`：必须大于 `0` 且不超过 `120` deg/s。
- `1006`：只接受 `d`。
- `1006.d`：允许 `0/1/2`，缺省按 `0` 处理。

PadBot MQTT payload：

```text
1004 -> {"a":"1004"}
1005 -> {"a":"1005","m":{"d":1,"a":90,"av":60}}
1006 -> {"a":"1006","m":{"d":1}}
```

## Viewer 为什么不能控制

底盘和头部控制都先经过 backend 权限校验：

- room 必须存在。
- sender 必须在 room 中。
- sender 必须是当前 controller。
- robot 必须在线。
- command 必须在白名单内。
- 参数必须通过白名单字段和范围校验。

viewer 即使绕过前端按钮直接发 WebSocket，也会被 backend 拒绝。

## 抬头 / 低头方向符号

当前 Web UI 常量：

```text
HEAD_TILT_UP_ANGLE_DEG = 15
HEAD_TILT_DOWN_ANGLE_DEG = -15
```

真实机器人上如果发现方向相反，只需要调整这两个常量的正负号，并再次低速小角度测试。

## 真实机器人测试前必须做

1. 确认机器人在空旷区域。
2. 旁边有人准备物理急停。
3. 先测试 `1000 stop`。
4. 再测试 `1004 head stop`。
5. 低速短按测试底盘方向。
6. 小角度测试抬头/低头。
7. 如果方向相反，先改符号，不要继续高速度测试。
8. 全程不要把真实 key/token 写入代码或前端。

## 未做内容

- 未实现 `1007/1008/1009` 手臂控制。
- 未新增数据库、账号系统、自建 WebRTC/SFU。
- 未让 backend 转发音视频帧。
- 未修改真实 `.env`。

## 未验证项

- 真实机器人头部抬头/低头方向需要现场校准。
- 真实机器人头部控制是否需要额外厂商状态 topic，需要现场日志确认。
- 本报告不声称真实机器人动作已通过，必须以现场测试为准。
