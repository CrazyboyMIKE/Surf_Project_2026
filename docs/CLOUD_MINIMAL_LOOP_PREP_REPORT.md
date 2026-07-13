# Cloud Minimal Loop Prep Report

Date: 2026-07-12

This report covers the Scheme B repair work for self-hosted LiveKit cloud testing readiness. It does not claim that a real cloud deployment, real domain, real certificate, real robot device, or real public-network video test has passed.

## Summary

This round completed the missing preparation needed before a real self-hosted cloud minimum loop test:

- Added self-hosted LiveKit cloud deployment templates for LiveKit, Redis, Nginx, backend, Web, robot-web-publisher, and Android configuration.
- Documented the required cloud firewall/security-group ports, including direct UDP media ports that do not pass through Nginx.
- Added TURN troubleshooting guidance for 4G/5G, campus networks, company networks, and cross-NAT failures.
- Improved robot-web-publisher error messages for camera, backend token, WebSocket/API config, LiveKit connection failures, and LiveKit track publish failures.
- Expanded Android build and device deployment instructions.
- Added cloud deployment checklists, a step log template, and pre-production hardening notes.
- Updated the self-hosted acceptance test to explicitly include `1002`, `1003`, and `1000 stop`.

## Files Changed

- `deployment/self-hosted-livekit/README.md`: Expanded Scheme B overview, file index, firewall requirements, HTTPS/WSS warnings, and minimum cloud loop goal.
- `deployment/self-hosted-livekit/docker-compose.example.yml`: Clarified placeholder credentials, LiveKit + Redis services, and firewall requirements.
- `deployment/self-hosted-livekit/livekit.yaml.example`: Added clearer Redis, RTC, UDP media, and TURN comments.
- `deployment/self-hosted-livekit/nginx-livekit.example.conf`: Clarified WSS proxying, trusted certificate requirement, and UDP media port handling.
- `deployment/self-hosted-livekit/nginx-backend.example.conf`: Added backend HTTPS/WSS reverse-proxy example for `api.example.com`.
- `deployment/self-hosted-livekit/nginx-web.example.conf`: Added static Web HTTPS example for `web.example.com`.
- `deployment/self-hosted-livekit/backend.env.cloud.example`: Added production backend env placeholder template.
- `deployment/self-hosted-livekit/web.env.cloud.example`: Added Web env placeholder template.
- `deployment/self-hosted-livekit/robot-web-publisher.env.cloud.example`: Added robot publisher env placeholder template.
- `deployment/self-hosted-livekit/android-cloud-config.example.md`: Added Android cloud backend URL and certificate guidance.
- `deployment/self-hosted-livekit/CLOUD_DEPLOYMENT_RUNBOOK.md`: Added step-by-step cloud deployment runbook and LiveKit Cloud no-usage confirmation.
- `deployment/self-hosted-livekit/CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`: Added deployment checkbox log template.
- `docs/SELF_HOSTED_LIVEKIT_DEPLOYMENT_GUIDE.md`: Updated Scheme B deployment guide with new templates and cloud loop goal.
- `docs/SELF_HOSTED_LIVEKIT_ACCEPTANCE_TEST.md`: Reworked self-hosted acceptance checklist, including `1000 stop`, Android, phone 4G/5G, and LiveKit Cloud no-usage confirmation.
- `docs/TURN_TROUBLESHOOTING_GUIDE.md`: Added NAT/TURN diagnosis and cost/security notes.
- `docs/CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md`: Added user-facing cloud deployment step log.
- `docs/PRE_PRODUCTION_HARDENING_NOTES.md`: Added future hardening notes before production use.
- `android-robot/README.md`: Expanded Android SDK, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `local.properties`, Gradle, adb, install, and logcat instructions.
- `robot-web-publisher/src/main.tsx`: Added categorized runtime, backend, WebSocket, LiveKit, and camera error messages.

## Completed Cloud-Test Prerequisites

- Self-hosted LiveKit template exists and includes:
  - `port: 7880`
  - Redis config
  - `rtc.tcp_port: 7881`
  - `rtc.port_range_start: 50000`
  - `rtc.port_range_end: 60000`
  - `rtc.use_external_ip: true`
  - placeholder API key/secret only
  - TURN comments and when to enable TURN
- Cloud firewall/security-group requirements are documented:
  - `443/tcp` for HTTPS/WSS
  - `7880/tcp` for LiveKit API/WebSocket when exposed directly
  - `7881/tcp` for ICE TCP fallback
  - `50000-60000/udp` for WebRTC media
  - extra TURN ports if TURN is enabled
- Nginx examples now cover:
  - LiveKit WSS reverse proxy
  - backend API and `/ws` WebSocket proxy
  - static Web client hosting
  - trusted certificate placeholders
  - no self-signed certificates for Android/phone public tests
  - direct cloud security-group/firewall opening for LiveKit UDP media ports
- Environment examples now distinguish:
  - LiveKit Server URL
  - Backend API URL
  - Web frontend URL
  - WebSocket URL
  - Android backend URL
- `robot-web-publisher` now gives actionable errors for:
  - camera permission denied
  - camera not found
  - unsupported browser camera API
  - backend token request failure
  - API/WS address format problems
  - LiveKit connection failure
  - LiveKit track publish failure
- Android build and install docs now explain:
  - SDK setup
  - `ANDROID_HOME`
  - `ANDROID_SDK_ROOT`
  - `local.properties`
  - `./gradlew test`
  - `./gradlew assembleDebug`
  - `adb devices`
  - `adb install`
  - `adb logcat`

## Recommended Repairs Completed

- Added a cloud deployment runbook so the user can execute deployment step by step.
- Added a deployment step log template so failed cloud tests can be recorded without leaking secrets.
- Added TURN troubleshooting guidance instead of treating all public-network video failures as application bugs.
- Added a pre-production hardening note that separates MVP readiness from production readiness.
- Added explicit `1000 stop` acceptance coverage alongside `1002` and `1003`.
- Added LiveKit Cloud no-usage confirmation to the cloud runbook and acceptance checklist.

## Pre-Production Items Documented

These are not required for the current minimum cloud loop, but are now documented as future hardening work:

- Room password or simple access gate.
- Persistent room/controller state instead of in-memory-only state.
- LiveKit, backend, and Nginx log monitoring.
- TURN stability and bandwidth-cost evaluation.
- Android long-running true-device testing.
- Heat, reconnect, foreground/background, and camera permission recovery tests.
- 3-user, 5-user, weak-network, and mobile-network meeting tests.

## Validation Commands

Backend:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.

Web client:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed. Vite reported chunk-size warnings only.

Robot web publisher:

- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed. Vite reported chunk-size warnings only.

Android robot:

- `ANDROID_HOME=/Users/linziwei/Library/Android/sdk ANDROID_SDK_ROOT=/Users/linziwei/Library/Android/sdk ./gradlew test`: passed. Unit-test tasks were mostly `NO-SOURCE`.
- `ANDROID_HOME=/Users/linziwei/Library/Android/sdk ANDROID_SDK_ROOT=/Users/linziwei/Library/Android/sdk ./gradlew assembleDebug`: passed after rerunning outside the filesystem sandbox so Gradle could access `~/.gradle`. Gradle reported deprecation warnings for future Gradle 10 compatibility only.

Safety checks:

- `find . -name '.env' -o -name '.env.local' -o -name '.env.production'`: passed, no real env file was found.
- `git diff --check`: passed.
- Secret scan for `LIVEKIT_API_SECRET` in Web, robot-web-publisher, and Android source/build outputs: passed, no matches.
- High-confidence secret scan for private keys and common cloud/API key patterns: passed with expected documentation-command hits only. No real secret, JWT, or private key was found.

## Not Run Or Not Proven

These require real external resources and were not claimed as passed:

- Real cloud server deployment.
- Real DNS records for `api.example.com`, `web.example.com`, and `livekit.example.com`.
- Real trusted HTTPS certificates.
- Real self-hosted LiveKit public WSS test.
- Real cloud firewall/security-group validation.
- Real robot-web-publisher camera publishing through a self-hosted cloud LiveKit Server.
- Two remote Web users watching cloud robot video.
- Phone 4G/5G public-network viewing.
- TURN fallback test.
- Android robot true-device camera publishing through the cloud LiveKit Server.
- LiveKit Cloud dashboard no-usage confirmation.

## Current Readiness

The project is now ready to start a real cloud minimum loop test from documentation and templates.

This means:

- Cloud test preparation is complete.
- Local code/build checks passed.
- Required templates and checklists are present.
- Real cloud deployment is still pending.
- Real video-chain acceptance is still pending.
- Android true-device acceptance is still pending.

Do not mark cloud testing as passed until the user has a real server, real domains, trusted certificates, firewall ports, self-hosted LiveKit API key/secret, and at least one real camera publisher.

## User Next Steps

1. Prepare a cloud server and point real DNS records at it.
2. Replace every `example.com` and `YOUR_*` placeholder in copied deployment files.
3. Open cloud security-group and host firewall ports:
   - `443/tcp`
   - `7880/tcp` if exposing LiveKit directly
   - `7881/tcp`
   - `50000-60000/udp`
4. Install trusted HTTPS certificates, preferably with Let's Encrypt.
5. Start Redis and LiveKit using the self-hosted templates.
6. Deploy backend with `LIVEKIT_URL=wss://your-livekit-domain`, backend-only key/secret, and correct `CORS_ORIGIN`.
7. Deploy Web and robot-web-publisher with public API/WSS backend URLs.
8. Run `docs/CLOUD_DEPLOYMENT_STEP_LOG_TEMPLATE.md` while testing.
9. First test with robot-web-publisher camera.
10. Then test two Web users watching, chatting, controller permissions, `1002`, `1003`, and `1000 stop`.
11. Then test Android true-device camera publishing.
12. Finally test phone 4G/5G viewing; if join succeeds but video does not appear, use `docs/TURN_TROUBLESHOOTING_GUIDE.md`.
