# Web Client

React + TypeScript web client for the robot remote-presence MVP.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Behavior

- Users join a room as viewer or request controller.
- Chat is sent over WebSocket.
- Control buttons are disabled unless the current user is controller.
- The Web client connects to LiveKit when backend returns a real LiveKit token.
- Robot video is selected from remote participants whose identity/name contains `robot`.
- If no robot video is available, the page shows `Robot video will appear here`.
