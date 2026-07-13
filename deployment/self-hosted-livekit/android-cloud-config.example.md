# Android Robot Cloud Config Example

Android only needs the backend URL:

```text
backendUrl=https://api.example.com
robotId=robot-001
roomName=robot-room-001
```

Rules:

- Android does not save `LIVEKIT_API_SECRET`.
- Android gets `liveKitUrl` and token from backend `/api/robots/join`.
- Android/phone public tests must use trusted HTTPS/WSS certificates.
- Self-signed certificates can make Android or mobile browsers fail to connect.
- Android 8.1 tests should verify:
  - `INTERNET` permission is present.
  - Camera permission is granted.
  - The robot can reach `https://api.example.com/health`.
  - The robot can reach `wss://livekit.example.com`.
  - Foreground/background switching does not permanently stop camera publishing.
  - Camera permission can recover after denial by changing Android app settings.
