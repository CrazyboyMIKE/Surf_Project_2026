# LiveKit Cloud Deployment Step Log

Use this template while deploying. Do not paste real secrets.

## LiveKit Cloud

- [ ] Project created:
- [ ] `LIVEKIT_URL` copied:
- [ ] API key created:
- [ ] API secret stored only in backend env:
- [ ] Usage dashboard location noted:

## Cloud Server

- [ ] Server provider:
- [ ] Server public IP:
- [ ] SSH access verified:
- [ ] `22/tcp` open only to trusted operator IP:
- [ ] `80/tcp` open:
- [ ] `443/tcp` open:

## DNS And HTTPS

- [ ] `api.example.com` points to server:
- [ ] `web.example.com` points to server:
- [ ] HTTPS certificate for API issued:
- [ ] HTTPS certificate for Web issued:

## Backend

- [ ] backend `.env` created on server:
- [ ] `LIVEKIT_URL` set:
- [ ] `LIVEKIT_API_KEY` set:
- [ ] `LIVEKIT_API_SECRET` set without recording value:
- [ ] `CORS_ORIGIN=https://web.example.com`:
- [ ] backend build passed:
- [ ] backend started:
- [ ] `/health` passed:

## Web Client

- [ ] `.env.production` created:
- [ ] `VITE_API_BASE_URL=https://api.example.com`:
- [ ] `VITE_WS_BASE_URL=wss://api.example.com/ws`:
- [ ] web-client build passed:
- [ ] Nginx static site configured:
- [ ] Web page opens:

## Robot Web Publisher

- [ ] Env configured:
- [ ] Browser opened:
- [ ] Camera permission granted:
- [ ] Robot token fetched:
- [ ] LiveKit Cloud connected:
- [ ] Camera published:

## Web Acceptance

- [ ] Web user A joined:
- [ ] Web user B joined:
- [ ] Both users see robot video:
- [ ] Chat works:
- [ ] Controller request works:
- [ ] Viewer control rejected:
- [ ] `1000 stop` tested:

## Android True Device

- [ ] APK built:
- [ ] Device connected by adb:
- [ ] APK installed:
- [ ] `backendUrl=https://api.example.com`:
- [ ] Camera permission granted:
- [ ] Android camera visible in Web:

## LiveKit Cloud Usage

- [ ] Usage checked after test:
- [ ] Unexpected usage:

## Unresolved Issues

- [ ] Issue:
- [ ] Next action:
