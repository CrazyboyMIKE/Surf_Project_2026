# Keyboard 1001 Control Guide

本指南只适用于 `livekit_cloud_mvp/` 的 LiveKit Cloud 方案。

## 键盘方向键控制是什么

Web controller 可以手动打开“启用方向键控制”，然后使用方向键或 `W/A/S/D` 发送连续速度控制：

- 按住方向键：持续发送 keepalive。
- 松开方向键：立即发送 `1000 stop`。
- 空格：立即急停。
- 页面失焦、WebSocket 断开、controller 释放或转移：backend 自动发送 `1000 stop`。

## 为什么使用 1001

PadBot Python PC 控制器的方向键控制使用 `1001` 连续速度命令：

```text
1001 -> {"lv": linearVelocity, "av": angularVelocity}
```

`1001` 适合“按住移动、松手停止”的交互。它不同于：

- `1002`：指定距离移动，更像步进命令。
- `1003`：指定角度旋转，更像步进命令。
- `1000`：停止。

## 为什么默认关闭

`1001` 是连续速度控制，风险高于 `1002/1003`。如果前端断线、页面失焦、用户忘记松手或网络抖动，机器人可能继续移动。因此本项目要求两个 backend 开关都显式开启：

```env
ROBOT_ENABLE_KEYBOARD_CONTROL=true
ROBOT_ENABLE_CONTINUOUS_1001=true
```

默认配置仍然是关闭：

```env
ROBOT_ENABLE_KEYBOARD_CONTROL=false
ROBOT_ENABLE_CONTINUOUS_1001=false
```

## 环境变量

```env
ROBOT_ENABLE_KEYBOARD_CONTROL=false
ROBOT_ENABLE_CONTINUOUS_1001=false
ROBOT_KEYBOARD_CONTROL_MODE=1001
ROBOT_KEYBOARD_SEND_INTERVAL_MS=300
ROBOT_KEYBOARD_DEADMAN_TIMEOUT_MS=900
ROBOT_KEYBOARD_MAX_SESSION_MS=0
ROBOT_KEYBOARD_MAX_LINEAR_SPEED=400
ROBOT_KEYBOARD_MAX_ANGULAR_SPEED=30
ROBOT_KEYBOARD_DEFAULT_LINEAR_SPEED=200
ROBOT_KEYBOARD_DEFAULT_ANGULAR_SPEED=15
ROBOT_KEYBOARD_REQUIRE_FOCUS=true
```

含义：

- `ROBOT_KEYBOARD_SEND_INTERVAL_MS`：按住方向键时前端 keepalive 重发间隔。
- `ROBOT_KEYBOARD_DEADMAN_TIMEOUT_MS`：backend 超过该时间没有收到 keepalive，自动 stop。
- `ROBOT_KEYBOARD_MAX_SESSION_MS`：单次连续控制最长时间；`0` 表示不设置单次最长时间，只依赖 deadman、松手、失焦、断线等 stop 保护。
- `ROBOT_KEYBOARD_MAX_LINEAR_SPEED`：backend 允许的最大线速度。
- `ROBOT_KEYBOARD_MAX_ANGULAR_SPEED`：backend 允许的最大角速度。
- `ROBOT_KEYBOARD_DEFAULT_LINEAR_SPEED`：前端默认低速线速度。
- `ROBOT_KEYBOARD_DEFAULT_ANGULAR_SPEED`：前端默认低速角速度。
- `ROBOT_KEYBOARD_REQUIRE_FOCUS`：页面失焦自动 stop。

## 方向映射

```text
ArrowUp / W            -> forward        -> { lv: +linearSpeed, av: 0 }
ArrowDown / S          -> backward       -> { lv: -linearSpeed, av: 0 }
ArrowLeft / A          -> left           -> { lv: 0, av: +angularSpeed }
ArrowRight / D         -> right          -> { lv: 0, av: -angularSpeed }
ArrowUp + ArrowLeft    -> forward_left   -> { lv: +linearSpeed, av: +angularSpeed }
ArrowUp + ArrowRight   -> forward_right  -> { lv: +linearSpeed, av: -angularSpeed }
ArrowDown + ArrowLeft  -> backward_left  -> { lv: -linearSpeed, av: +angularSpeed }
ArrowDown + ArrowRight -> backward_right -> { lv: -linearSpeed, av: -angularSpeed }
Space                  -> stop           -> 1000
```

聊天输入框、文本框、下拉框或可编辑区域聚焦时，前端不会拦截 `W/A/S/D`，避免用户打字时触发机器人运动。

## 已移除的头部控制

Web UI 不再提供“抬头”“低头”“头部停止”“头部复位”。普通 `robot_control` 白名单只保留 `1000/1002/1003`，因此 `1004/1005/1006` 默认按不允许命令拒绝。

## 前端如何使用

1. Web 用户以 controller 身份进入房间。
2. robot-web-publisher 或真实机器人端进入同一房间，让 robot online。
3. 在 Robot Control 区域打开“启用方向键控制”。
4. 使用低速默认值。
5. 按住方向键短测。
6. 松开方向键确认机器人停止。
7. 空格键可随时 stop。

viewer 不可用，非当前 controller 不可用。

## 安全保护

- 松手 stop。
- 空格 stop。
- 页面失焦 stop。
- 前端定时 keepalive。
- backend deadman timeout stop。
- 可选 backend max session timeout stop；默认 `ROBOT_KEYBOARD_MAX_SESSION_MS=0`，不开启单次时长上限。
- WebSocket 断开 stop。
- controller release stop。
- controller transfer stop。
- robot offline stop。
- controller 断开、释放、转移时，backend 使用 `1000 stop` 做底盘安全停止。
- 后端校验速度上限。
- 后端只允许固定 direction，不接受任意 `lv/av` JSON 透传。
- 普通 `robot_control` 仍然拒绝 `1001`。
- 普通 `robot_control` 只允许 `1000/1002/1003`，默认拒绝 `1004/1005/1006/1007/1008/1009`。

## 用户需要自己完成的事项

- 机器人放在安全空旷区域。
- 旁边有人准备物理急停。
- 先测试 `1000 stop`。
- 再低速测试 `ArrowUp` 1 秒。
- 确认松手自动停。
- 再测试左右和组合方向。
- 不要第一次就高速度。
- 记录机器人响应。
- 如果 `1001` 不稳定，应回退使用 `1002/1003` 步进控制。

## 排查

- Web UI 显示 backend disabled：检查 backend `.env` 两个开关是否都为 `true`，并用 `pm2 restart ... --update-env` 重启。
- viewer 按键无效：这是预期，viewer 不能控制。
- 按键后 UI active 但机器人不动：检查 PadBot MQTT topic、serial number、机器人是否在线。
- 松手不停：立刻按空格或物理急停，并检查 backend 日志是否收到 `keyboard_control_stop` 或 deadman stop。

## 是否建议默认启用

不建议默认启用。

`1001` 是连续速度控制，必须在真实机器人、安全场地、低速和现场急停条件都具备时才开启。
