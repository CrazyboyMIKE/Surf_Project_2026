# Robot Control Protocol

## 1. Purpose

This document defines the safe first-MVP robot control protocol.

The first round does not move real hardware. It only validates command permissions and message flow.

## 2. Allowed Commands

Only these commands are allowed:

```text
1002
1003
1000
```

Meaning:

| Command | Meaning | First-round behavior |
|---|---|---|
| `1002` | Move specified distance | Mock log / relay |
| `1003` | Rotate specified angle | Mock log / relay |
| `1000` | Stop | Mock log / relay |

## 3. Parameters

Parameters are constrained by backend validation:

| Command | Parameters |
|---|---|
| `1002` | `{ "distanceCm": number }`, from `-100` to `100`, default `20` |
| `1003` | `{ "angleDeg": number }`, from `-180` to `180`, default `15` |
| `1000` | no movement parameters |

Current Web mapping:

| Button | Command | Parameters |
|---|---|---|
| Forward | `1002` | `{ "distanceCm": 20 }` |
| Back | `1002` | `{ "distanceCm": -20 }` |
| Left | `1003` | `{ "angleDeg": -15 }` |
| Right | `1003` | `{ "angleDeg": 15 }` |
| Stop | `1000` | `{}` |

## 4. Disallowed Commands

All other commands must be rejected.

Especially:

- Do not use `1001` as default product control.
- Do not allow arbitrary command strings.
- Do not allow custom shell commands.
- Do not allow frontend-defined code execution.

## 5. Required Backend Checks

Before accepting a command, backend checks:

1. `roomName` exists.
2. `senderId` belongs to the room.
3. WebSocket `senderId` matches the earlier `hello` identity.
4. `senderId` is the current controller.
5. `command` is in the whitelist.
6. Robot is online or mock online.
7. Movement parameters are constrained.

## 6. Message

```json
{
  "type": "robot_control",
  "roomName": "robot-room-001",
  "senderId": "user-abc",
  "command": "1002",
  "parameters": {
    "distanceCm": 20
  }
}
```

## 7. Error Codes

```text
ROOM_NOT_FOUND
PARTICIPANT_NOT_FOUND
NOT_CONTROLLER
COMMAND_NOT_ALLOWED
INVALID_PARAMETERS
ROBOT_OFFLINE
INVALID_REQUEST
SOCKET_NOT_IDENTIFIED
SENDER_MISMATCH
```

## 8. Safety Rules for Later Real Robot Integration

When real robot control is added:

- Keep low default speeds.
- Always expose stop.
- Do not move automatically on startup.
- Log commands without secrets.
- Add physical safety instructions in README.
- Test in an open area with a human near the robot.
- Prefer step commands `1002` and `1003` before continuous movement.
