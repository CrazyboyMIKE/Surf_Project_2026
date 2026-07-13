# Cloud Deployment Step Log Template

日期：2026-07-12（Asia/Shanghai）

Use this while deploying the minimum cloud loop. Do not paste real secrets.

## 1. Cloud Server

- [ ] Cloud provider:
- [ ] Region:
- [ ] VM size:
- [ ] Public IP:
- [ ] OS:
- [ ] SSH access confirmed:

## 2. DNS

- [ ] `livekit.example.com` resolves correctly.
- [ ] `api.example.com` resolves correctly.
- [ ] `web.example.com` resolves correctly.
- [ ] Optional `turn.example.com` resolves correctly.

## 3. HTTPS Certificates

- [ ] LiveKit cert issued by trusted CA.
- [ ] Backend cert issued by trusted CA.
- [ ] Web cert issued by trusted CA.
- [ ] Certificate renewal plan recorded.
- [ ] No self-signed certs for Android/phone public test.

## 4. Firewall / Security Group

- [ ] `443/tcp` open.
- [ ] `7880/tcp` open or intentionally restricted behind Nginx.
- [ ] `7881/tcp` open.
- [ ] `50000-60000/udp` open.
- [ ] TURN ports open if TURN enabled.
- [ ] Cloud security group checked.
- [ ] Server firewall checked.

## 5. Services

- [ ] Redis started.
- [ ] LiveKit started.
- [ ] Nginx config test passed.
- [ ] Backend started.
- [ ] Web client deployed.
- [ ] robot-web-publisher deployed or configured locally against public backend.

## 6. Env Checks

- [ ] Backend `.env` checked without recording secret values.
- [ ] `npm run check:livekit-env` passed.
- [ ] Web env uses `VITE_API_BASE_URL=https://api.example.com`.
- [ ] Web env uses `VITE_WS_BASE_URL=wss://api.example.com/ws`.
- [ ] robot-web-publisher env uses public API/WS.
- [ ] Android `backendUrl=https://api.example.com`.

## 7. Functional Tests

- [ ] Backend `/health`.
- [ ] Backend real LiveKit token generation.
- [ ] robot-web-publisher video test.
- [ ] Web user A watches robot video.
- [ ] Web user B watches robot video.
- [ ] Chat test.
- [ ] Controller request test.
- [ ] Viewer unauthorized control rejected.
- [ ] Controller sends `1002`.
- [ ] Controller sends `1003`.
- [ ] Controller sends `1000 stop`.
- [ ] Android robot joins room.
- [ ] Android robot publishes camera.
- [ ] Phone 4G/5G watches video.
- [ ] LiveKit Cloud usage remains unchanged.

## 8. TURN Notes

- [ ] 4G/5G video failure observed.
- [ ] Campus/company network failure observed.
- [ ] TURN follow-up required.
- [ ] TURN not required for current test.

## 9. Open Issues

- [ ] Issue:
- [ ] Owner:
- [ ] Next action:
