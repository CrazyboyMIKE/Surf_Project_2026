import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { loadConfig } from "./config.js";
import { createAdminRouter } from "./http/adminRoutes.js";
import { createApiRouter } from "./http/routes.js";
import { createRobotControlAdapter } from "./robotControl/adapter.js";
import { LiveKitTokenService } from "./services/liveKitTokenService.js";
import { RoomStore } from "./state/roomStore.js";
import { attachWebSocketServer } from "./ws/webSocketServer.js";

const config = loadConfig();
const app = express();
const server = createServer(app);
const roomStore = new RoomStore({ mockRobotOnline: config.mockRobotOnline });
const robotControlAdapter = createRobotControlAdapter(config.robotControl);
const liveKitTokenService = new LiveKitTokenService({
  liveKitUrl: config.liveKitUrl,
  apiKey: config.liveKitApiKey,
  apiSecret: config.liveKitApiSecret,
  tokenTtl: config.liveKitTokenTtl
});
const webSocketHub = attachWebSocketServer(server, roomStore, robotControlAdapter, config.keyboardControl);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

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
    keyboardControlConfig: config.keyboardControl,
    stopKeyboardControl: webSocketHub.stopKeyboardControl,
    broadcastRoleUpdate: webSocketHub.broadcastRoleUpdate,
    broadcastRobotStatus: webSocketHub.broadcastRobotStatus
  })
);

app.use(
  createAdminRouter({
    roomStore,
    adminEnabled: config.adminEnabled,
    adminToken: config.adminToken,
    stopKeyboardControl: webSocketHub.stopKeyboardControl,
    broadcastRoleUpdate: webSocketHub.broadcastRoleUpdate,
    broadcastRobotStatus: webSocketHub.broadcastRobotStatus,
    broadcastRoomUpdate: webSocketHub.broadcastRoomUpdate
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
  const wsBaseUrl = config.publicBaseUrl.replace(/^http/, "ws").replace(/\/$/, "");
  console.log(`Backend listening on ${config.publicBaseUrl}`);
  console.log(`WebSocket listening on ${wsBaseUrl}/ws`);
  console.log(`Node environment: ${config.nodeEnv}`);
  console.log(`LiveKit token mode: ${liveKitTokenService.tokenMode}`);
  console.log("Viewer media publishing: enabled");
  console.log(`Robot control mode: ${robotControlAdapter.mode}`);
  console.log(`Robot real control: ${config.robotControl.enabled ? "enabled" : "disabled"}`);
  console.log(
    `Keyboard 1001 control: ${
      config.keyboardControl.enabled && config.keyboardControl.continuous1001Enabled ? "enabled" : "disabled"
    }`
  );
  console.log(`Admin API: ${config.adminEnabled ? "enabled" : "disabled"}`);
});
