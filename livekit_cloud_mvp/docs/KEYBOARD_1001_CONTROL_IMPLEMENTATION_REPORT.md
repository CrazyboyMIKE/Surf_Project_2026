# Keyboard 1001 Control Implementation Report

## 本轮完成内容

本轮只在 `livekit_cloud_mvp/` 中增加 Web 键盘方向键控制和可选 `1001` 连续速度控制：

- backend 新增键盘控制配置读取。
- backend 新增 `KeyboardControlManager`，管理连续控制会话和自动 stop。
- WebSocket 新增 `keyboard_control_start`、`keyboard_control_keepalive`、`keyboard_control_stop`。
- Web controller 页面新增“启用方向键控制”模块。
- robot-web-publisher 增加只读键盘控制状态显示。
- PadBot MQTT adapter 支持内部专用 `1001` payload。
- 普通 `robot_control` 仍然只允许 `1002/1003/1000`，继续拒绝 `1001`。

## 修改文件列表

- `backend/.env.example`
- `backend/.env.livekit-cloud.example`
- `backend/package.json`
- `backend/src/config.ts`
- `backend/src/index.ts`
- `backend/src/types.ts`
- `backend/src/http/routes.ts`
- `backend/src/http/adminRoutes.ts`
- `backend/src/http/adminRoutes.test.ts`
- `backend/src/state/roomStore.ts`
- `backend/src/ws/webSocketServer.ts`
- `backend/src/keyboardControl/config.ts`
- `backend/src/keyboardControl/keyboardControlManager.ts`
- `backend/src/keyboardControl/keyboardControlManager.test.ts`
- `backend/src/robotControl/adapter.ts`
- `backend/src/robotControl/adapter.test.ts`
- `backend/src/robotControl/padBotMqtt.ts`
- `web-client/src/App.tsx`
- `web-client/src/useRoomSocket.ts`
- `web-client/src/types.ts`
- `web-client/src/components/ControlPanel.tsx`
- `web-client/src/components/KeyboardControlPanel.tsx`
- `web-client/src/styles.css`
- `robot-web-publisher/src/main.tsx`
- `robot-web-publisher/src/styles.css`
- `docs/KEYBOARD_1001_CONTROL_GUIDE.md`
- `docs/KEYBOARD_1001_CONTROL_IMPLEMENTATION_REPORT.md`
- `docs/LIVEKIT_CLOUD_ACCEPTANCE_TEST.md`

## 新增环境变量

```env
ROBOT_ENABLE_KEYBOARD_CONTROL=false
ROBOT_ENABLE_CONTINUOUS_1001=false
ROBOT_KEYBOARD_CONTROL_MODE=1001
ROBOT_KEYBOARD_SEND_INTERVAL_MS=300
ROBOT_KEYBOARD_DEADMAN_TIMEOUT_MS=900
ROBOT_KEYBOARD_MAX_SESSION_MS=10000
ROBOT_KEYBOARD_MAX_LINEAR_SPEED=120
ROBOT_KEYBOARD_MAX_ANGULAR_SPEED=20
ROBOT_KEYBOARD_DEFAULT_LINEAR_SPEED=80
ROBOT_KEYBOARD_DEFAULT_ANGULAR_SPEED=15
ROBOT_KEYBOARD_REQUIRE_FOCUS=true
```

默认不启用键盘控制，也不启用 `1001`。

## 键盘方向键映射

```text
forward        -> { lv: +linearSpeed, av: 0 }
backward       -> { lv: -linearSpeed, av: 0 }
left           -> { lv: 0, av: +angularSpeed }
right          -> { lv: 0, av: -angularSpeed }
forward_left   -> { lv: +linearSpeed, av: +angularSpeed }
forward_right  -> { lv: +linearSpeed, av: -angularSpeed }
backward_left  -> { lv: -linearSpeed, av: +angularSpeed }
backward_right -> { lv: -linearSpeed, av: -angularSpeed }
```

## 1001 安全策略

- `1001` 只能通过 keyboard-control WebSocket 消息进入。
- 普通 `robot_control` 仍然拒绝 `1001`。
- 后端只接受固定 direction。
- 前端不允许输入机器人 key/token。
- 后端不接受任意 JSON 透传到机器人。
- 后端再次校验速度上限。
- viewer 和非当前 controller 都不能使用。

## 自动 stop 触发条件

- `keyboard_control_stop`
- 松开所有方向键
- 空格 stop
- 页面失焦
- 页面卸载尽力 stop
- WebSocket 断开
- deadman timeout
- max session timeout
- controller release
- controller transfer
- robot offline
- 非法 keepalive 状态

## 前端 UI 使用方式

1. controller 进入房间。
2. robot online。
3. 打开“启用方向键控制”。
4. 使用默认低速。
5. 按住方向键移动。
6. 松开方向键自动 stop。
7. 空格或红色 Stop 按钮可立即 stop。

## 后端权限校验

backend 校验：

- room 存在。
- sender 在 room 中。
- sender 是当前 controller。
- robot online。
- direction 合法。
- `linearSpeed` 和 `angularSpeed` 为正数且不超过上限。
- backend 两个键盘控制开关都开启。

## 测试命令和结果

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

- backend `npm run test` 首次在沙箱内因既有 `adminRoutes.test` 监听 `127.0.0.1` 报 `EPERM`。
- 已用同一命令在允许本地监听的环境中重跑，通过。
- web-client 和 robot-web-publisher build 仍有 LiveKit SDK bundle size warning，不影响构建通过。

## 未验证项及原因

- 未真实移动机器人：需要真实机器人、安全场地和现场物理急停。
- 未实测 Web 键盘控制真实 MQTT：需要云端 `.env` 打开两个键盘控制开关，并确认 PadBot MQTT 控制链路可用。
- 未验证真实弱网/断网：需要真实网络环境。

## 真实机器人测试前用户必须做什么

- 把机器人放在空旷区域。
- 旁边安排人员准备物理急停。
- 先用普通控制按钮测试 `1000 stop`。
- 开启键盘控制后只用默认低速。
- 先按 `ArrowUp` 1 秒。
- 松手确认自动停。
- 再测左右和组合方向。
- 发现不稳定时立即关闭键盘控制，回退到 `1002/1003`。

## 是否建议默认启用

不建议默认启用。

`1001` 连续速度控制风险高，必须由 backend 环境变量显式开启，并在真实安全测试条件满足后使用。
