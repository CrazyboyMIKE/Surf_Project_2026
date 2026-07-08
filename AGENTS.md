# AGENTS.md

This file applies to the whole repository unless a deeper directory contains its own `AGENTS.md`.

本项目是一个机器人远程临场 MVP。Codex 必须先理解本文件和 `livekit_robot_mvp_codex_supervision.md`，再进行开发。

## 1. Project Overview

The product goal is a multi-user remote-presence robot MVP:

1. An Android robot app joins a LiveKit room.
2. The robot publishes its camera stream to LiveKit.
3. Web users join the same room and watch the robot video.
4. Only one Web user can be the active controller.
5. Other users are viewers and can watch and chat.
6. The controller can send safe basic movement commands.
7. The backend manages rooms, roles, LiveKit tokens, chat, and control relay.
8. The backend must not forward raw video frames.

First-round development may mock LiveKit and robot movement if credentials or hardware are unavailable.

## 2. Core Development Principles

Codex must:

- Make minimal and focused changes.
- Keep the project runnable at all times.
- Do not rewrite unrelated parts of the project.
- Do not change the technology stack without permission.
- Prefer readable, maintainable code over clever code.
- Explain important design decisions after changes.
- Treat robot movement, camera, microphone, and networking as sensitive areas.

## 3. Technology Stack Constraints

Preferred MVP stack:

- Backend: Node.js + TypeScript + Express.
- Web client: React + TypeScript.
- Realtime business messages: WebSocket.
- Media: LiveKit.
- Storage: in-memory `Map` for first MVP.
- Robot client later: Android Kotlin or Java, Android 8.1 compatible.

Do not add a database, account system, complex UI framework, custom WebRTC implementation, or new cloud service unless the user explicitly approves it.

## 4. MVP Scope

First-round development includes:

- `backend/` with HTTP APIs and WebSocket.
- `web-client/` with room join, role display, chat, robot video placeholder, and control buttons.
- `docs/` with practical project documentation.
- Mock/dev mode for LiveKit token and robot online state if real credentials/hardware are unavailable.

First-round development does not include:

- Real Android robot app.
- Real robot movement.
- Real camera streaming.
- Real LiveKit media publishing.
- Database persistence.
- Login/register system.
- Recording, playback, billing, admin dashboard, or multi-robot scheduling.

## 5. Project Structure Rules

Expected first-round structure:

```text
backend/
  src/
  package.json
  tsconfig.json
  .env.example
  README.md
web-client/
  src/
  package.json
  tsconfig.json
  .env.example
  README.md
docs/
  MVP_SPEC.md
  API_CONTRACT.md
  ARCHITECTURE.md
  ROBOT_CONTROL_PROTOCOL.md
  TEST_PLAN.md
AGENTS.md
livekit_robot_mvp_codex_supervision.md
FIRST_ROUND_DEVELOPMENT_PROMPT.md
```

Rules:

- Keep backend room logic separate from WebSocket message handling.
- Keep frontend API calls separate from React components.
- Keep robot control command validation in one shared backend module.
- Keep LiveKit token generation in a backend service module.
- Do not hard-code secrets in frontend or Android code.

## 6. Robot Control Rules

Allowed first-MVP command whitelist:

- `1002`: move specified distance.
- `1003`: rotate specified angle.
- `1000`: stop.

Rules:

- Do not use `1001` as the default product control command.
- Do not allow arbitrary command strings.
- Do not allow `viewer` users to control the robot.
- Do not bypass backend role checks.
- Always provide a stop command in control UI.
- Use mock robot logging in first round instead of real robot movement.
- Never move real hardware automatically on app load.

## 7. LiveKit and Media Rules

- LiveKit handles audio/video.
- Backend generates LiveKit tokens.
- Backend must not proxy video frames.
- Frontend must never contain LiveKit API secret.
- Android app must never contain LiveKit API secret.
- First round may show a robot video placeholder.
- Real media publishing belongs to a later Android/LiveKit integration task.

## 8. API Rules

Backend APIs must:

- Use JSON.
- Validate request bodies.
- Use proper HTTP status codes.
- Return useful errors.
- Avoid exposing stack traces.
- Keep response formats consistent.

Expected endpoints:

- `GET /health`
- `POST /api/rooms/join`
- `POST /api/robots/join`
- `POST /api/rooms/control/request`
- `POST /api/rooms/control/release`

Expected WebSocket message types:

- `chat`
- `robot_control`
- `role_update`
- `robot_status`
- `error`

## 9. Security Rules

Codex must:

- Never hard-code API keys, tokens, passwords, private keys, or LiveKit secrets.
- Never print secrets in logs.
- Never commit `.env` files containing secrets.
- Use `.env.example` for examples only.
- Validate and sanitize user input.
- Avoid unsafe shell commands.
- Do not use `eval` or unsafe deserialization.
- Do not weaken CORS, authentication, permissions, or access control without approval.

## 10. Files Codex Must Not Modify Without Permission

Codex must not modify these files unless explicitly asked:

- `.env`
- `.env.local`
- `.env.production`
- package lockfiles after they are created
- deployment files
- production config files
- keystore, certificate, or signing files

If a change is necessary, Codex must explain why first.

## 11. Testing Requirements

After making code changes, Codex should run relevant checks when possible:

```bash
npm run lint
npm run test
npm run build
```

If dependencies cannot be installed because of network restrictions, Codex must say that clearly and still provide manual test steps.

Manual first-round validation:

1. Start backend.
2. Start web client.
3. Open two browser windows.
4. Join the same room as two users.
5. Make one user controller and one user viewer.
6. Confirm viewer control buttons are disabled.
7. Confirm controller can send `1002`, `1003`, and `1000`.
8. Confirm chat messages appear in both windows.
9. Confirm mock robot receives or logs control messages.

## 12. Task Workflow

For each task, Codex should:

1. Inspect relevant files.
2. State the short plan.
3. Make the smallest safe change.
4. Run relevant validation.
5. Summarize changes and how to test.

## 13. Final Response Format

Codex should answer in Chinese unless the user asks otherwise.

Use this format:

```text
Summary:
- What changed.

Files changed:
- path: reason.

Validation:
- command: passed/failed/not run, with reason.

Notes:
- mock parts, risks, and next step.
```

## 14. User Preference

The user is learning through this project. Codex should explain:

- What problem was solved.
- Why this approach was chosen.
- How the code works.
- How to test it.
- What to learn next.
