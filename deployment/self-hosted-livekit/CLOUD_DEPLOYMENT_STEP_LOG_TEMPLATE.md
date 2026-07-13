# Cloud Deployment Step Log Template

Use this checklist while deploying. Do not paste real secrets.

## Server

- [ ] Cloud provider:
- [ ] Region:
- [ ] VM size:
- [ ] Public IP:
- [ ] OS:

## DNS

- [ ] `livekit.example.com` resolves to server/load balancer.
- [ ] `api.example.com` resolves to server/load balancer.
- [ ] `web.example.com` resolves to server/load balancer.
- [ ] Optional `turn.example.com` resolves.

## HTTPS Certificates

- [ ] LiveKit certificate issued by trusted CA.
- [ ] Backend certificate issued by trusted CA.
- [ ] Web certificate issued by trusted CA.
- [ ] No self-signed certs used for Android/phone public test.

## Firewall / Security Group

- [ ] `443/tcp` open.
- [ ] `7880/tcp` open or intentionally restricted behind Nginx.
- [ ] `7881/tcp` open.
- [ ] `50000-60000/udp` open.
- [ ] TURN ports open if TURN enabled.
- [ ] Cloud security group checked.
- [ ] Server firewall checked.

## Services

- [ ] Redis started.
- [ ] LiveKit started.
- [ ] Nginx config test passed.
- [ ] Backend started.
- [ ] Web static files deployed.
- [ ] robot-web-publisher configured.

## Environment

- [ ] Backend `.env` checked without recording secret values.
- [ ] `npm run check:livekit-env` passed.
- [ ] Web env uses `VITE_API_BASE_URL=https://api.example.com`.
- [ ] Web env uses `VITE_WS_BASE_URL=wss://api.example.com/ws`.
- [ ] robot-web-publisher env uses public API/WS.
- [ ] Android `backendUrl=https://api.example.com`.

## Tests

- [ ] `https://api.example.com/health` returns `{ "ok": true }`.
- [ ] Backend token response has `tokenMode=livekit`.
- [ ] robot-web-publisher publishes computer camera.
- [ ] Web user A sees robot video.
- [ ] Web user B sees robot video.
- [ ] A and B chat.
- [ ] Controller request succeeds.
- [ ] Viewer control is rejected.
- [ ] Controller sends `1002`.
- [ ] Controller sends `1003`.
- [ ] Controller sends `1000 stop`.
- [ ] Phone 4G/5G can watch video.
- [ ] Android robot joins room.
- [ ] Android robot publishes camera.
- [ ] LiveKit Cloud usage remains unchanged.

## TURN Follow-up

- [ ] 4G/5G failure observed.
- [ ] Corporate/campus network failure observed.
- [ ] TURN candidate appears in logs.
- [ ] TURN deployment planned.

## Open Issues

- [ ] Issue:
- [ ] Owner:
- [ ] Next action:
