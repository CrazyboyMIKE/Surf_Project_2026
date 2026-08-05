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
  stopCalls: Array<{ roomName: string; reason: string }>;
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
  const stopCalls: Array<{ roomName: string; reason: string }> = [];
  const app = express();
  app.use(express.text({ type: "text/plain", limit: "32kb" }));
  app.use(express.json());
  app.use(
    createApiRouter({
      roomStore,
      liveKitTokenService: fakeLiveKitTokenService as LiveKitTokenService,
      keyboardControlConfig: readKeyboardControlConfig({}),
      stopKeyboardControl: async (roomName, reason) => {
        stopCalls.push({ roomName, reason });
      },
      broadcastRoleUpdate: () => undefined,
      broadcastRobotStatus: () => undefined
    })
  );
  const server = createServer(app);
  const port = await listen(server);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    roomStore,
    stopCalls,
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
  assert.equal(Object.prototype.hasOwnProperty.call(correctSessionLeave.body, "token"), false);
  assert.equal(server.roomStore.getRoom("robot-room-001"), undefined);

  const beaconJoin = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "beacon-room",
      participantName: "Beacon User",
      requestedRole: "viewer",
      clientSessionId: "client-session-beacon"
    })
  });
  assert.equal(beaconJoin.status, 201);
  const beaconParticipantId = beaconJoin.body.participantId as string;
  server.roomStore.markParticipantConnected("beacon-room", beaconParticipantId);

  const beaconLeave = await requestJson(server.baseUrl, "/api/rooms/leave", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain"
    },
    body: JSON.stringify({
      roomName: "beacon-room",
      participantId: beaconParticipantId,
      clientSessionId: "client-session-beacon"
    })
  });
  assert.equal(beaconLeave.status, 200);
  assert.equal(beaconLeave.body.roomDeleted, true);
  assert.equal(Object.prototype.hasOwnProperty.call(beaconLeave.body, "token"), false);

  const createRoom = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "create-intent-room",
      participantName: "Creator",
      requestedRole: "controller",
      intent: "create",
      clientSessionId: "creator-session"
    })
  });
  assert.equal(createRoom.status, 201);
  assert.equal(createRoom.body.role, "controller");

  const duplicateCreate = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "create-intent-room",
      participantName: "Duplicate Creator",
      requestedRole: "viewer",
      intent: "create",
      clientSessionId: "duplicate-creator-session"
    })
  });
  assert.equal(duplicateCreate.status, 409);
  assert.equal(duplicateCreate.body.code, "ROOM_EXISTS");
  assert.equal(Object.prototype.hasOwnProperty.call(duplicateCreate.body, "token"), false);

  const joinExistingRoom = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "create-intent-room",
      participantName: "Joiner",
      requestedRole: "viewer",
      intent: "join",
      clientSessionId: "joiner-session"
    })
  });
  assert.equal(joinExistingRoom.status, 201);
  assert.equal(joinExistingRoom.body.role, "viewer");

  const robotJoin = await requestJson(server.baseUrl, "/api/robots/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "robot-room-001",
      robotId: "robot-001",
      clientSessionId: "robot-client-session-a"
    })
  });
  assert.equal(robotJoin.status, 201);
  assert.equal(robotJoin.body.clientSessionId, "robot-client-session-a");
  assert.equal(robotJoin.body.reusedParticipant, false);
  const robotParticipantId = robotJoin.body.participantId as string;
  server.roomStore.markParticipantDisconnected("robot-room-001", robotParticipantId);

  const robotRestore = await requestJson(server.baseUrl, "/api/robots/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "robot-room-001",
      robotId: "robot-001",
      previousParticipantId: robotParticipantId,
      clientSessionId: "robot-client-session-a"
    })
  });
  assert.equal(robotRestore.status, 201);
  assert.equal(robotRestore.body.participantId, robotParticipantId);
  assert.equal(robotRestore.body.clientSessionId, "robot-client-session-a");
  assert.equal(robotRestore.body.reusedParticipant, true);

  const controllerJoin = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantName: "Controller",
      requestedRole: "controller",
      clientSessionId: "controller-session"
    })
  });
  assert.equal(controllerJoin.status, 201);
  assert.equal(controllerJoin.body.role, "controller");
  assert.equal(controllerJoin.body.requestedControllerGranted, true);
  const controllerId = controllerJoin.body.participantId as string;
  server.roomStore.markParticipantConnected("control-route-room", controllerId);

  const secondControllerJoin = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantName: "Second Controller",
      requestedRole: "controller",
      clientSessionId: "second-controller-session"
    })
  });
  assert.equal(secondControllerJoin.status, 201);
  assert.equal(secondControllerJoin.body.role, "viewer");
  assert.equal(secondControllerJoin.body.requestedControllerGranted, false);
  assert.equal(secondControllerJoin.body.currentControllerId, controllerId);
  assert.equal(server.roomStore.getRoom("control-route-room")?.currentControllerId, controllerId);
  server.roomStore.markParticipantConnected("control-route-room", secondControllerJoin.body.participantId as string);
  const secondControllerId = secondControllerJoin.body.participantId as string;

  const cancelableQueuedRequest = await requestJson(server.baseUrl, "/api/rooms/control/request", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantId: secondControllerId
    })
  });
  assert.equal(cancelableQueuedRequest.status, 200);
  assert.equal(cancelableQueuedRequest.body.controlRequestQueued, true);

  const cancelControlRequest = await requestJson(server.baseUrl, "/api/rooms/control/release", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantId: secondControllerId
    })
  });
  assert.equal(cancelControlRequest.status, 200);
  assert.equal(cancelControlRequest.body.message, "Control request canceled");
  assert.equal(cancelControlRequest.body.currentControllerId, controllerId);
  assert.deepEqual(
    (cancelControlRequest.body.controlRequests as { queue?: Array<{ id: string }> } | undefined)?.queue?.map((participant) => participant.id),
    []
  );

  const viewerJoin = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantName: "Viewer",
      requestedRole: "viewer",
      clientSessionId: "viewer-session"
    })
  });
  assert.equal(viewerJoin.status, 201);
  const viewerId = viewerJoin.body.participantId as string;
  server.roomStore.markParticipantConnected("control-route-room", viewerId);

  const unrequestedJoin = await requestJson(server.baseUrl, "/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantName: "Unrequested",
      requestedRole: "viewer",
      clientSessionId: "unrequested-session"
    })
  });
  assert.equal(unrequestedJoin.status, 201);
  const unrequestedId = unrequestedJoin.body.participantId as string;
  server.roomStore.markParticipantConnected("control-route-room", unrequestedId);

  const queuedRequest = await requestJson(server.baseUrl, "/api/rooms/control/request", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantId: viewerId
    })
  });
  assert.equal(queuedRequest.status, 200);
  assert.equal(queuedRequest.body.role, "viewer");
  assert.equal(queuedRequest.body.controlRequestQueued, true);
  assert.equal(Object.prototype.hasOwnProperty.call(queuedRequest.body, "token"), false);

  const bypassTransfer = await requestJson(server.baseUrl, "/api/rooms/control/transfer", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      fromParticipantId: controllerId,
      targetParticipantId: unrequestedId
    })
  });
  assert.equal(bypassTransfer.status, 409);
  assert.equal(bypassTransfer.body.code, "CONTROL_REQUEST_NOT_FOUND");

  const approvedTransfer = await requestJson(server.baseUrl, "/api/rooms/control/transfer", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      fromParticipantId: controllerId,
      targetParticipantId: viewerId
    })
  });
  assert.equal(approvedTransfer.status, 200);
  assert.equal(approvedTransfer.body.currentControllerId, viewerId);
  assert.equal(server.roomStore.getRoom("control-route-room")?.participants.get(controllerId)?.role, "viewer");
  assert.equal(server.stopCalls.some((call) => call.roomName === "control-route-room" && call.reason === "controller_transferred"), true);

  const releaseControl = await requestJson(server.baseUrl, "/api/rooms/control/release", {
    method: "POST",
    body: JSON.stringify({
      roomName: "control-route-room",
      participantId: viewerId
    })
  });
  assert.equal(releaseControl.status, 200);
  assert.equal(server.roomStore.getRoom("control-route-room")?.currentControllerId, undefined);
  assert.equal(server.stopCalls.some((call) => call.roomName === "control-route-room" && call.reason === "controller_released"), true);
} finally {
  await server.close();
}

console.log("routes tests passed");
