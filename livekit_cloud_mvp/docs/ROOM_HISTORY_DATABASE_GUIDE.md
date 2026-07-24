# Room History Database Guide

This MVP uses local SQLite for room history and admin inspection.

## Configuration

Backend environment:

```text
DATABASE_URL=file:./data/livekit_cloud_mvp.sqlite
ROOM_RECORD_RETENTION_DAYS=30
```

The default path is relative to `livekit_cloud_mvp/backend` when the backend process is started from that directory.

Do not commit the SQLite file. `backend/data/`, `*.sqlite`, `*.sqlite-wal`, and `*.sqlite-shm` are ignored by Git.

## Tables

- `rooms`: room name, open/closed status, current controller id, robot id, created/updated/closed timestamps, close reason.
- `room_participants`: participant id, client session id, display name, role, connected state, joined/left/kicked timestamps.
- `room_events`: sanitized room events such as room created, participant joined/left/kicked, controller changed, and room closed.

## Persisted Data

- Room records for admin history.
- Participant join/leave/kick history.
- Sanitized room lifecycle events.

## Not Persisted

- LiveKit API secret.
- LiveKit participant tokens.
- Robot vendor app key, app token, MQTT password, or other robot credentials.
- Raw audio/video frames.
- Full request bodies or authorization headers.

## Admin APIs

- `GET /api/admin/room-records?days=30`
- `GET /api/admin/room-records/:roomId`
- `POST /api/admin/rooms/:roomName/participants/:participantId/kick`
- `POST /api/admin/rooms/:roomName/close`

All admin APIs require:

```text
Authorization: Bearer <ADMIN_TOKEN>
```

## Runtime Behavior

- Joining a new room creates an open `rooms` record.
- Rejoining an existing open room reuses that open record.
- Leaving or stale-disconnect cleanup marks the participant disconnected and sets `leftAt`.
- If the last participant leaves, the room is closed with `closeReason=empty_room`.
- Admin close closes the open room with `closeReason=admin_closed`.
- Rejoining the same `roomName` after close creates a fresh room record.

## Manual Check

1. Start backend.
2. Join a room from Web.
3. Open `/admin` and load active rooms.
4. Click `Load History`.
5. Confirm the room appears in the 30-day records.
6. Kick a viewer and confirm `participant_kicked` appears in record detail.
7. Close the room and confirm `room_closed` appears with `admin_closed`.
8. Restart backend and confirm the history record remains visible.
