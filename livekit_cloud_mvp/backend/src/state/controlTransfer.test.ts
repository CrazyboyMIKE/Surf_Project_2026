import assert from "node:assert/strict";
import { validateRobotControlMessage } from "../control/commandValidation.js";
import { RoomStore } from "./roomStore.js";

function createRoomWithControllerViewers() {
  const store = new RoomStore({ mockRobotOnline: true });
  const controller = store.joinWebParticipant("robot-room-001", "Alice", "controller").participant;
  const viewerA = store.joinWebParticipant("robot-room-001", "Bob", "viewer").participant;
  const viewerB = store.joinWebParticipant("robot-room-001", "Carol", "viewer").participant;
  const robot = store.joinRobot("robot-room-001", "robot-001").participant;

  for (const participant of [controller, viewerA, viewerB, robot]) {
    store.markParticipantConnected("robot-room-001", participant.id);
  }

  return { store, controller, viewerA, viewerB, robot };
}

function controlQueueIds(store: RoomStore): string[] {
  return store.getRoomSnapshot("robot-room-001")?.controlRequests.queue.map((participant) => participant.id) ?? [];
}

{
  const store = new RoomStore({ mockRobotOnline: true });
  const viewer = store.joinWebParticipant("robot-room-001", "First Viewer", "viewer").participant;
  store.markParticipantConnected("robot-room-001", viewer.id);

  const result = store.requestControl("robot-room-001", viewer.id);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.granted, true);
    assert.equal(result.queued, false);
    assert.equal(result.participant.role, "controller");
  }
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, viewer.id);
  assert.deepEqual(controlQueueIds(store), []);
}

{
  const { store, viewerA, robot } = createRoomWithControllerViewers();

  const request = store.requestControl("robot-room-001", viewerA.id);
  assert.equal(request.ok, true);
  if (request.ok) {
    assert.equal(request.granted, false);
    assert.equal(request.queued, true);
    assert.equal(request.participant.role, "viewer");
  }
  assert.deepEqual(controlQueueIds(store), [viewerA.id]);

  const duplicateRequest = store.requestControl("robot-room-001", viewerA.id);
  assert.equal(duplicateRequest.ok, true);
  assert.deepEqual(controlQueueIds(store), [viewerA.id]);

  const robotRequest = store.requestControl("robot-room-001", robot.id);
  assert.equal(robotRequest.ok, false);
  assert.equal(robotRequest.code, "FORBIDDEN");
}

{
  const { store, controller } = createRoomWithControllerViewers();

  const result = store.requestControl("robot-room-001", controller.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 409,
    code: "FORBIDDEN",
    role: "controller",
    message: "Current controller must release control before requesting again"
  });
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, controller.id);
  assert.deepEqual(controlQueueIds(store), []);
}

{
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  const request = store.requestControl("robot-room-001", viewerA.id);
  assert.equal(request.ok, true);
  assert.deepEqual(controlQueueIds(store), [viewerA.id]);

  const cancel = store.releaseControl("robot-room-001", viewerA.id);
  assert.equal(cancel.ok, true);
  if (cancel.ok) {
    assert.equal(cancel.released, false);
    assert.equal(cancel.message, "Control request canceled");
  }
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, controller.id);
  assert.deepEqual(controlQueueIds(store), []);
}

{
  const { store, viewerA, viewerB } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  store.requestControl("robot-room-001", viewerB.id);

  const cancel = store.releaseControl("robot-room-001", viewerA.id);
  assert.equal(cancel.ok, true);
  if (cancel.ok) {
    assert.equal(cancel.released, false);
    assert.equal(cancel.message, "Control request canceled");
  }
  assert.deepEqual(controlQueueIds(store), [viewerB.id]);

  const reRequest = store.requestControl("robot-room-001", viewerA.id);
  assert.equal(reRequest.ok, true);
  assert.deepEqual(controlQueueIds(store), [viewerB.id, viewerA.id]);
}

{
  const { store, controller, viewerA, viewerB } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  store.requestControl("robot-room-001", viewerB.id);

  const result = store.transferControl("robot-room-001", controller.id, viewerA.id);

  assert.equal(result.ok, true);
  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.currentControllerId, viewerA.id);
  assert.deepEqual(controlQueueIds(store), [viewerB.id]);

  const previousController = snapshot?.participants.find((participant) => participant.id === controller.id);
  const newController = snapshot?.participants.find((participant) => participant.id === viewerA.id);
  assert.equal(previousController?.role, "viewer");
  assert.equal(newController?.role, "controller");

  const room = store.getRoom("robot-room-001");
  assert.equal(
    validateRobotControlMessage({
      room,
      senderId: viewerA.id,
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
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  const result = store.transferControl("robot-room-001", controller.id, viewerA.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 409,
    code: "CONTROL_REQUEST_NOT_FOUND",
    message: "Target participant must request control before approval"
  });
}

{
  const { store, controller, viewerA, viewerB } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerB.id);
  const result = store.transferControl("robot-room-001", viewerA.id, viewerB.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 403,
    code: "NOT_CONTROLLER",
    message: "Only the active controller can transfer control"
  });
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, controller.id);
}

{
  const { store, viewerA, robot } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  const result = store.transferControl("robot-room-001", robot.id, viewerA.id);

  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 403,
    code: "FORBIDDEN",
    message: "Robot cannot approve control requests"
  });
}

{
  const { store, controller, robot } = createRoomWithControllerViewers();
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
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  store.markParticipantDisconnected("robot-room-001", viewerA.id);

  assert.deepEqual(controlQueueIds(store), []);

  const result = store.transferControl("robot-room-001", controller.id, viewerA.id);
  assert.deepEqual(result, {
    ok: false,
    room: store.getRoom("robot-room-001"),
    status: 409,
    code: "TARGET_OFFLINE",
    message: "Target viewer is offline"
  });
}

{
  const { store, controller, viewerA, viewerB } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  store.requestControl("robot-room-001", viewerB.id);

  const release = store.releaseControl("robot-room-001", controller.id);
  assert.equal(release.ok, true);
  if (release.ok) {
    assert.equal(release.nextController?.id, viewerA.id);
    assert.equal(release.message, `Control released to ${viewerA.name}`);
  }
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, viewerA.id);
  assert.deepEqual(controlQueueIds(store), [viewerB.id]);

  const renewedRequest = store.requestControl("robot-room-001", viewerA.id);
  assert.equal(renewedRequest.ok, false);
  assert.equal(renewedRequest.code, "FORBIDDEN");
  assert.equal(renewedRequest.role, "controller");
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, viewerA.id);
  assert.deepEqual(controlQueueIds(store), [viewerB.id]);
}

{
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  const room = store.getRoom("robot-room-001");
  const staleParticipant = room?.participants.get(viewerA.id);
  if (staleParticipant) {
    staleParticipant.role = "controller";
  }

  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.currentControllerId, controller.id);
  assert.deepEqual(
    snapshot?.participants.filter((participant) => participant.role === "controller").map((participant) => participant.id),
    [controller.id]
  );
}

{
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  const release = store.releaseControl("robot-room-001", controller.id);
  assert.equal(release.ok, true);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.currentControllerId, undefined);
  const staleController = store.getRoom("robot-room-001")?.participants.get(controller.id);
  if (staleController) {
    staleController.role = "controller";
  }

  const renewedRequest = store.requestControl("robot-room-001", viewerA.id);
  assert.equal(renewedRequest.ok, true);
  if (renewedRequest.ok) {
    assert.equal(renewedRequest.granted, true);
  }
  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.currentControllerId, viewerA.id);
  assert.deepEqual(
    snapshot?.participants.filter((participant) => participant.role === "controller").map((participant) => participant.id),
    [viewerA.id]
  );
}

{
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  store.markParticipantDisconnected("robot-room-001", controller.id);

  const snapshot = store.getRoomSnapshot("robot-room-001");
  assert.equal(snapshot?.currentControllerId, undefined);
  assert.equal(snapshot?.participants.find((participant) => participant.id === controller.id)?.role, "viewer");
  assert.deepEqual(controlQueueIds(store), [viewerA.id]);
  assert.deepEqual(
    validateRobotControlMessage({
      room: store.getRoom("robot-room-001"),
      senderId: viewerA.id,
      command: "1002",
      parameters: { distanceCm: 20 }
    }),
    {
      ok: false,
      code: "NOT_CONTROLLER",
      message: "Only controller can send robot control"
    }
  );
}

{
  const { store, controller, viewerA } = createRoomWithControllerViewers();
  store.requestControl("robot-room-001", viewerA.id);
  const result = store.transferControl("robot-room-001", controller.id, viewerA.id);
  assert.equal(result.ok, true);
  const room = store.getRoom("robot-room-001");

  for (const command of ["1000", "1002", "1003"] as const) {
    assert.equal(validateRobotControlMessage({ room, senderId: viewerA.id, command, parameters: {} }).ok, true);
  }

  assert.deepEqual(validateRobotControlMessage({ room, senderId: viewerA.id, command: "1001", parameters: {} }), {
    ok: false,
    code: "COMMAND_NOT_ALLOWED",
    message: "Command must be one of 1000, 1002, or 1003"
  });
}

console.log("controlTransfer tests passed");
