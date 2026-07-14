# LiveKit Cloud Requirements

This document lists the required resources for the isolated LiveKit Cloud MVP.

## Required Accounts And Services

- LiveKit Cloud project.
- LiveKit Cloud WebSocket URL, for example `wss://your-project.livekit.cloud`.
- LiveKit Cloud API key.
- LiveKit Cloud API secret.
- Cloud server for backend and Web static hosting.
- Domain names:
  - `api.example.com`
  - `web.example.com`
- Trusted HTTPS certificates, such as Let's Encrypt.

## Server Ports

Only these are required on the project cloud server:

```text
22/tcp
80/tcp
443/tcp
```

Do not open LiveKit media-server ports for this project. LiveKit Cloud handles media transport.

## Runtime Components

- backend listens on `127.0.0.1:3001` behind Nginx.
- web-client is built to static files and served by Nginx.
- robot-web-publisher can run locally or be served as static files.
- Android robot app connects to backend with `backendUrl=https://api.example.com`.

## Secret Rules

- `LIVEKIT_API_SECRET` exists only in backend runtime environment.
- Web, robot-web-publisher, and Android do not store the secret.
- Do not commit `.env`.
- Do not paste token or secret values into logs, screenshots, reports, or chat.

## Robot Control Rules

- Allowed commands: `1002`, `1003`, `1000`.
- `1000 stop` must be tested.
- Viewer robot-control attempts must be rejected.
- Real robot movement is not implemented in this project.
