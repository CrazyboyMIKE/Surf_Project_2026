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
27. [ ] Admin cannot close a non-empty room.
28. [ ] Admin can close an empty room.
29. [ ] Admin page and admin API do not display LiveKit token, API secret, or admin token.
30. [ ] Admin page does not provide robot movement command buttons.
31. [ ] `ROBOT_CONTROL_MODE=mock` 下 controller 发送 `1002` 成功记录。
32. [ ] `ROBOT_CONTROL_MODE=mock` 下 controller 发送 `1003` 成功记录。
33. [ ] `ROBOT_CONTROL_MODE=mock` 下 controller 发送 `1000 stop` 成功记录。
34. [ ] Viewer 发送 robot_control 被 backend 拒绝。
35. [ ] 非当前 controller 发送 robot_control 被 backend 拒绝。
36. [ ] Robot offline 时控制被 backend 拒绝。
37. [ ] `1001` 被 backend 拒绝。
38. [ ] `ROBOT_CONTROL_MODE=real` 且配置缺失时返回清楚错误。
39. [ ] PadBot real 模式使用 `ROBOT_VENDOR_API_BASE_URL + /cloud/openapirobot/applyRobotMqttInfo.action` 申请 MQTT 信息。
40. [ ] `ROBOT_VENDOR_TOKEN` 使用 PadBot JSON 中的 `apptoken`，`ROBOT_VENDOR_APP_SECRET` 可留空。
41. [ ] 厂商未返回 post topic 时，backend 返回清楚错误，不伪造 topic。
42. [ ] real 模式错误响应不泄露 key、token、secret 或 MQTT password。
43. [ ] 用户填入真实凭证后，需要人工现场验证真实机器人动作。
44. [ ] 真实机器人现场先测 `1000 stop`，再低速测 `1002` 和 `1003`。
45. [ ] 键盘方向键控制默认关闭。
46. [ ] 开启 `ROBOT_ENABLE_KEYBOARD_CONTROL=true` 和 `ROBOT_ENABLE_CONTINUOUS_1001=true` 后 controller 可用键盘控制。
47. [ ] viewer 不可用键盘控制。
48. [ ] 非当前 controller 不可用键盘控制。
49. [ ] `ArrowUp` 映射为 `forward`。
50. [ ] `ArrowDown` 映射为 `backward`。
51. [ ] `ArrowLeft` 映射为 `left`。
52. [ ] `ArrowRight` 映射为 `right`。
53. [ ] 组合方向映射正确：`forward_left`、`forward_right`、`backward_left`、`backward_right`。
54. [ ] Space 触发 `1000 stop`。
55. [ ] 松手触发 `1000 stop`。
56. [ ] 页面失焦触发 `1000 stop`。
57. [ ] deadman timeout 触发 `1000 stop`。
58. [ ] max session timeout 触发 `1000 stop`。
59. [ ] WebSocket 断线触发 `1000 stop`。
60. [ ] controller release 触发 `1000 stop`。
61. [ ] controller transfer 触发 `1000 stop`。
62. [ ] 超过最大线速度被拒绝。
63. [ ] 超过最大角速度被拒绝。
64. [ ] 普通 `robot_control` 发送 `1001` 被拒绝。
65. [ ] `1002/1003/1000` 原有控制不受影响。
66. [ ] Issues are recorded with timestamp, room name, participant type, browser/device, and logs without secrets.

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
- Android camera publishing screenshot or log.
- LiveKit Cloud usage page screenshot without secrets.
- Admin console screenshot with token/secret fields hidden.
