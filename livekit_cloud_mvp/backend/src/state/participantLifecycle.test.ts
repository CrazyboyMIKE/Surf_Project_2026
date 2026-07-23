import assert from "node:assert/strict";
import { validateRobotControlMessage } from "../control/commandValidation.js";
import { RoomStore } from "./roomStore.js";

function createRoomWithControllerViewerRobot() {
  const store = new RoomStore({ mockRobotOnline: false });
  const controller = store.joinWebParticipant("robot-room-001", "Alice", "controller").participant;
  const viewer = store.joinWebParticipant("robot-room-001", "Bob", "viewer").participant;
  const robot = store.joinRobot("robot-room-001", "robot-001").participant;

  store.markParticipantConnected("robot-room-001", controller.id);
  store.markParticipantConnected("robot-room-001", viewer.id);
  store.markParticipantConnected("robot-room-001", robot.id);

  return { store, controller, viewer, robot };
}

{
  const { store, viewer } = createRoomWithControllerViewerRobot();
  const result = store.removeParticipant("robot-room-001", viewer.id);

  assert.equal(result.removedParticipant?.id, viewer.id);
  assert.equal(result.roomDeleted, false);
  assert.equal(store.getRoom("robot-room-001")?.participants.has(viewer.id), false);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.participants.some((participant) => participant.id === viewer.id), false);
}

{
  const { store, controller, viewer } = createRoomWithControllerViewerRobot();
  const result = store.removeParticipant("robot-room-001", controller.id);

  assert.equal(result.controllerReleased, true);
  assert.equal(result.roomDeleted, false);
  assert.equal(store.getRoom("robot-room-001")?.currentControllerId, undefined);
  assert.equal(store.getRoom("robot-room-001")?.participants.has(controller.id), false);

  const controlRequest = store.requestControl("robot-room-001", viewer.id);
  assert.equal(controlRequest.ok, true);
  assert.equal(store.getRoom("robot-room-001")?.currentControllerId, viewer.id);
}

{
  const { store, robot } = createRoomWithControllerViewerRobot();
  const result = store.removeParticipant("robot-room-001", robot.id);
  const snapshot = store.getRoomSnapshot("robot-room-001");

  assert.equal(result.robotStatusChanged, true);
  assert.equal(result.roomDeleted, false);
  assert.equal(snapshot?.robotOnline, false);
  assert.equal(snapshot?.robotId, undefined);
  assert.equal(snapshot?.participants.some((participant) => participant.id === robot.id), false);
}

{
  const store = new RoomStore({ mockRobotOnline: false });
  const viewer = store.joinWebParticipant("robot-room-001", "Solo", "viewer").participant;
  store.markParticipantConnected("robot-room-001", viewer.id);

  const result = store.removeParticipant("robot-room-001", viewer.id);
  assert.equal(result.roomDeleted, true);
  assert.equal(store.getRoom("robot-room-001"), undefined);
  assert.equal(store.listAdminRoomSummaries().some((room) => room.roomName === "robot-room-001"), false);
}

{
  const store = new RoomStore({ mockRobotOnline: false });
  const firstViewer = store.joinWebParticipant("robot-room-001", "Old Viewer", "viewer").participant;
  store.markParticipantConnected("robot-room-001", firstViewer.id);
  store.removeParticipant("robot-room-001", firstViewer.id);

  const nextJoin = store.joinWebParticipant("robot-room-001", "Fresh Viewer", "viewer");
  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.participants.length, 1);
  assert.equal(snapshot?.participants[0]?.id, nextJoin.participant.id);
  assert.equal(snapshot?.participants[0]?.name, "Fresh Viewer");
}

{
  const { store, controller, viewer } = createRoomWithControllerViewerRobot();
  store.removeParticipant("robot-room-001", viewer.id);

  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.participants.some((participant) => participant.id === viewer.id), false);

  const transferResult = store.transferControl("robot-room-001", controller.id, viewer.id);
  assert.equal(transferResult.ok, false);
  assert.equal(transferResult.code, "PARTICIPANT_NOT_FOUND");
}

{
  const { store, viewer } = createRoomWithControllerViewerRobot();
  store.removeParticipant("robot-room-001", viewer.id);

  const summary = store.listAdminRoomSummaries().find((room) => room.roomName === "robot-room-001");
  const detail = store.getAdminRoomDetail("robot-room-001");
  assert.equal(summary?.participantCount, 2);
  assert.equal(summary?.connectedParticipantCount, 2);
  assert.equal(summary?.viewerCount, 0);
  assert.equal(detail?.participants.some((participant) => participant.participantId === viewer.id), false);
}

{
  const { store, viewer } = createRoomWithControllerViewerRobot();
  const validation = validateRobotControlMessage({
    room: store.getRoom("robot-room-001"),
    senderId: viewer.id,
    command: "1002",
    parameters: { distanceCm: 20 }
  });

  assert.deepEqual(validation, {
    ok: false,
    code: "NOT_CONTROLLER",
    message: "Only controller can send robot control"
  });
}

{
  const { store, controller, robot } = createRoomWithControllerViewerRobot();
  const result = store.transferControl("robot-room-001", controller.id, robot.id);

  assert.equal(result.ok, false);
  assert.equal(result.code, "TARGET_NOT_VIEWER");
}

console.log("participantLifecycle tests passed");
