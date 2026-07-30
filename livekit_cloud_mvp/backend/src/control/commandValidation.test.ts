import assert from "node:assert/strict";
import { validateRobotControlMessage } from "./commandValidation.js";
import type { RoomState } from "../types.js";

function createRoom(): RoomState {
  return {
    roomName: "robot-room-001",
    robotOnline: true,
    currentControllerId: "user-controller",
    controllerRequestQueue: [],
    speakerQueue: [],
    participants: new Map([
      [
        "user-controller",
        {
          id: "user-controller",
          name: "Alice",
          role: "controller",
          connected: true,
          joinedAt: Date.now(),
          lastSeenAt: Date.now()
        }
      ],
      [
        "user-viewer",
        {
          id: "user-viewer",
          name: "Bob",
          role: "viewer",
          connected: true,
          joinedAt: Date.now(),
          lastSeenAt: Date.now()
        }
      ]
    ]),
    updatedAt: Date.now()
  };
}

const moveResult = validateRobotControlMessage({
  room: createRoom(),
  senderId: "user-controller",
  command: "1002",
  parameters: { distanceCm: -20, speed: 10 }
});

assert.equal(moveResult.ok, true);
if (moveResult.ok) {
  assert.deepEqual(moveResult.parameters, { distanceCm: -20, speed: 10 });
}

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1002",
    parameters: { distanceCm: 20, unsafePayload: "do-not-forward" }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "1002 only accepts distanceCm and speed"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1003",
    parameters: { angleDeg: 10, speed: 601 }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "speed must be greater than 0 and no more than 600"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1003",
    parameters: { angleDeg: -15, speed: 30 }
  }),
  {
    ok: true,
    command: "1003",
    parameters: { angleDeg: -15, speed: 30 }
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1000",
    parameters: {}
  }),
  {
    ok: true,
    command: "1000",
    parameters: {}
  }
);

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
    message: "Command must be one of 1000, 1002, or 1003"
  }
);

for (const command of ["1004", "1005", "1006", "1007", "1008", "1009"] as const) {
  assert.deepEqual(
    validateRobotControlMessage({
      room: createRoom(),
      senderId: "user-controller",
      command,
      parameters: {}
    }),
    {
      ok: false,
      code: "COMMAND_NOT_ALLOWED",
      message: "Command must be one of 1000, 1002, or 1003"
    }
  );
}

for (const command of ["1004", "1005", "1006"] as const) {
  assert.deepEqual(
    validateRobotControlMessage({
      room: createRoom(),
      senderId: "user-viewer",
      command,
      parameters: command === "1005" ? { d: 1, a: 10, av: 30 } : {}
    }),
    {
      ok: false,
      code: "NOT_CONTROLLER",
      message: "Only controller can send robot control"
    }
  );
}

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
