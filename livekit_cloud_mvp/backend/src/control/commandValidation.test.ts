import assert from "node:assert/strict";
import { validateRobotControlMessage } from "./commandValidation.js";
import type { RoomState } from "../types.js";

function createRoom(): RoomState {
  return {
    roomName: "robot-room-001",
    robotOnline: true,
    currentControllerId: "user-controller",
    participants: new Map([
      [
        "user-controller",
        {
          id: "user-controller",
          name: "Alice",
          role: "controller",
          connected: true
        }
      ],
      [
        "user-viewer",
        {
          id: "user-viewer",
          name: "Bob",
          role: "viewer",
          connected: true
        }
      ]
    ])
  };
}

const moveResult = validateRobotControlMessage({
  room: createRoom(),
  senderId: "user-controller",
  command: "1002",
  parameters: { distanceCm: -20 }
});

assert.equal(moveResult.ok, true);
if (moveResult.ok) {
  assert.deepEqual(moveResult.parameters, { distanceCm: -20 });
}

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1001",
    parameters: {}
  }),
  {
    ok: false,
    code: "COMMAND_NOT_ALLOWED",
    message: "Command must be one of 1002, 1003, or 1000"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-viewer",
    command: "1002",
    parameters: { distanceCm: 20 }
  }),
  {
    ok: false,
    code: "NOT_CONTROLLER",
    message: "Only controller can send robot control"
  }
);

const offlineRoom = createRoom();
offlineRoom.robotOnline = false;

assert.deepEqual(
  validateRobotControlMessage({
    room: offlineRoom,
    senderId: "user-controller",
    command: "1000",
    parameters: {}
  }),
  {
    ok: false,
    code: "ROBOT_OFFLINE",
    message: "Robot is offline"
  }
);

console.log("commandValidation tests passed");
