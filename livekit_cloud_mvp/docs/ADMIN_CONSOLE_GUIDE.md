# Admin Console Guide

The LiveKit Cloud MVP admin console is a small operations page for inspecting active in-memory room state and recent SQLite room history.

It is available at:

```text
/admin
```

The console is intentionally not a full account system. It exists to help MVP testing: see active rooms, participants, robot status, current controller state, and 30-day room records.

## Enable Admin API

Configure backend runtime environment only:

```text
ADMIN_ENABLED=true
ADMIN_TOKEN=YOUR_STRONG_RANDOM_ADMIN_TOKEN
DATABASE_URL=file:./data/livekit_cloud_mvp.sqlite
ROOM_RECORD_RETENTION_DAYS=30
```

Rules:

- Do not commit real `ADMIN_TOKEN`.
- Do not use `CHANGE_ME_ADMIN_TOKEN` on public deployments.
- Do not put `ADMIN_TOKEN` in Web, Android, or robot-web-publisher env files.
- The Web admin page asks for the token at runtime and sends it as `Authorization: Bearer <token>`.
- The token may be saved in `sessionStorage` for the current browser session, not long-term `localStorage`.
- SQLite data is local backend state. Do not commit files under `backend/data/`.

If `ADMIN_ENABLED=false`, admin APIs return `404` with `Admin API disabled`.

## Room History Database

The backend initializes a local SQLite database at startup.

Persisted:

- Room name, status, created time, closed time, close reason.
- Participant join/leave/kick state.
- Sanitized room events such as `room_created`, `participant_joined`, `participant_left`, `participant_kicked`, `controller_changed`, and `room_closed`.

Not persisted:

- LiveKit API secret.
- LiveKit participant tokens.
- Robot vendor key/token/password.
- Raw audio or video frames.

## What Admin Can Do

- Refresh room list.
- View room details.
- View 30-day room records.
- View historical participants and events for a room record.
- See robot online/offline state.
- See current controller.
- See viewer and participant counts.
- Release current controller.
- Cleanup offline participants after the backend cleanup threshold.
- Kick a participant from an open room.
- Close an open room and disconnect online participants.

## What Admin Cannot Do

- It cannot send robot movement commands.
- It cannot bypass the robot command whitelist.
- It cannot display or export LiveKit tokens.
- It cannot display `LIVEKIT_API_SECRET`.
- It cannot display the admin token after it is entered.
- It cannot bypass controller/viewer robot-control checks.
- It cannot change the robot-control whitelist.

## Security Limits

This is an MVP guard, not production-grade identity management.

Before a public launch, replace this token-only admin gate with:

- Proper login.
- Role-based administrator permissions.
- Admin operation audit logs.
- Rate limiting.
- Longer-term persistence and backups if production history is required.
- Clear incident logging without secrets.

## Manual Test

1. Start backend with `ADMIN_ENABLED=false`.
2. Confirm `GET /api/admin/rooms` returns disabled.
3. Set `ADMIN_ENABLED=true` and a strong `ADMIN_TOKEN`.
4. Restart backend.
5. Open `/admin`.
6. Enter the admin token.
7. Click `Refresh`.
8. Join a room from the normal Web page.
9. Confirm the room appears in the admin room list.
10. Confirm details show participants without tokens or secrets.
11. Release controller and confirm normal Web users receive updated role state.
12. Click `Load History` and confirm a 30-day room record exists.
13. Kick a viewer and confirm that viewer is disconnected and the history detail shows `participant_kicked`.
14. Close the room and confirm all users disconnect.
15. Confirm current active rooms no longer show the closed room.
16. Confirm room records still show the closed room with `room_closed`.
17. Restart backend and confirm records still exist.
