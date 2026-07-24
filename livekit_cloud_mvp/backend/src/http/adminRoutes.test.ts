import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createAdminRouter } from "./adminRoutes.js";
import { RoomHistoryRepository } from "../db/roomHistoryRepository.js";
import { RoomStore } from "../state/roomStore.js";

const ADMIN_TOKEN = "TEST_ADMIN_TOKEN";

type TestServer = {
  baseUrl: string;
  roomStore: RoomStore;
  historyRepository: RoomHistoryRepository;
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

async function createTestServer(adminEnabled: boolean): Promise<TestServer> {
  const historyRepository = new RoomHistoryRepository({
    databaseUrl: ":memory:",
    retentionDays: 30
  });
  const roomStore = new RoomStore({ mockRobotOnline: false, historyRepository });
  const app = express();
  app.use(express.json());
  app.use(
    createAdminRouter({
      roomStore,
      adminEnabled,
      adminToken: ADMIN_TOKEN,
      stopKeyboardControl: async () => undefined,
      broadcastRoleUpdate: () => undefined,
      broadcastRobotStatus: () => undefined,
      broadcastRoomUpdate: () => undefined,
      disconnectParticipant: () => undefined,
      disconnectRoom: () => undefined
    })
  );
  const server = createServer(app);
  const port = await listen(server);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    roomStore,
    historyRepository,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          historyRepository.close();
          resolve();
        });
      })
  };
}

async function requestJson(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body
  };
}

const disabledServer = await createTestServer(false);
try {
  const response = await requestJson(disabledServer.baseUrl, "/api/admin/rooms", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.code, "ADMIN_DISABLED");
} finally {
  await disabledServer.close();
}

const server = await createTestServer(true);
try {
  const missingToken = await requestJson(server.baseUrl, "/api/admin/rooms");
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.body.code, "UNAUTHORIZED");

  const wrongToken = await requestJson(server.baseUrl, "/api/admin/rooms", {
    headers: { Authorization: "Bearer WRONG_TOKEN" }
  });
  assert.equal(wrongToken.status, 403);
  assert.equal(wrongToken.body.code, "FORBIDDEN");

  const unauthorizedKick = await requestJson(server.baseUrl, "/api/admin/rooms/robot-room-001/participants/user-a/kick", {
    method: "POST"
  });
  assert.equal(unauthorizedKick.status, 401);

  const unauthorizedClose = await requestJson(server.baseUrl, "/api/admin/rooms/robot-room-001/close", {
    method: "POST"
  });
  assert.equal(unauthorizedClose.status, 401);

  const roomJoin = server.roomStore.joinWebParticipant("robot-room-001", "Alice", "controller");
  server.roomStore.markParticipantConnected(roomJoin.room.roomName, roomJoin.participant.id);
  const viewerJoin = server.roomStore.joinWebParticipant("robot-room-001", "Bob", "viewer");
  server.roomStore.markParticipantConnected(viewerJoin.room.roomName, viewerJoin.participant.id);
  server.roomStore.removeParticipant("robot-room-001", viewerJoin.participant.id);

  const roomList = await requestJson(server.baseUrl, "/api/admin/rooms", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(roomList.status, 200);
  assert.equal(Array.isArray(roomList.body.rooms), true);
  const rooms = roomList.body.rooms as Array<{ roomName: string; participantCount: number; connectedParticipantCount: number }>;
  const roomSummary = rooms.find((room) => room.roomName === "robot-room-001");
  assert.equal(roomSummary?.participantCount, 1);
  assert.equal(roomSummary?.connectedParticipantCount, 1);

  const roomDetail = await requestJson(server.baseUrl, "/api/admin/rooms/robot-room-001", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(roomDetail.status, 200);
  const detailBody = roomDetail.body.room as {
    participants: Array<{ participantId: string; displayName: string; connected: boolean }>;
  };
  assert.equal(detailBody.participants.some((participant) => participant.participantId === viewerJoin.participant.id), false);
  assert.equal(detailBody.participants.some((participant) => participant.displayName === "Bob"), false);

  const nonEmptyDelete = await requestJson(server.baseUrl, "/api/admin/rooms/robot-room-001", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(nonEmptyDelete.status, 409);
  assert.equal(nonEmptyDelete.body.code, "ROOM_NOT_EMPTY");

  const release = await requestJson(server.baseUrl, "/api/admin/rooms/robot-room-001/control/release", {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(release.status, 200);
  assert.equal(release.body.released, true);
  assert.equal(server.roomStore.getRoom("robot-room-001")?.currentControllerId, undefined);

  const charlieJoin = server.roomStore.joinWebParticipant("robot-room-001", "Charlie", "viewer");
  server.roomStore.markParticipantConnected("robot-room-001", charlieJoin.participant.id);
  const kick = await requestJson(
    server.baseUrl,
    `/api/admin/rooms/robot-room-001/participants/${encodeURIComponent(charlieJoin.participant.id)}/kick`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    }
  );
  assert.equal(kick.status, 200);
  assert.equal(kick.body.kickedParticipantId, charlieJoin.participant.id);
  assert.equal(server.roomStore.getRoom("robot-room-001")?.participants.has(charlieJoin.participant.id), false);

  const records = await requestJson(server.baseUrl, "/api/admin/room-records", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(records.status, 200);
  const recordList = records.body.records as Array<{ id: number; roomName: string; status: string }>;
  const activeRecord = recordList.find((record) => record.roomName === "robot-room-001" && record.status === "open");
  assert.ok(activeRecord);

  const recordDetail = await requestJson(server.baseUrl, `/api/admin/room-records/${activeRecord.id}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(recordDetail.status, 200);
  const historyDetail = recordDetail.body.record as {
    participants: Array<{ participantId: string; kickedAt?: number }>;
    events: Array<{ type: string; payload?: Record<string, unknown> }>;
  };
  assert.equal(
    historyDetail.participants.some((participant) => participant.participantId === charlieJoin.participant.id && typeof participant.kickedAt === "number"),
    true
  );
  assert.equal(historyDetail.events.some((event) => event.type === "participant_kicked"), true);
  assert.equal(
    historyDetail.events.some((event) => Object.prototype.hasOwnProperty.call(event.payload ?? {}, "LIVEKIT_API_SECRET")),
    false
  );

  const close = await requestJson(server.baseUrl, "/api/admin/rooms/robot-room-001/close", {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(close.status, 200);
  assert.equal(server.roomStore.getRoom("robot-room-001"), undefined);
  const closedRecord = server.roomStore.getRoomRecord(activeRecord.id);
  assert.equal(closedRecord?.status, "closed");
  assert.equal(closedRecord?.closeReason, "admin_closed");
} finally {
  await server.close();
}

console.log("adminRoutes tests passed");
