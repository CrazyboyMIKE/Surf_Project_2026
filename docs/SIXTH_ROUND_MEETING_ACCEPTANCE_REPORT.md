# Sixth Round Meeting Acceptance Report

## 1. Test Date

- Date: 2026-07-10
- Timezone: Asia/Shanghai
- Scope: Sixth-round multi-user meeting media acceptance, plus robot video/chat/control regression.

## 2. Overall Result

Current code is partially ready for the sixth-round meeting MVP, but it has not fully passed real-environment acceptance.

- Passed: project structure, backend grant logic, backend HTTP/WebSocket control regression, Node/Web/robot-web-publisher builds, Android reproducible debug build, static Web meeting-media review, security scans.
- Failed / incomplete: Android robot remote controller-audio connected/disconnected status is not event-driven in code and was not verified on a real device.
- Not verified: real LiveKit audio/video path, real browser microphone/camera permission behavior, robot-web-publisher camera publishing, Android device camera publishing, Android speaker playback, public HTTPS/WSS deployment.

Final sign-off: not fully accepted for sixth-round real multi-user meeting standard until real LiveKit credentials, browser devices, Android device/robot, and public environment tests are completed.

## 3. Test Environment

- Host OS: Darwin 25.3.0 arm64
- Node.js: v25.8.1
- npm: 11.11.0
- Java: OpenJDK 22.0.2
- Android SDK path used: `/Users/linziwei/Library/Android/sdk`
- Gradle wrapper: `android-robot/gradle/wrapper/gradle-wrapper.properties`, Gradle 9.6.1
- LiveKit credentials: not provided in this environment
- Android device/robot: no connected device reported by `adb devices`
- Public deployment: not available in this environment

## 4. Project Structure Check

Passed.

- `backend/`: exists
- `web-client/`: exists
- `robot-web-publisher/`: exists
- `android-robot/`: exists
- `docs/`: exists
- `docs/SIXTH_ROUND_MEETING_TEST_PLAN.md`: exists
- `docs/SIXTH_ROUND_MEETING_REPORT.md`: exists
- `docs/FIFTH_ROUND_ACCEPTANCE_REPORT.md`: exists
- `docs/LIVEKIT_SETUP.md`: exists
- `docs/ANDROID_ROBOT_SETUP.md`: exists

Command:

```bash
ls -d backend web-client robot-web-publisher android-robot docs docs/SIXTH_ROUND_MEETING_TEST_PLAN.md docs/SIXTH_ROUND_MEETING_REPORT.md docs/FIFTH_ROUND_ACCEPTANCE_REPORT.md docs/LIVEKIT_SETUP.md docs/ANDROID_ROBOT_SETUP.md
```

Result: passed.

## 5. Commands Run

| Area | Command | Result | Notes |
| --- | --- | --- | --- |
| backend | `npm run lint` | Passed | TypeScript no-emit check passed. |
| backend | `npm run test` | Passed | Build plus `commandValidation` tests passed. |
| backend | `npm run build` | Passed | TypeScript build passed. |
| web-client | `npm run lint` | Passed | TypeScript no-emit check passed. |
| web-client | `npm run test` | Passed | TypeScript no-emit check passed. |
| web-client | `npm run build` | Passed | Vite build passed; large LiveKit chunk warning only. |
| robot-web-publisher | `npm run lint` | Passed | TypeScript no-emit check passed. |
| robot-web-publisher | `npm run test` | Passed | TypeScript no-emit check passed. |
| robot-web-publisher | `npm run build` | Passed | Vite build passed; large LiveKit chunk warning only. |
| android-robot | `./gradlew test` | Passed after elevated local Gradle access | Initial sandbox run failed on `~/.gradle` lock access. Elevated run passed; no unit test sources. |
| android-robot | `./gradlew assembleDebug` | Passed after elevated local Gradle access | APK generated at `app/build/outputs/apk/debug/app-debug.apk`, about 50 MB. |
| android-robot | `adb devices` | Passed, no devices | Initial sandbox run could not start ADB daemon; elevated run showed no connected devices. |
| repo | `git diff --check` | Passed | No whitespace errors. |
| backend grant | local token decode script | Passed | Verified `canPublish` grants for robot/controller/viewer with viewer publish off/on. |
| backend API/WS | local mock API/WebSocket script | Passed after elevated localhost access | Initial sandbox run failed with `fetch failed`; elevated run passed all assertions. |
| security | `.env` and secret scans | Passed | No real `.env`; no `LIVEKIT_API_SECRET` in Web/Android source or dist. |

## 6. Backend Grant Acceptance

Passed for code and local token decoding.

Verified implementation points:

- `backend/.env.example` includes `ALLOW_VIEWER_PUBLISH=false`.
- `backend/src/config.ts` reads `ALLOW_VIEWER_PUBLISH`, defaulting to false.
- `backend/src/services/liveKitTokenService.ts` generates role-aware `mediaPermissions`.
- `backend/src/http/routes.ts` returns `mediaPermissions` on Web join, robot join, control request, and control release.
- Backend startup logs token mode and viewer publish mode without logging secrets.

Decoded real-token grant behavior using local fake credentials:

| Role | `ALLOW_VIEWER_PUBLISH=false` | `ALLOW_VIEWER_PUBLISH=true` |
| --- | --- | --- |
| robot | `roomJoin=true`, `canPublish=true`, `canSubscribe=true` | same |
| controller | `roomJoin=true`, `canPublish=true`, `canSubscribe=true` | same |
| viewer | `roomJoin=true`, `canPublish=false`, `canSubscribe=true` | `roomJoin=true`, `canPublish=true`, `canSubscribe=true` |

Secret handling:

- API responses include LiveKit tokens by design, but do not include `LIVEKIT_API_SECRET`.
- No backend log line printed token values or API secrets during the local mock API/WS test.

## 7. Web Client Media Acceptance

Passed by static review and build. Real browser media behavior was not verified.

Verified implementation points:

- `MediaControls` contains manual microphone and camera toggles.
- Buttons are enabled only when `tokenMode === "livekit"`, LiveKit is connected, and `mediaPermissions.canPublish` allows publishing.
- Viewer default state shows `viewer locked` and disables mic/camera buttons when backend returns `canPublish=false`.
- Local microphone/camera are not opened automatically; `createLocalAudioTrack()` and `createLocalVideoTrack()` are only called inside user-triggered toggle functions.
- UI state can show `off`, `starting`, `on`, `permission denied`, `device not found`, `not allowed`, and `error`.
- `ParticipantsPanel` excludes robot participants and displays non-robot remote users, role, audio state, video state, remote video tile, and remote audio element.
- `Enable sound` button is shown when LiveKit reports audio playback is blocked.
- `useLiveKitRoom` subscribes to remote tracks with `autoSubscribe: true`.

Not verified:

- Real browser microphone permission prompt.
- Real browser camera permission prompt.
- Permission-denied UI with actual browser denial.
- Device-not-found UI with missing hardware.
- Bob/Charlie hearing Alice over real LiveKit.
- Bob/Charlie seeing Alice camera over real LiveKit.
- Viewer publish bypass rejection by actual LiveKit server.

## 8. Robot Video Regression

Passed by static review; real video rendering was not verified.

Verified implementation points:

- `useLiveKitRoom` searches remote LiveKit participants whose identity/name contains `robot`.
- Robot participant video is kept separate from non-robot participant tiles.
- `RobotVideo` renders the robot track in the main robot-video area when present.
- Robot offline placeholder: `Robot offline`.
- Robot online but no track while connected: `Waiting for robot video`.
- Mock mode placeholder remains explicit: `Robot video will appear here`.

Not verified:

- Real robot-web-publisher camera visible in Web.
- Real Android robot camera visible in Web.
- Robot video staying visible while controller camera and audio are active.

## 9. Android Robot App Acceptance

Partially passed.

Passed by static review and build:

- `android-robot/` exists.
- `minSdk 27`, so Android 8.1 / API 27 is supported.
- Manifest includes `INTERNET`, `CAMERA`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`.
- Android app calls backend `POST /api/robots/join` and uses returned `liveKitUrl` and token.
- App inputs/configures `backendUrl`, `robotId`, and `roomName`.
- Default backend URL is LAN-style `http://192.168.1.100:3001`, not hard-coded localhost.
- `backendUrl` accepts `http://` or `https://`.
- Camera publishing uses `room.localParticipant.setCameraEnabled(true)`.
- Robot microphone is default off; it is enabled only when the operator checks `Publish microphone audio`.
- Robot control remains mock/log only through `MockRobotControlAdapter`; no real movement, vendor navigation SDK, or MQTT path was found.
- `./gradlew test` passed after sandbox elevation, though there are no unit test sources.
- `./gradlew assembleDebug` passed after sandbox elevation and generated a debug APK.

Failed / incomplete:

- `LiveKitRobotClient.kt` sets `Remote audio subscribed; waiting for controller audio`, but no code-level event listener was found that updates status specifically when a controller audio track connects or disconnects.

Not verified:

- APK install on Android device.
- App launch on Android 8.1/API 27 hardware.
- Android camera permission prompt.
- Android camera publishing to real LiveKit.
- Android speaker playback of controller audio.
- Remote controller audio connected/disconnected status on device.

Reason: `adb devices` returned no connected devices.

## 10. Robot Web Publisher Acceptance

Passed by build and static review. Real camera publishing was not verified.

Verified implementation points:

- `robot-web-publisher/` exists.
- `npm run lint`, `npm run test`, and `npm run build` passed.
- App inputs `roomName` and `robotId`.
- App calls `POST /api/robots/join`.
- App connects to LiveKit only when backend returns real `tokenMode=livekit`.
- App opens the local browser camera only after `Join and publish`.
- App publishes a camera track with `Track.Source.Camera`.
- App supports `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.

Not verified:

- Browser camera permission prompt.
- Actual camera capture.
- Actual LiveKit publishing.
- Web client seeing the robot-web-publisher video.

Reason: no real LiveKit credentials and no browser media test were run.

## 11. Chat And Control Permission Regression

Passed with local mock backend API/WebSocket script.

Verified:

- `GET /health` returned OK.
- Alice joined as controller.
- Bob requested controller while Alice was active and became viewer.
- WebSocket chat from Alice broadcast to Bob.
- Bob viewer could not send `robot_control` through a direct WebSocket message; backend returned `NOT_CONTROLLER`.
- Controller control was rejected while robot was offline; backend returned `ROBOT_OFFLINE`.
- `POST /api/robots/join` made robot online and returned robot publish permissions.
- Controller successfully sent `1002`, `1003`, and `1000`.
- Backend rejected `1001`.
- Backend rejected `9999`.
- Control release refreshed Alice to viewer media permissions.
- Bob control request refreshed Bob to controller media permissions.

This confirms the service-side control permission checks still exist and are not only frontend button disabling.

## 12. Security Acceptance

Passed for local static checks.

Verified:

- No real `.env`, `.env.local`, or `.env.production` files were found.
- `.gitignore` includes `.env`, `.env.local`, and `.env.production`.
- Only `.env.example` files are tracked for environment examples.
- `LIVEKIT_API_SECRET` appears only in backend config/examples/docs, not in Web source, Web dist, robot-web-publisher source/dist, or Android source.
- Android source contains no `API_SECRET`, `apiSecret`, or secret value references.
- No obvious token/secret logging was found. The only token-related log is `LiveKit token mode`, which does not print token values.
- No `eval`, `new Function`, unsafe deserialization, or pickle-style use was found in app source.
- No vendor navigation SDK, MQTT robot control, or real hardware movement path was found in app source.

Notes:

- API responses return LiveKit room tokens to participants by design.
- The local token decode command used fake local validation credentials and did not print JWT strings.

## 13. Actual Manual Test Result

Manual-like local mock test was run through scripts:

- backend started locally on `http://127.0.0.1:3107` with `LIVEKIT_URL=mock://livekit`, `ALLOW_VIEWER_PUBLISH=false`, and `MOCK_ROBOT_ONLINE=false`.
- HTTP endpoints and WebSocket room/chat/control flow were verified.
- Backend was stopped after the test.

Real manual scenarios from `docs/SIXTH_ROUND_MEETING_TEST_PLAN.md` were not run:

- Scenario A, controller microphone: not verified.
- Scenario B, controller camera: not verified.
- Scenario C, viewer default cannot publish: token grant verified; real LiveKit bypass test not verified.
- Scenario D, `ALLOW_VIEWER_PUBLISH=true`: token grant verified; real LiveKit room test not verified.
- Scenario E, browser permission denial: not verified.
- Scenario F, control permission regression: verified locally through API/WebSocket script.

## 14. Untested Items And Reasons

| Item | Status | Reason |
| --- | --- | --- |
| Multiple Web users in real LiveKit room | Not verified | No real LiveKit credentials/environment. |
| Controller microphone heard by Web viewers | Not verified | No real LiveKit and no browser media permission test. |
| Controller camera seen by Web viewers | Not verified | No real LiveKit and no browser media permission test. |
| Viewer publish blocked by real LiveKit grant | Not fully verified | Grant decoded locally; no real LiveKit publish attempt. |
| `ALLOW_VIEWER_PUBLISH=true` real viewer publishing | Not fully verified | Grant decoded locally; no real LiveKit room test. |
| Robot-web-publisher actual camera publishing | Not verified | No real LiveKit/browser camera test. |
| Android robot camera publishing | Not verified | No connected Android device/robot and no real LiveKit. |
| Android playback of controller audio | Not verified | No connected Android device/robot and no real LiveKit. |
| Android remote audio connected/disconnected UI | Failed / not verified | No device test; code lacks track-event-specific status updates. |
| Public HTTPS/WSS deployment | Not verified | No deployed backend/web/public domain. |
| Real robot hardware behavior | Not applicable | Sixth-round scope explicitly avoids real movement and vendor SDK/MQTT. |

## 15. Blocking Issues

1. No real `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` were available, so real multi-user audio/video could not be accepted.
2. No connected Android device or robot was available, so APK install, Android camera publishing, and Android speaker playback could not be accepted.
3. No public HTTPS/WSS deployment was available, so online meeting behavior could not be accepted.
4. Android remote controller-audio status is not fully implemented/verified as connected/disconnected per remote audio track.

## 16. Non-Blocking Issues / Risks

1. Web and robot-web-publisher Vite builds warn that LiveKit chunks exceed 500 KB. Builds pass; this is not a functional blocker for MVP.
2. Gradle reports deprecated features that will be incompatible with Gradle 10. Build passes today.
3. `./gradlew test` passes but reports no unit test sources. Android build reproducibility is covered, behavior is not.
4. Media permission behavior is mostly protected by LiveKit token grants, but real publish attempts against a LiveKit server are still required.
5. Existing LiveKit tokens are not revoked in this acceptance test. If role changes outside the explicit request/release flow, token lifetime and reconnect behavior should be reviewed before production hardening.

## 17. Final Acceptance Decision

Sixth-round meeting capability is not fully accepted yet.

Accepted locally:

- Backend role-based LiveKit grant generation.
- Viewer publish default lock at token-grant level.
- `ALLOW_VIEWER_PUBLISH=true` grant behavior by token decoding.
- Web media UI implementation by static review and build.
- Robot video/chat/control regression by static review and local mock API/WebSocket script.
- Android debug build reproducibility.
- Basic security checks.

Not accepted until real-environment verification:

- Real LiveKit multi-user audio/video.
- Real controller microphone/camera publishing.
- Real viewer receive/playback behavior.
- Real robot-web-publisher camera publishing.
- Real Android robot camera publishing.
- Real Android controller-audio playback.
- Public HTTPS/WSS deployment behavior.

## 18. Next Steps

1. Provide real LiveKit credentials only in backend local/production environment, never in Web or Android config.
2. Run `docs/SIXTH_ROUND_MEETING_TEST_PLAN.md` with three Web users and robot-web-publisher.
3. Connect an Android 8.1/API 27+ device or robot, install the generated APK, and verify camera publish plus controller-audio playback.
4. Add or verify Android remote audio track event handling so the UI can show controller audio connected/disconnected from actual track subscription state.
5. Repeat viewer publish tests with `ALLOW_VIEWER_PUBLISH=false` and `ALLOW_VIEWER_PUBLISH=true` against real LiveKit.
6. Run the same scenarios in the public HTTPS/WSS deployment environment before marking the sixth round complete.
