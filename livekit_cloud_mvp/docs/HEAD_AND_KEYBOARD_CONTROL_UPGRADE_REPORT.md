# Head Control Removal And Keyboard Control Status

本文件记录 `livekit_cloud_mvp/` 中头部控制清理后的当前状态。

## 当前结论

- Web UI 已移除头部控制区，不再显示“抬头”“低头”“头部停止”“头部复位”。
- 前端普通 `robot_control` 不再发送 `1004/1005/1006`。
- 后端普通 `robot_control` 白名单只允许：
  - `1000`
  - `1002`
  - `1003`
- `1004/1005/1006` 已从普通白名单移除，默认返回 `COMMAND_NOT_ALLOWED`。
- `1007/1008/1009` 仍未实现，继续返回 `COMMAND_NOT_ALLOWED`。
- `1001` 仍然只允许通过 keyboard control 专用 WebSocket 流程进入后端，不允许普通 `robot_control` 任意发送。

## 保留的控制能力

底盘步进控制：

```text
1000 -> stop
1002 -> move distance
1003 -> rotate angle
```

键盘连续控制仍然走专用 WebSocket 消息：

- `keyboard_control_start`
- `keyboard_control_keepalive`
- `keyboard_control_stop`

后端将方向转换为 `1001` 的 `lv/av`，并保留松手、空格、页面失焦、deadman timeout、WebSocket 断开、controller release/transfer 的 `1000 stop` 保护。

## 安全策略

- viewer 和非当前 controller 会被后端拒绝。
- 普通 `robot_control` 仍会检查 room、sender、current controller、robot online、命令白名单和参数白名单。
- controller 断开、释放、转移控制权时，backend 使用 `1000 stop` 做底盘安全停止。
- 不再提供 `ROBOT_ENABLE_HEAD_CONTROL`，也不再把 `1004/1005/1006` 发给 PadBot MQTT 适配层。

## 真实机器人测试前必须做

1. 确认机器人在空旷区域。
2. 旁边有人准备物理急停。
3. 先测试 `1000 stop`。
4. 再低速短按测试 `1002/1003`。
5. 若启用 keyboard control，再低速测试方向键，并确认松手、空格、失焦、断线都会触发 `1000 stop`。
6. 全程不要把真实 key/token 写入代码或前端。

## 未做内容

- 未实现 `1007/1008/1009` 手臂控制。
- 未新增数据库、账号系统、自建 WebRTC/SFU。
- 未让 backend 转发音视频帧。
- 未修改真实 `.env`。
