import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { loadConfig } from "./config.js";
import { createApiRouter } from "./http/routes.js";
import { LiveKitTokenService } from "./services/liveKitTokenService.js";
import { RoomStore } from "./state/roomStore.js";
import { attachWebSocketServer } from "./ws/webSocketServer.js";

const config = loadConfig();
const app = express();
const server = createServer(app);
const roomStore = new RoomStore({ mockRobotOnline: config.mockRobotOnline });
const liveKitTokenService = new LiveKitTokenService({
  liveKitUrl: config.liveKitUrl,
  apiKey: config.liveKitApiKey,
  apiSecret: config.liveKitApiSecret,
  tokenTtl: config.liveKitTokenTtl
});
const webSocketHub = attachWebSocketServer(server, roomStore);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    }
  })
);
app.use(express.json({ limit: "32kb" }));

app.use(
  createApiRouter({
    roomStore,
    liveKitTokenService,
    broadcastRoleUpdate: webSocketHub.broadcastRoleUpdate,
    broadcastRobotStatus: webSocketHub.broadcastRobotStatus
  })
);

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: "Route not found"
  });
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error.message);
  res.status(500).json({
    ok: false,
    code: "INTERNAL_ERROR",
    message: "Internal server error"
  });
});

server.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
  console.log(`WebSocket listening on ws://localhost:${config.port}/ws`);
  console.log(`LiveKit token mode: ${liveKitTokenService.tokenMode}`);
});
