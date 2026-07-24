# Room History and Admin Operations Implementation Report

## 本轮完成内容

- 为 `livekit_cloud_mvp/backend` 增加 SQLite 本地持久化。
- 持久化 room、participant、room event 元数据。
- 管理员可查看 30 天内房间记录和某个房间的历史详情。
- 管理员可踢出当前 open room 里的 participant。
- 管理员可关闭当前 open room，并断开房间内在线客户端。
- 普通 Web 和 robot-web-publisher 收到 admin kick/close 后会断开并回到入口状态。

## 数据库

使用 Node 内置 `node:sqlite`，没有新增 npm 数据库依赖。

默认配置：

```text
DATABASE_URL=file:./data/livekit_cloud_mvp.sqlite
ROOM_RECORD_RETENTION_DAYS=30
```

新增表：

- `rooms`
- `room_participants`
- `room_events`

backend 启动时会自动 `CREATE TABLE IF NOT EXISTS`，不会破坏已有数据。

不会持久化：

- LiveKit API secret。
- LiveKit participant token。
- 机器人厂商 key/token/MQTT password。
- 原始音视频帧。
- 完整 request body 或 Authorization header。

## 新增/更新 API

所有 admin API 都需要 `Authorization: Bearer <ADMIN_TOKEN>`。

- `GET /api/admin/room-records?days=30`
- `GET /api/admin/room-records/:roomId`
- `POST /api/admin/rooms/:roomName/participants/:participantId/kick`
- `POST /api/admin/rooms/:roomName/close`

保留原有：

- `GET /api/admin/rooms`
- `GET /api/admin/rooms/:roomName`
- `POST /api/admin/rooms/:roomName/control/release`
- `POST /api/admin/rooms/:roomName/participants/cleanup`
- `DELETE /api/admin/rooms/:roomName`

## Admin Console

- `/admin` 保留 sessionStorage admin token 输入。
- 增加 30 天房间记录列表。
- 增加历史详情：participants 和 events。
- 当前 open room 支持 Kick participant。
- 当前 open room 支持 Close Room。
- 已关闭历史 room 不提供 kick/close 操作。
- UI 不显示 token 或 secret。

## 实时行为

- Admin kick 会从实时 RoomStore 删除 participant，写入 `participant_kicked`，并通过 WebSocket 让被踢客户端退出。
- Admin close 会触发安全 stop，关闭实时房间，写入 `room_closed`，并断开该 room 内所有 WebSocket。
- 最后一名 participant 正常离开仍会自动关闭 room，并写入 `empty_room`。
- 同名 room 再次加入会创建新的 open room 记录，不污染旧历史。

## 验证命令

- `backend npm run lint`: passed。
- `backend npm run test`: passed。普通沙箱曾因 `listen EPERM 127.0.0.1` 失败，已按要求用提升权限重跑通过。
- `backend npm run build`: passed。
- `web-client npm run lint`: passed。
- `web-client npm run test`: passed。
- `web-client npm run build`: passed，有 Vite chunk size warning，不影响构建。
- `robot-web-publisher npm run lint`: passed。
- `robot-web-publisher npm run test`: passed。
- `robot-web-publisher npm run build`: passed，有 Vite chunk size warning，不影响构建。

## 未做/未验证

- 没有做真实多浏览器 admin kick/close 手测。
- 没有做真实云端 backend 重启后历史记录检查。
- 没有新增账号系统或数据库用户表。
- 没有持久化聊天历史。
- 没有持久化原始音视频。

## 后续建议

- 云端部署后先确认 `backend/data/livekit_cloud_mvp.sqlite` 文件存在且不被部署脚本覆盖。
- 用两个 Web 用户加入房间，从 `/admin` 踢出 viewer，再关闭房间。
- 重启 backend 后重新打开 `/admin`，确认 30 天历史仍可查看。
- 上线前补正式管理员登录、审计日志、备份策略和 rate limit。
