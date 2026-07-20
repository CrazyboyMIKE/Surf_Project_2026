import assert from "node:assert/strict";
import { MockRobotControlAdapter, VendorRobotControlAdapter } from "./adapter.js";

{
  const adapter = new MockRobotControlAdapter();
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };

  try {
    const result = await adapter.sendCommand({
      roomName: "robot-room-001",
      senderId: "user-controller",
      robotId: "robot-001",
      command: "1002",
      parameters: { distanceCm: 10, speed: 5, token: "SHOULD_NOT_LOG" } as never,
      timestamp: Date.now()
    });

    assert.deepEqual(result, {
      ok: true,
      mode: "mock",
      message: "Robot control recorded in mock mode"
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.includes("SHOULD_NOT_LOG"), false);
  assert.match(logs[0] ?? "", /command=1002/);
}

{
  const adapter = new VendorRobotControlAdapter({
    mode: "real",
    enabled: false,
    vendor: {}
  });

  const result = await adapter.sendCommand({
    roomName: "robot-room-001",
    senderId: "user-controller",
    command: "1000",
    parameters: {},
    timestamp: Date.now()
  });

  assert.deepEqual(result, {
    ok: false,
    mode: "real",
    code: "ROBOT_CONTROL_DISABLED",
    message: "Robot real control is disabled on backend"
  });
}

{
  const adapter = new VendorRobotControlAdapter({
    mode: "real",
    enabled: true,
    vendor: {}
  });

  const result = await adapter.sendCommand({
    roomName: "robot-room-001",
    senderId: "user-controller",
    command: "1000",
    parameters: {},
    timestamp: Date.now()
  });

  assert.deepEqual(result, {
    ok: false,
    mode: "real",
    code: "ROBOT_CONTROL_CONFIG_INCOMPLETE",
    message: "Robot real control is enabled but vendor config is incomplete"
  });
}

console.log("robotControl adapter tests passed");
