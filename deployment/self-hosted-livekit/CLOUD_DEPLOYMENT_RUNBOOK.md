# Cloud Deployment Runbook

This runbook prepares the minimum cloud loop. It does not prove cloud testing has passed until each step is executed on real infrastructure.

## 1. Prepare Cloud Server

- Provision a Linux cloud VM.
- Point DNS records to the VM or load balancer:
  - `livekit.example.com`
  - `api.example.com`
  - `web.example.com`
  - optional `turn.example.com`
- Install Docker, Docker Compose, and Nginx or use equivalent managed services.

## 2. Firewall And Security Group

Open both cloud security group and server firewall:

- `443/tcp`: HTTPS/WSS for Web, backend, and LiveKit proxy.
- `7880/tcp`: LiveKit API/WebSocket raw port; expose only if your Nginx/load balancer plan requires it.
- `7881/tcp`: ICE TCP fallback.
- `50000-60000/udp`: WebRTC media ports, direct to LiveKit.

If TURN is enabled, also open TURN ports, commonly:

- `3478/udp`
- `3478/tcp`
- `5349/tcp`

Nginx does not proxy `50000-60000/udp`. Those media ports must be reachable directly.

## 3. HTTPS Certificates

- Use Let's Encrypt or another trusted CA.
- Do not use self-signed certs for Android or phone public testing.
- Configure:
  - `nginx-livekit.example.conf`
  - `nginx-backend.example.conf`
  - `nginx-web.example.conf`

## 4. Start LiveKit And Redis

1. Copy `livekit.yaml.example` to a real server config path.
2. Replace:
   - `YOUR_LIVEKIT_API_KEY`
   - `YOUR_LIVEKIT_API_SECRET`
   - example domains if TURN is enabled.
3. Start Redis and LiveKit:

```bash
docker compose -f docker-compose.example.yml up -d
```

4. Check LiveKit logs without printing secrets.

## 5. Start Backend

1. Create backend env from `backend.env.cloud.example`.
2. Replace placeholders with real backend and LiveKit values.
3. Run env check:

```bash
npm run check:livekit-env
```

4. Start backend.
5. Verify:

```bash
curl https://api.example.com/health
```

## 6. Deploy Web Client

1. Use `web.env.cloud.example`.
2. Build web-client.
3. Copy `dist/` to the Nginx static root.
4. Open `https://web.example.com`.

## 7. Deploy Robot Web Publisher

1. Use `robot-web-publisher.env.cloud.example`.
2. Build or run the publisher.
3. Join the same room as `robot-001`.
4. Allow camera permission.

## 8. Minimum Cloud Loop

Verify in this order:

1. Self-hosted LiveKit starts.
2. Redis starts.
3. Nginx HTTPS/WSS works.
4. Backend can generate self-hosted LiveKit token.
5. robot-web-publisher publishes camera.
6. Two Web users watch video.
7. Two Web users chat.
8. Controller can turn mic/camera on if supported.
9. Viewer cannot control.
10. Controller sends `1002`.
11. Controller sends `1003`.
12. Controller sends `1000 stop`.
13. Android robot joins and publishes camera.
14. Phone on 4G/5G can watch video.
15. LiveKit Cloud dashboard shows no usage increase during the test window.

If 4G/5G can join but cannot see video, record TURN as a follow-up.
Do not mark the cloud loop as passed until the LiveKit Cloud no-usage check is recorded.
