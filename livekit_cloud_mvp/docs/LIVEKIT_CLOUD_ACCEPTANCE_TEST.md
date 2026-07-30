# LiveKit Cloud Acceptance Test

Use this checklist for real LiveKit Cloud validation.

Do not mark tests as passed unless they were run against a real LiveKit Cloud project.

## Checklist

1. [ ] LiveKit Cloud project is created.
2. [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured on backend only.
3. [ ] Web, robot-web-publisher, and Android do not contain LiveKit API secret.
4. [ ] `GET https://api.example.com/health` returns `{ "ok": true }`.
5. [ ] Backend can generate LiveKit Cloud token.
6. [ ] Web client joins a room.
7. [ ] robot-web-publisher joins the same room as robot.
8. [ ] robot-web-publisher publishes computer camera.
9. [ ] Two Web users see the same robot video.
10. [ ] Chat works between Web users.
11. [ ] Viewer can manually turn microphone on/off after browser permission is granted.
12. [ ] Viewer can manually turn camera on/off after browser permission is granted.
13. [ ] Web user can request controller ownership.
14. [ ] Viewer robot-control attempt is rejected.
15. [ ] `1000 stop` test passes.
16. [ ] `1002` test passes if real robot movement is connected in a later round; otherwise confirm mock log/display only.
17. [ ] `1003` test passes if real robot movement is connected in a later round; otherwise confirm mock log/display only.
18. [ ] Android true device joins the room.
19. [ ] Android true device publishes camera.
20. [ ] Phone 4G/5G can watch Web robot video.
21. [ ] LiveKit Cloud dashboard usage is checked.
22. [ ] With `ADMIN_ENABLED=false`, admin API is unavailable.
23. [ ] With admin enabled, missing/wrong admin token returns 401/403.
24. [ ] With correct admin token, `/admin` shows room list and room details.
25. [ ] Admin can release current controller.
26. [ ] Admin can cleanup offline participants without affecting online users.
27. [ ] Admin can query `/api/admin/room-records?days=30`.
28. [ ] Admin can view a room record detail with participants and sanitized events.
29. [ ] Admin page and admin API do not display LiveKit token, API secret, or admin token.
30. [ ] Admin page does not provide robot movement command buttons.
31. [ ] Admin can kick an online viewer; the viewer is disconnected and history shows `participant_kicked`.
32. [ ] Admin can kick the current controller; control is released and safety stop is triggered.
33. [ ] Admin can close an open room; all online participants disconnect and history shows `room_closed` with `admin_closed`.
34. [ ] Last participant leaving automatically closes the room with `empty_room`.
35. [ ] Restart backend and confirm 30-day room records remain available from SQLite.
36. [ ] `ROBOT_CONTROL_MODE=mock` 下 controller 发送 `1002` 成功记录。
37. [ ] `ROBOT_CONTROL_MODE=mock` 下 controller 发送 `1003` 成功记录。
38. [ ] `ROBOT_CONTROL_MODE=mock` 下 controller 发送 `1000 stop` 成功记录。
39. [ ] Viewer 发送 robot_control 被 backend 拒绝。
40. [ ] 非当前 controller 发送 robot_control 被 backend 拒绝。
41. [ ] Robot offline 时控制被 backend 拒绝。
42. [ ] `1001` 被 backend 拒绝。
43. [ ] `ROBOT_CONTROL_MODE=real` 且配置缺失时返回清楚错误。
44. [ ] PadBot real 模式使用 `ROBOT_VENDOR_API_BASE_URL + /cloud/openapirobot/applyRobotMqttInfo.action` 申请 MQTT 信息。
45. [ ] `ROBOT_VENDOR_TOKEN` 使用 PadBot JSON 中的 `apptoken`，`ROBOT_VENDOR_APP_SECRET` 可留空。
46. [ ] 厂商未返回 post topic 时，backend 返回清楚错误，不伪造 topic。
47. [ ] real 模式错误响应不泄露 key、token、secret 或 MQTT password。
48. [ ] 用户填入真实凭证后，需要人工现场验证真实机器人动作。
49. [ ] 真实机器人现场先测 `1000 stop`，再低速测 `1002` 和 `1003`。
50. [ ] 键盘方向键控制默认关闭。
51. [ ] 开启 `ROBOT_ENABLE_KEYBOARD_CONTROL=true` 和 `ROBOT_ENABLE_CONTINUOUS_1001=true` 后 controller 可用键盘控制。
52. [ ] viewer 不可用键盘控制。
53. [ ] 非当前 controller 不可用键盘控制。
54. [ ] `ArrowUp` / `W` 映射为 `forward`。
55. [ ] `ArrowDown` / `S` 映射为 `backward`。
56. [ ] `ArrowLeft` / `A` 映射为 `left`。
57. [ ] `ArrowRight` / `D` 映射为 `right`。
58. [ ] 组合方向映射正确：`forward_left`、`forward_right`、`backward_left`、`backward_right`。
59. [ ] Space 触发 `1000 stop`。
60. [ ] 松手触发 `1000 stop`。
61. [ ] 页面失焦触发 `1000 stop`。
62. [ ] deadman timeout 触发 `1000 stop`。
63. [ ] max session timeout 触发 `1000 stop`。
64. [ ] WebSocket 断线触发 `1000 stop`。
65. [ ] controller release 触发 `1000 stop`。
66. [ ] controller transfer 触发 `1000 stop`。
67. [ ] 超过最大线速度被拒绝。
68. [ ] 超过最大角速度被拒绝。
69. [ ] 普通 `robot_control` 发送 `1001` 被拒绝。
70. [ ] `1002/1003/1000` 原有控制不受影响。
71. [ ] 聊天输入框、textarea、select 聚焦时按 `W/A/S/D` 不触发机器人运动。
72. [ ] 普通 `robot_control` 发送 `1004` 被拒绝。
73. [ ] 普通 `robot_control` 发送 `1005` 被拒绝。
74. [ ] 普通 `robot_control` 发送 `1006` 被拒绝。
75. [ ] `1007/1008/1009` 默认被拒绝。
76. [ ] controller 断开、释放或转移控制权时，backend 使用 `1000 stop` 做底盘安全停止。
77. [ ] 真实机器人现场先测 `1000 stop`，再测低速底盘动作。
83. [ ] Issues are recorded with timestamp, room name, participant type, browser/device, and logs without secrets.

## Evidence To Capture

- Backend health check result.
- Backend startup mode showing LiveKit Cloud mode without secret values.
- Web screenshot showing LiveKit connected and robot video.
- robot-web-publisher status showing camera published.
- Two Web users in the same room.
- Viewer microphone/camera buttons enabled after LiveKit connects.
- Chat message in both windows.
- Controller status and viewer rejection.
- `1000 stop` mock receipt.
- Robot control mode and backend adapter result without secret values.
- real mode config error screenshot or log, if real credentials are not ready.
- PadBot MQTT info request result without key/token/secret values.
- Keyboard control status showing active direction and stop reason.
- Rejection result for removed `1004/1005/1006` commands.
- Android camera publishing screenshot or log.
- LiveKit Cloud usage page screenshot without secrets.
- Admin console screenshot with token/secret fields hidden.
