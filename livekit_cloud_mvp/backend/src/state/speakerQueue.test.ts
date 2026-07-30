import assert from "node:assert/strict";
import { RoomStore } from "./roomStore.js";

function createRoom() {
  const store = new RoomStore({ mockRobotOnline: true });
  const controller = store.joinWebParticipant("robot-room-001", "Controller", "controller").participant;
  const viewerA = store.joinWebParticipant("robot-room-001", "Viewer A", "viewer").participant;
  const viewerB = store.joinWebParticipant("robot-room-001", "Viewer B", "viewer").participant;
  const viewerC = store.joinWebParticipant("robot-room-001", "Viewer C", "viewer").participant;
  const robot = store.joinRobot("robot-room-001", "robot-001").participant;

  for (const participant of [controller, viewerA, viewerB, viewerC, robot]) {
    store.markParticipantConnected("robot-room-001", participant.id);
  }

  return { store, controller, viewerA, viewerB, viewerC, robot };
}

{
  const { store, controller, viewerA, viewerB, viewerC, robot } = createRoom();

  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, controller.id);

  const firstRequest = store.requestSpeaker("robot-room-001", viewerA.id);
  assert.equal(firstRequest.ok, true);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, viewerA.id);
  assert.deepEqual(store.getRoomSnapshot("robot-room-001")?.speaker.queue, []);

  const duplicateRequest = store.requestSpeaker("robot-room-001", viewerA.id);
  assert.equal(duplicateRequest.ok, true);
  assert.deepEqual(store.getRoomSnapshot("robot-room-001")?.speaker.queue, []);

  const robotRequest = store.requestSpeaker("robot-room-001", robot.id);
  assert.equal(robotRequest.ok, false);
  assert.equal(robotRequest.code, "FORBIDDEN");

  const secondRequest = store.requestSpeaker("robot-room-001", viewerB.id);
  const thirdRequest = store.requestSpeaker("robot-room-001", viewerC.id);
  assert.equal(secondRequest.ok, true);
  assert.equal(thirdRequest.ok, true);
  assert.deepEqual(
    store.getRoomSnapshot("robot-room-001")?.speaker.queue.map((participant) => participant.id),
    [viewerB.id, viewerC.id]
  );

  const nonSpeakerEnd = store.endSpeaker("robot-room-001", viewerB.id);
  assert.equal(nonSpeakerEnd.ok, false);
  assert.equal(nonSpeakerEnd.code, "NOT_SPEAKER");

  const firstEnd = store.endSpeaker("robot-room-001", viewerA.id);
  assert.equal(firstEnd.ok, true);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, viewerB.id);
  assert.deepEqual(
    store.getRoomSnapshot("robot-room-001")?.speaker.queue.map((participant) => participant.id),
    [viewerC.id]
  );

  const secondEnd = store.endSpeaker("robot-room-001", viewerB.id);
  assert.equal(secondEnd.ok, true);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, viewerC.id);

  const thirdEnd = store.endSpeaker("robot-room-001", viewerC.id);
  assert.equal(thirdEnd.ok, true);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, controller.id);
  assert.deepEqual(store.getRoomSnapshot("robot-room-001")?.speaker.queue, []);
}

{
  const { store, controller, viewerA, viewerB, viewerC } = createRoom();

  store.requestSpeaker("robot-room-001", viewerA.id);
  store.requestSpeaker("robot-room-001", viewerB.id);
  store.requestSpeaker("robot-room-001", viewerC.id);
  store.markParticipantDisconnected("robot-room-001", viewerA.id);

  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, viewerB.id);
  assert.deepEqual(
    store.getRoomSnapshot("robot-room-001")?.speaker.queue.map((participant) => participant.id),
    [viewerC.id]
  );

  store.markParticipantDisconnected("robot-room-001", viewerC.id);
  assert.deepEqual(store.getRoomSnapshot("robot-room-001")?.speaker.queue, []);

  store.endSpeaker("robot-room-001", viewerB.id);
  assert.equal(store.getRoomSnapshot("robot-room-001")?.speaker.currentSpeaker?.id, controller.id);
}

console.log("speakerQueue tests passed");
