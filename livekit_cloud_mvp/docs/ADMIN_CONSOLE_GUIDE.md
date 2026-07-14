# Admin Console Guide

The LiveKit Cloud MVP admin console is a small operations page for inspecting the backend's in-memory room state.

It is available at:

```text
/admin
```

The console is intentionally not a full account system. It exists to help MVP testing: see active rooms, participants, robot status, and current controller state.

## Enable Admin API

Configure backend runtime environment only:

```text
ADMIN_ENABLED=true
ADMIN_TOKEN=YOUR_STRONG_RANDOM_ADMIN_TOKEN
```

Rules:

- Do not commit real `ADMIN_TOKEN`.
- Do not use `CHANGE_ME_ADMIN_TOKEN` on public deployments.
- Do not put `ADMIN_TOKEN` in Web, Android, or robot-web-publisher env files.
- The Web admin page asks for the token at runtime and sends it as `Authorization: Bearer <token>`.
- The token may be saved in `sessionStorage` for the current browser session, not long-term `localStorage`.

If `ADMIN_ENABLED=false`, admin APIs return `404` with `Admin API disabled`.

## What Admin Can Do

- Refresh room list.
- View room details.
- See robot online/offline state.
- See current controller.
- See viewer and participant counts.
- Release current controller.
- Cleanup offline participants after the backend cleanup threshold.
- Close an empty room with no online participants.

## What Admin Cannot Do

- It cannot send robot movement commands.
- It cannot bypass the robot command whitelist.
- It cannot display or export LiveKit tokens.
- It cannot display `LIVEKIT_API_SECRET`.
- It cannot display the admin token after it is entered.
- It cannot remove online users through a dangerous force-kick action.

## Security Limits

This is an MVP guard, not production-grade identity management.

Before a public launch, replace this token-only admin gate with:

- Proper login.
- Role-based administrator permissions.
- Admin operation audit logs.
- Rate limiting.
- Persistent room state.
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
12. Try closing a non-empty room and confirm it is rejected.
13. Leave all participants, then close the empty room.
