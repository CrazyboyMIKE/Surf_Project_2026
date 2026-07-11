# Android Robot Self-hosted LiveKit Config Example

Android robot app does not need LiveKit API key or LiveKit API secret.

The operator should enter:

```text
backendUrl=https://api.example.com
robotId=robot-001
roomName=robot-room-001
```

Flow:

1. Android calls backend `POST /api/robots/join`.
2. Backend signs a LiveKit token using backend-only `LIVEKIT_API_SECRET`.
3. Android receives `liveKitUrl` and `token`.
4. Android connects to `wss://livekit.example.com`.
5. Android publishes camera video.

Requirements:

- Android 8.1 robot must reach public `https://api.example.com`.
- Android 8.1 robot must reach public `wss://livekit.example.com`.
- Production certificates should be trusted by Android.
- Self-signed certificates can cause connection failure.
- Do not store or display `LIVEKIT_API_SECRET` in Android.
