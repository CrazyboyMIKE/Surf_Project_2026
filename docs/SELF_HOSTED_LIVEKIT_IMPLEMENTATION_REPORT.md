# Self-hosted LiveKit Implementation Report

日期：2026-07-11（Asia/Shanghai）

## 1. Scope

本轮是第 5.5 轮：Self-hosted LiveKit 云端部署支持与联调准备。

本轮只补充自建 LiveKit Server 的配置模板、部署文档、环境变量校验和验收测试文档。

未做：

- 不修改真实 `.env`。
- 不写入真实密钥。
- 不把 `LIVEKIT_API_SECRET` 放到 Web、robot-web-publisher 或 Android。
- 不改动真实机器人运动控制。
- 不默认开放 viewer publish 权限。
- 不引入数据库。
- 不自己实现 WebRTC/SFU。

## 2. Completed

项目结构检查：

- `backend/` exists.
- `web-client/` exists.
- `robot-web-publisher/` exists.
- `android-robot/` exists.
- Backend LiveKit token generation uses:
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
- Web and Android use backend-returned `liveKitUrl` and `token`.
- No frontend or Android code needs `LIVEKIT_API_SECRET`.

Self-hosted templates:

- Added `deployment/self-hosted-livekit/README.md`.
- Added `deployment/self-hosted-livekit/livekit.yaml.example`.
- Added `deployment/self-hosted-livekit/docker-compose.example.yml`.
- Added `deployment/self-hosted-livekit/nginx-livekit.example.conf`.
- Added `deployment/self-hosted-livekit/backend.env.selfhost.example`.
- Added `deployment/self-hosted-livekit/web.env.selfhost.example`.
- Added `deployment/self-hosted-livekit/robot-web-publisher.env.selfhost.example`.
- Added `deployment/self-hosted-livekit/android-config.selfhost.example.md`.

Docs:

- Added `docs/SELF_HOSTED_LIVEKIT_DEPLOYMENT_GUIDE.md`.
- Added `docs/SELF_HOSTED_LIVEKIT_ACCEPTANCE_TEST.md`.
- Added this report.

Backend env validation:

- Added `validateLiveKitConfig`.
- `mock://...` mode allows empty key/secret.
- `ws://...` and `wss://...` modes require `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
- Invalid `LIVEKIT_URL` schemes are rejected.
- Error messages name missing env vars but do not print secret values.

Check script:

- Added `backend/src/tools/checkLiveKitEnv.ts`.
- Added `npm run check:livekit-env`.
- The script prints token mode, URL scheme, and whether key/secret are present.
- The script does not print key/secret contents.

## 3. Files Modified

Backend:

- `backend/package.json`
- `backend/src/config.ts`
- `backend/src/services/liveKitTokenService.ts`
- `backend/src/tools/checkLiveKitEnv.ts`

Deployment templates:

- `deployment/self-hosted-livekit/README.md`
- `deployment/self-hosted-livekit/livekit.yaml.example`
- `deployment/self-hosted-livekit/docker-compose.example.yml`
- `deployment/self-hosted-livekit/nginx-livekit.example.conf`
- `deployment/self-hosted-livekit/backend.env.selfhost.example`
- `deployment/self-hosted-livekit/web.env.selfhost.example`
- `deployment/self-hosted-livekit/robot-web-publisher.env.selfhost.example`
- `deployment/self-hosted-livekit/android-config.selfhost.example.md`

Docs:

- `docs/SELF_HOSTED_LIVEKIT_DEPLOYMENT_GUIDE.md`
- `docs/SELF_HOSTED_LIVEKIT_ACCEPTANCE_TEST.md`
- `docs/SELF_HOSTED_LIVEKIT_IMPLEMENTATION_REPORT.md`

## 4. What Scheme B Still Needs

Real resources not present in this workspace:

- Cloud server.
- Domain for LiveKit, for example `livekit.example.com`.
- Domain for backend, for example `api.example.com`.
- Domain for Web, for example `web.example.com`.
- Trusted HTTPS certificates.
- Real LiveKit API key and API secret generated for the self-hosted LiveKit Server.
- Firewall access to:
  - `7880/tcp`
  - `7881/tcp`
  - `50000-60000/udp`
  - TURN ports if TURN is enabled.
- Android robot or Android 8.1+ test device.

## 5. User Preparation Checklist

Prepare:

- One cloud server with enough CPU and bandwidth for expected video load.
- DNS records:
  - `livekit.example.com`
  - `api.example.com`
  - `web.example.com`
  - optionally `turn.example.com`
- HTTPS certificates from Let's Encrypt or another trusted CA.
- Self-hosted LiveKit key pair:
  - `YOUR_LIVEKIT_API_KEY`
  - `YOUR_LIVEKIT_API_SECRET`
- Backend deployment env based on `backend.env.selfhost.example`.
- Web build env based on `web.env.selfhost.example`.
- Robot publisher env based on `robot-web-publisher.env.selfhost.example`.
- Android robot APK and public `backendUrl=https://api.example.com`.

## 6. Validation Run

Backend env check:

```bash
cd backend
npm run check:livekit-env
```

Result:

- Passed in default mock mode.
- Output did not print secret values.

Missing credential check:

```bash
cd backend
LIVEKIT_URL=wss://livekit.example.com npm run check:livekit-env
```

Result:

- Failed as expected.
- Error: `LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set when LIVEKIT_URL uses ws:// or wss://`.
- No secret value was printed.

Self-hosted ws example check:

```bash
cd backend
LIVEKIT_URL=ws://192.168.1.10:7880 LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET npm run check:livekit-env
```

Result:

- Passed.
- Output showed `token mode: livekit`.
- Output showed `LIVEKIT_URL scheme: ws://`.
- Output only showed key/secret presence, not values.

Backend:

```bash
cd backend
npm run lint
npm run test
npm run build
```

Result:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.

Web client:

```bash
cd web-client
npm run lint
npm run test
npm run build
```

Result:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Vite reported a non-blocking LiveKit bundle size warning.

Robot web publisher:

```bash
cd robot-web-publisher
npm run lint
npm run build
```

Result:

- `npm run lint`: passed.
- `npm run build`: passed.
- Vite reported a non-blocking LiveKit bundle size warning.

Android robot:

```bash
cd android-robot
ANDROID_HOME=/Users/linziwei/Library/Android/sdk ANDROID_SDK_ROOT=/Users/linziwei/Library/Android/sdk ./gradlew test
ANDROID_HOME=/Users/linziwei/Library/Android/sdk ANDROID_SDK_ROOT=/Users/linziwei/Library/Android/sdk ./gradlew assembleDebug
```

Result:

- `./gradlew test`: passed.
- `./gradlew assembleDebug`: passed.
- Gradle reported deprecation warnings; not blocking for this round.

Safety:

```bash
find . -name '.env' -o -name '.env.local' -o -name '.env.production'
git diff --check
rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/.git/**' --glob '!**/build/**' "LIVEKIT_API_SECRET|LIVEKIT_API_KEY|eyJ[A-Za-z0-9_-]{20,}|BEGIN PRIVATE KEY|password" backend web-client robot-web-publisher android-robot docs deployment README.md
```

Result:

- No real `.env`, `.env.local`, or `.env.production` files found.
- `git diff --check`: passed.
- Secret scan found only placeholders, env var names, and documentation references.

## 7. Tests Not Run

Not run because real infrastructure is not available in this workspace:

- Deploying LiveKit Server on a cloud VM.
- DNS and HTTPS certificate validation.
- Nginx WSS proxy validation.
- Real public firewall traversal.
- Real TURN behavior.
- Web users watching from 4G/5G.
- Android robot connecting to public self-hosted LiveKit.
- LiveKit Cloud dashboard no-consumption confirmation.

## 8. Next Round Recommendation

方案B的配置和验收准备已补齐，可以继续做第六轮多人会议的真实联调。

Recommended order:

1. Prepare cloud server and domains.
2. Deploy self-hosted LiveKit from `deployment/self-hosted-livekit/`.
3. Configure backend with `backend.env.selfhost.example`.
4. Run `npm run check:livekit-env` on backend host.
5. Deploy Web with `web.env.selfhost.example`.
6. Test robot-web-publisher video.
7. Test two Web users watching.
8. Install Android APK and test robot camera.
9. Test controller/viewer control permissions.
10. Confirm LiveKit Cloud shows no usage for the test window.
