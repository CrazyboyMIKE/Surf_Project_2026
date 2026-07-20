import assert from "node:assert/strict";
import { validateRobotControlMessage } from "../control/commandValidation.js";
import { RoomStore } from "./roomStore.js";

function createRoomWithControllerViewer() {
  const store = new RoomStore({ mockRobotOnline: true });
  const controller = store.joinWebParticipant("robot-room-001", "Alice", "controller").participant;
  const viewer = store.joinWebParticipant("robot-room-001", "Bob", "viewer").participant;
  const robot = store.joinRobot("robot-room-001", "robot-001").participant;

  store.markParticipantConnected("robot-room-001", controller.id);
  store.markParticipantConnected("robot-room-001", viewer.id);

  return { store, controller, viewer, robot };
}

{
  const { store, controller, viewer } = createRoomWithControllerViewer();
  const result = store.transferControl("robot-room-001", controller.id, viewer.id);

  assert.equal(result.ok, true);
  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.currentControllerId, viewer.id);

  const previousController = snapshot?.participants.find((participant) => participant.id === controller.id);
  const newController = snapshot?.participants.find((participant) => participant.id === viewer.id);
  assert.equal(previousController?.role, "viewer");
  assert.equal(newController?.role, "controller");

  const room = store.getRoom("robot-room-001");
  assert.equal(
    validateRobotControlMessage({
      room,
      senderId: viewer.id,
      command: "1002",
      parameters: { distanceCm: 20 }
    }).ok,
    true
  );
  assert.deepEqual(validateRobotControlMessage({ room, senderId: controller.id, command: "1000", parameters: {} }), {
    ok: false,
    code: "NOT_CONTROLLER",
    message: "Only controller can send robot control"
  });
}

{
  const { store, controller, viewer } = createRoomWithControllerViewer();
  const result = store.transferControl("robot-room-001", viewer.id, controller.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 403,
    code: "NOT_CONTROLLER",
    message: "Only the active controller can transfer control"
  });
}

{
  const { store, controller, robot } = createRoomWithControllerViewer();
  const result = store.transferControl("robot-room-001", controller.id, robot.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 400,
    code: "TARGET_NOT_VIEWER",
    message: "Control can only be transferred to an online viewer"
  });
}

{
  const { store, controller, viewer } = createRoomWithControllerViewer();
  store.markParticipantDisconnected("robot-room-001", viewer.id);
  const result = store.transferControl("robot-room-001", controller.id, viewer.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 409,
    code: "TARGET_OFFLINE",
    message: "Target viewer is offline"
  });
}

{
  const { store, controller } = createRoomWithControllerViewer();
  const result = store.transferControl("robot-room-001", controller.id, "user-does-not-exist");

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 404,
    code: "PARTICIPANT_NOT_FOUND",
    message: "Target participant is not in this room"
  });
}

{
  const { store, controller, viewer } = createRoomWithControllerViewer();
  const result = store.transferControl("robot-room-001", controller.id, viewer.id);
  assert.equal(result.ok, true);
  const room = store.getRoom("robot-room-001");

  for (const command of ["1002", "1003", "1000"] as const) {
    assert.equal(validateRobotControlMessage({ room, senderId: viewer.id, command, parameters: {} }).ok, true);
  }

  assert.deepEqual(validateRobotControlMessage({ room, senderId: viewer.id, command: "1001", parameters: {} }), {
    ok: false,
    code: "COMMAND_NOT_ALLOWED",
    message: "Command must be one of 1002, 1003, or 1000"
  });
}

console.log("controlTransfer tests passed");
