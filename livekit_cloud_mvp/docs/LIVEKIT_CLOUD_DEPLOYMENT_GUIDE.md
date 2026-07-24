# LiveKit Cloud Deployment Guide

This guide deploys the isolated LiveKit Cloud MVP.

LiveKit Cloud provides audio/video rooms and WebRTC transport. Your cloud server only hosts backend and Web assets.

## Prepare

You need:

- LiveKit Cloud project.
- `LIVEKIT_URL`.
- `LIVEKIT_API_KEY`.
- `LIVEKIT_API_SECRET`.
- Cloud server.
- Domain names:
  - `api.example.com`
  - `web.example.com`
- Trusted HTTPS certificates.

## Server Ports

Open:

```text
22/tcp
80/tcp
443/tcp
```

Do not open these for this Cloud project:

```text
7880/tcp
7881/tcp
50000-60000/udp
TURN ports
```

Those are not part of this deployment because LiveKit Cloud handles media transport.

## Backend Deployment

Install Node.js on the server, then:

```bash
cd livekit_cloud_mvp/backend
npm install
npm run build
```

Create backend `.env` on the server only:

```text
PORT=3001
NODE_ENV=production
PUBLIC_BASE_URL=https://api.example.com
CORS_ORIGIN=https://web.example.com
DATABASE_URL=file:./data/livekit_cloud_mvp.sqlite
ROOM_RECORD_RETENTION_DAYS=30
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_CLOUD_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_CLOUD_API_SECRET
LIVEKIT_TOKEN_TTL=1h
MOCK_ROBOT_ONLINE=false
ADMIN_ENABLED=false
ADMIN_TOKEN=CHANGE_ME_ADMIN_TOKEN
```

For the admin console, set `ADMIN_ENABLED=true` and replace `ADMIN_TOKEN` with a strong random value. Do not use `CHANGE_ME_ADMIN_TOKEN` on a public deployment.

The SQLite file under `backend/data/` stores room history. Keep this directory on the server and do not copy it into Git. If your deployment script replaces the whole backend directory, back up `backend/data/` first.

Start with pm2 or systemd:

```bash
npm run start
```

Health check:

```bash
curl https://api.example.com/health
```

## Web Deployment

```bash
cd livekit_cloud_mvp/web-client
npm install
cp .env.livekit-cloud.example .env.production
npm run build
```

Edit `.env.production` before building:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com/ws
```

Serve `dist/` through Nginx.

## Nginx

Use:

- `deployment/nginx-backend.example.conf`
- `deployment/nginx-web.example.conf`

Backend Nginx must support WebSocket `/ws` with `Upgrade` and `Connection` headers.

Web Nginx serves the static SPA with `try_files $uri /index.html`.

## Robot Web Publisher

For quick validation, run robot-web-publisher locally:

```bash
cd livekit_cloud_mvp/robot-web-publisher
npm install
cp .env.livekit-cloud.example .env.production
npm run dev
```

It can also be built and served as static files.

## Android Robot

Install the APK on Android 8.1+ robot and configure:

```text
backendUrl=https://api.example.com
robotId=robot-001
roomName=robot-room-001
```

Android gets LiveKit Cloud token from backend. It does not store LiveKit API secret.

## LiveKit Cloud Usage

After tests:

1. Open LiveKit Cloud dashboard.
2. Check project usage.
3. Confirm test rooms and participant minutes match expected usage.
4. Stop unused test publishers to avoid extra consumption.
