# TURN Troubleshooting Guide

日期：2026-07-12（Asia/Shanghai）

## 1. When TURN Is Needed

TURN is needed when direct WebRTC media cannot connect.

Common cases:

- Phone user is on 4G/5G and joins the room but sees no video.
- User is on campus Wi-Fi or company network.
- Robot is behind strict NAT.
- WebSocket and LiveKit connection show connected, but audio/video does not flow.
- UDP `50000-60000` is blocked by cloud security group, server firewall, or user network.

TURN is not the first step. First verify HTTPS/WSS, backend token generation, LiveKit startup, Redis, and UDP firewall ports.

## 2. STUN vs TURN

- STUN helps clients discover public network addresses and can enable direct peer/media connectivity.
- TURN relays media through a server when direct connectivity fails.

TURN usually fixes harder NAT cases, but it increases bandwidth cost because media traffic goes through the TURN server.

## 3. How To Judge NAT/TURN Problems

Signs:

- Web user can open `https://web.example.com`.
- Backend WebSocket is connected.
- LiveKit status is connected.
- Robot is online.
- No video appears on 4G/5G, campus, or company network.
- The same room works on a simpler Wi-Fi network.

Checks:

1. Verify cloud security group opens `50000-60000/udp`.
2. Verify server firewall opens `50000-60000/udp`.
3. Verify `7881/tcp` is open for ICE TCP fallback.
4. Try two users from normal home Wi-Fi.
5. Try one user from 4G/5G.
6. If only strict networks fail, plan TURN.

## 4. Self-hosted TURN Basic Approach

Options:

- Enable LiveKit TURN config if appropriate for your deployment.
- Deploy coturn on `turn.example.com`.
- Use trusted TLS certs for `turns://`.
- Open TURN ports in cloud security group and server firewall.

Do not put TURN passwords in public Web or Android source code. TURN credentials should be generated or delivered safely, not committed as static secrets.

## 5. Cost Notes

TURN can significantly increase bandwidth usage because media relays through your server.

Before production:

- Estimate concurrent viewers.
- Test 3 users, 5 users, weak network, and mobile network.
- Monitor LiveKit and TURN bandwidth.

## 6. What To Record

- Network type: home Wi-Fi, 4G/5G, campus, company.
- Browser and device.
- Backend status.
- WebSocket status.
- LiveKit status.
- Whether robot is online.
- Whether video appears.
- Whether UDP ports are open.
- Whether TURN was enabled.
