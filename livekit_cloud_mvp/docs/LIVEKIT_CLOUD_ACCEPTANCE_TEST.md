# LiveKit Cloud Acceptance Test

Use this checklist for real LiveKit Cloud validation.

Do not mark tests as passed unless they were run against a real LiveKit Cloud project.

## Checklist

1. [ ] LiveKit Cloud project is created.
2. [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured on backend only.
3. [ ] Web, robot-web-publisher, and Android do not contain LiveKit API secret.
4. [ ] `GET https://api.example.com/health` returns `{ "ok": true }`.
5. [ ] Backend can generate LiveKit Cloud token.
6. [ ] Web client joins a room.
7. [ ] robot-web-publisher joins the same room as robot.
8. [ ] robot-web-publisher publishes computer camera.
9. [ ] Two Web users see the same robot video.
10. [ ] Chat works between Web users.
11. [ ] Viewer can manually turn microphone on/off after browser permission is granted.
12. [ ] Viewer can manually turn camera on/off after browser permission is granted.
13. [ ] Web user can request controller ownership.
14. [ ] Viewer robot-control attempt is rejected.
15. [ ] `1000 stop` test passes.
16. [ ] `1002` test passes if real robot movement is connected in a later round; otherwise confirm mock log/display only.
17. [ ] `1003` test passes if real robot movement is connected in a later round; otherwise confirm mock log/display only.
18. [ ] Android true device joins the room.
19. [ ] Android true device publishes camera.
20. [ ] Phone 4G/5G can watch Web robot video.
21. [ ] LiveKit Cloud dashboard usage is checked.
22. [ ] Issues are recorded with timestamp, room name, participant type, browser/device, and logs without secrets.

## Evidence To Capture

- Backend health check result.
- Backend startup mode showing LiveKit Cloud mode without secret values.
- Web screenshot showing LiveKit connected and robot video.
- robot-web-publisher status showing camera published.
- Two Web users in the same room.
- Viewer microphone/camera buttons enabled after LiveKit connects.
- Chat message in both windows.
- Controller status and viewer rejection.
- `1000 stop` mock receipt.
- Android camera publishing screenshot or log.
- LiveKit Cloud usage page screenshot without secrets.
