# LiveKit Cloud Architecture

## Overview

```text
Web users
  -> HTTPS/WSS
  -> Nginx
  -> backend
  -> LiveKit Cloud token generation

Web users and robot publishers
  -> LiveKit Cloud
  -> audio/video transport

Android robot
  -> backend for token and WebSocket control messages
  -> LiveKit Cloud for camera publishing
```

## Responsibilities

Backend:

- Stores room, participant, controller, and robot online state in memory.
- Generates LiveKit Cloud tokens.
- Owns controller/viewer robot-control permissions.
- Relays chat and robot-control messages through WebSocket.
- Does not forward raw audio/video frames.

Web client:

- Joins rooms through backend.
- Displays role, backend/WebSocket/LiveKit status, robot online/offline state, chat, and robot video.
- Lets controller send `1002`, `1003`, and `1000`.
- Disables control for viewer.
- Uses backend-returned LiveKit Cloud token.

Robot web publisher:

- Calls backend `POST /api/robots/join`.
- Publishes the computer camera as robot video to LiveKit Cloud.

Android robot:

- Calls backend `POST /api/robots/join`.
- Publishes Android camera to LiveKit Cloud.
- Receives robot-control messages through backend WebSocket.
- Logs/displays commands only.

## Media Permissions

| Role | Subscribe | Publish |
|---|---:|---:|
| robot | yes | yes |
| controller | yes | yes |
| viewer | yes | yes |

Viewer media publishing is allowed for Web microphone/camera participation. Robot-control permission remains backend-owned and controller-only.

## Security Boundary

LiveKit Cloud API secret is backend-only. Clients receive short-lived tokens from backend and never sign their own tokens.
