import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { readKeyboardControlConfig } from "../keyboardControl/config.js";
import type { LiveKitTokenRequest, LiveKitTokenResponse, LiveKitTokenService } from "../services/liveKitTokenService.js";
import { RoomStore } from "../state/roomStore.js";
import type { MediaPermissions, Role } from "../types.js";
import { createApiRouter } from "./routes.js";

type TestServer = {
  baseUrl: string;
  roomStore: RoomStore;
  close: () => Promise<void>;
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.notEqual(address, null);
      assert.notEqual(typeof address, "string");
      resolve((address as AddressInfo).port);
    });
  });
}

function mediaPermissionsFor(role: Role): MediaPermissions {
  const canPublish = role === "robot" || role === "controller" || role === "viewer";
  return {
    canSubscribe: true,
    canPublish,
    canPublishAudio: canPublish,
    canPublishVideo: canPublish
  };
}

const fakeLiveKitTokenService = {
  async generateToken(request: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    return {
      liveKitUrl: "mock://livekit",
      token: `mock-token-for-${request.identity}`,
      isMock: true,
      mediaPermissions: mediaPermissionsFor(request.role)
    };
  }
} satisfies Pick<LiveKitTokenService, "generateToken">;

async function createTestServer(): Promise<TestServer> {
  const roomStore = new RoomStore({ mockRobotOnline: false });
  const app = express();
  app.use(express.json());
  app.use(
    createApiRouter({
      roomStore,
      liveKitTokenService: fakeLiveKitTokenService as LiveKitTokenService,
      keyboardControlConfig: readKeyboardControlConfig({}),
      stopKeyboardControl: async () => undefined,
      broadcastRoleUpdate: () => undefined,
      broadcastRobotStatus: () => undefined
    })
  );
  const server = createServer(app);
  const port = await listen(server);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    roomStore,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

async function requestJson(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body
  };
}

const server = await createTestServer();
try {
  const join = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "robot-room-001",
      participantName: "Alice",
      requestedRole: "controller",
      clientSessionId: "client-session-a"
    })
  });
  assert.equal(join.status, 201);
  assert.equal(join.body.clientSessionId, "client-session-a");
  const participantId = join.body.participantId as string;
  server.roomStore.markParticipantConnected("robot-room-001", participantId);

  const wrongSessionLeave = await requestJson(server.baseUrl, "/api/rooms/leave", {
    method: "POST",
    body: JSON.stringify({
      roomName: "robot-room-001",
      participantId,
      clientSessionId: "wrong-client-session"
    })
  });
  assert.equal(wrongSessionLeave.status, 403);
  assert.equal(wrongSessionLeave.body.code, "FORBIDDEN");
  assert.equal(server.roomStore.getRoom("robot-room-001")?.participants.has(participantId), true);

  const correctSessionLeave = await requestJson(server.baseUrl, "/api/rooms/leave", {
    method: "POST",
    body: JSON.stringify({
      roomName: "robot-room-001",
      participantId,
      clientSessionId: "client-session-a"
    })
  });
  assert.equal(correctSessionLeave.status, 200);
  assert.equal(correctSessionLeave.body.roomDeleted, true);
  assert.equal(server.roomStore.getRoom("robot-room-001"), undefined);
} finally {
  await server.close();
}

console.log("routes tests passed");
