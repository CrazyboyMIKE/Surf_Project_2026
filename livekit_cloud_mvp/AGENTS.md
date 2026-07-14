# AGENTS.md

This file applies to `livekit_cloud_mvp/`.

本目录是独立的 LiveKit Cloud 方案项目。它和仓库里任何自建 LiveKit Server 方案分开维护。

## Scope

This project uses:

- LiveKit Cloud for all audio/video rooms and WebRTC transport.
- Backend for room state, role state, controller ownership, LiveKit Cloud token generation, chat, and mock robot control relay.
- Web client for watching robot video, chat, controller/viewer UI, and controller media controls.
- Robot web publisher for browser-camera robot simulation.
- Android robot docs/app for Android 8.1 robot camera publishing through backend-issued LiveKit Cloud tokens.

## Strict Boundaries

Do not add:

- Self-hosted LiveKit Server deployment.
- Redis.
- coturn or TURN deployment.
- LiveKit Nginx reverse proxy.
- LiveKit media port requirements such as 7880, 7881, or 50000-60000 as deployment requirements.
- Backend raw audio/video frame forwarding.
- Custom WebRTC or SFU code.
- Database, account system, recording, billing, or complex admin UI.

## Secrets

- `LIVEKIT_API_SECRET` belongs only in backend runtime environment.
- Web, robot-web-publisher, and Android must never contain LiveKit API secret.
- Do not commit `.env`, `.env.local`, `.env.production`, keystores, certificates, private keys, or real tokens.
- Example config must use `YOUR_*` and `example.com` placeholders only.

## Robot Control

Allowed command whitelist:

- `1002`
- `1003`
- `1000`

Robot control remains mock/log/display only. Do not move real hardware.

## Validation

Run available checks after changes:

```bash
npm run lint
npm run test
npm run build
```

For Android, run `./gradlew test` and `./gradlew assembleDebug` only when the Android SDK is configured.
