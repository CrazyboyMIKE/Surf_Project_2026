import assert from "node:assert/strict";
import { RoomStore } from "../state/roomStore.js";
import { RoomHistoryRepository } from "./roomHistoryRepository.js";

const repo = new RoomHistoryRepository({
  databaseUrl: ":memory:",
  retentionDays: 30
});

try {
  const store = new RoomStore({ mockRobotOnline: false, historyRepository: repo });
  const controller = store.joinWebParticipant("robot-room-001", "Alice", "controller", {
    clientSessionId: "client-a"
  }).participant;
  const viewer = store.joinWebParticipant("robot-room-001", "Bob", "viewer", {
    clientSessionId: "client-b"
  }).participant;
  store.markParticipantConnected("robot-room-001", controller.id);
  store.markParticipantConnected("robot-room-001", viewer.id);

  const openRecords = store.listRoomRecords();
  assert.equal(openRecords.length, 1);
  assert.equal(openRecords[0]?.roomName, "robot-room-001");
  assert.equal(openRecords[0]?.status, "open");
  assert.equal(openRecords[0]?.participantCount, 2);

  const openDetail = store.getRoomRecord(openRecords[0]?.id ?? 0);
  assert.equal(openDetail?.participants.length, 2);
  assert.equal(openDetail?.events.some((event) => event.type === "participant_joined"), true);

  store.removeParticipant("robot-room-001", viewer.id);
  const afterViewerLeft = store.getRoomRecord(openRecords[0]?.id ?? 0);
  const viewerRecord = afterViewerLeft?.participants.find((participant) => participant.participantId === viewer.id);
  assert.equal(viewerRecord?.connected, false);
  assert.equal(typeof viewerRecord?.leftAt, "number");
  assert.equal(afterViewerLeft?.events.some((event) => event.type === "participant_left"), true);

  store.removeParticipant("robot-room-001", controller.id);
  const closedDetail = store.getRoomRecord(openRecords[0]?.id ?? 0);
  assert.equal(closedDetail?.status, "closed");
  assert.equal(closedDetail?.closeReason, "empty_room");
  assert.equal(typeof closedDetail?.closedAt, "number");

  const freshViewer = store.joinWebParticipant("robot-room-001", "Fresh", "viewer").participant;
  assert.notEqual(freshViewer.id, viewer.id);
  const recordsAfterReopen = store.listRoomRecords();
  assert.equal(recordsAfterReopen.filter((record) => record.roomName === "robot-room-001").length, 2);
  assert.equal(recordsAfterReopen.some((record) => record.status === "open"), true);

  const oldTimestamp = Date.now() - 40 * 24 * 60 * 60 * 1000;
  const oldRoomId = repo.ensureOpenRoom("old-room", oldTimestamp);
  repo.closeRoom(oldRoomId, "old_test", undefined, oldTimestamp);
  assert.equal(store.listRoomRecords(30).some((record) => record.roomName === "old-room"), false);

  const secretRoomId = repo.ensureOpenRoom("secret-sanitize-room");
  repo.recordEvent(secretRoomId, "robot_control", undefined, {
    command: "1000",
    token: "SHOULD_NOT_BE_STORED",
    LIVEKIT_API_SECRET: "SHOULD_NOT_BE_STORED"
  });
  const secretDetail = repo.getRoomRecord(secretRoomId);
  const payload = secretDetail?.events.find((event) => event.type === "robot_control")?.payload;
  assert.equal(payload?.command, "1000");
  assert.equal(Object.prototype.hasOwnProperty.call(payload ?? {}, "token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload ?? {}, "LIVEKIT_API_SECRET"), false);
} finally {
  repo.close();
}

console.log("roomHistoryRepository tests passed");
