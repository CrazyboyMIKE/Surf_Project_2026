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
    command: "1001",
    parameters: {}
  }),
  {
    ok: false,
    code: "COMMAND_NOT_ALLOWED",
    message: "Command must be one of 1000, 1002, 1003, 1004, 1005, or 1006"
  }
);

for (const command of ["1007", "1008", "1009"] as const) {
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
      message: "Command must be one of 1000, 1002, 1003, 1004, 1005, or 1006"
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
    senderId: "user-controller",
    command: "1004",
    parameters: {}
  }),
  {
    ok: true,
    command: "1004",
    parameters: {}
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1004",
    parameters: { a: 10 }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "1004 head stop must not include movement parameters"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1005",
    parameters: { d: 1, a: 90, av: 60 }
  }),
  {
    ok: true,
    command: "1005",
    parameters: { d: 1, a: 90, av: 60 }
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1005",
    parameters: { d: 3, a: 15, av: 60 }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "d must be 1 for vertical head movement or 2 for horizontal head movement"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1005",
    parameters: { d: 1, a: -1, av: 60 }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "a must be between 0 and 180"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1005",
    parameters: { d: 1, a: 15, av: 121 }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "av must be greater than 0 and no more than 120"
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1006",
    parameters: {}
  }),
  {
    ok: true,
    command: "1006",
    parameters: { d: 0 }
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1006",
    parameters: { d: 2 }
  }),
  {
    ok: true,
    command: "1006",
    parameters: { d: 2 }
  }
);

assert.deepEqual(
  validateRobotControlMessage({
    room: createRoom(),
    senderId: "user-controller",
    command: "1006",
    parameters: { d: 4 }
  }),
  {
    ok: false,
    code: "INVALID_PARAMETERS",
    message: "d must be 0, 1, or 2"
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
