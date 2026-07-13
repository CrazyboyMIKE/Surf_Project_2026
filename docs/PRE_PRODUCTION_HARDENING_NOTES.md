# Pre-production Hardening Notes

日期：2026-07-12（Asia/Shanghai）

These are not required for the current minimum cloud loop, but should be considered before broader production use.

## 1. Access Control

- Add a simple room password or test access gate.
- Avoid publishing public test URLs without restrictions.
- Keep viewer/controller role checks on backend.

## 2. Persistence

Current backend room state is in memory.

Impact:

- Restarting backend clears rooms.
- Restarting backend clears controller state.
- Restarting backend clears robot online state.

Before production, consider persistent room/session state if continuity matters.

## 3. Logs And Monitoring

Monitor:

- LiveKit server logs.
- Redis health.
- Backend request and WebSocket errors.
- Nginx access/error logs.
- Android robot app logs.

Do not log tokens, API secrets, TURN passwords, or media content.

## 4. TURN Stability And Cost

- Test whether TURN is needed on 4G/5G, campus, and company networks.
- Estimate TURN relay bandwidth.
- Watch cloud bandwidth billing.
- Keep TURN credentials out of public source.

## 5. Android Long-running Tests

Test:

- 30 minute camera publishing.
- 2 hour camera publishing.
- Device heat.
- Network drop and reconnect.
- Foreground/background switching.
- Camera permission recovery.
- Camera occupied by vendor app.

## 6. Meeting Load Tests

Before wider release, test:

- 3 participants.
- 5 participants.
- Weak network.
- Mobile network.
- One robot publisher plus multiple Web viewers.

## 7. Robot Control Safety

Do not enable real movement until there is:

- Feature flag for real hardware control.
- Emergency stop.
- Low speed defaults.
- Physical test area.
- Human supervisor.
- Confirmed whitelist: `1002`, `1003`, `1000`.
