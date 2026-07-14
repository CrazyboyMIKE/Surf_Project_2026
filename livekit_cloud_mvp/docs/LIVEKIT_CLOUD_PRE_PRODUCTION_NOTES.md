# LiveKit Cloud Pre-Production Notes

These are not required for the MVP minimum loop, but should be considered before wider testing or production.

## Cost And Usage

- LiveKit Cloud consumes usage quota or billable minutes.
- Monitor LiveKit Cloud dashboard during tests.
- Stop test publishers and close unused rooms when done.

## Access Control

- The MVP has no login system.
- Public deployments should add a simple room password, invite code, or temporary access restriction.

## State Persistence

- Current room, role, and controller state is in memory.
- Service restart clears this state.
- Production should add persistence or a deliberate recovery flow.

## Logs And Monitoring

- Keep backend logs.
- Keep Nginx access/error logs.
- Do not log tokens, secrets, passwords, or media content.

## Android Long-Running Tests

Before using a robot in the field, test:

- heat and battery behavior
- disconnect/reconnect
- foreground/background switching
- camera permission recovery
- camera occupied by vendor software
- long camera publishing sessions

## Meeting Scale Tests

Later tests should cover:

- 3 Web users
- 5 Web users
- weak Wi-Fi
- mobile network viewing
- controller mic/camera enabled

## Real Robot Movement

Real robot motion is not implemented here. Before adding it:

- keep `1000 stop` as the most important command
- require explicit operator action
- preserve viewer denial
- add emergency-stop validation
- test with the robot lifted or physically constrained first
