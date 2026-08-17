import assert from "node:assert/strict";
import { KeyboardControlManager } from "./keyboardControlManager.js";
import type { KeyboardControlConfig } from "./config.js";
import type { RobotControlAdapter, RobotControlRequest, RobotControlResult } from "../robotControl/adapter.js";
import { RoomStore } from "../state/roomStore.js";
import type { KeyboardControlStatus, RobotControlEventCommand, RobotControlLogParameters } from "../types.js";

class RecordingRobotControlAdapter implements RobotControlAdapter {
  readonly mode = "mock" as const;
  readonly requests: RobotControlRequest[] = [];

  async sendCommand(request: RobotControlRequest): Promise<RobotControlResult> {
    this.requests.push(request);
    return {
      ok: true,
      mode: this.mode,
      message: "recorded"
    };
  }
}

function createConfig(overrides: Partial<KeyboardControlConfig> = {}): KeyboardControlConfig {
  return {
    enabled: true,
    continuous1001Enabled: true,
    mode: "1001",
    sendIntervalMs: 300,
    deadmanTimeoutMs: 900,
    maxSessionMs: 0,
    maxLinearSpeed: 400,
    maxAngularSpeed: 30,
    defaultLinearSpeed: 200,
    defaultAngularSpeed: 15,
    requireFocus: true,
    ...overrides
  };
}

function createFixture(config = createConfig()) {
  const roomStore = new RoomStore({ mockRobotOnline: false });
  const controller = roomStore.joinWebParticipant("robot-room-001", "Alice", "controller").participant;
  const viewer = roomStore.joinWebParticipant("robot-room-001", "Bob", "viewer").participant;
  roomStore.joinRobot("robot-room-001", "robot-001");
  const adapter = new RecordingRobotControlAdapter();
  const statuses: KeyboardControlStatus[] = [];
  const events: Array<{
    command: RobotControlEventCommand;
    parameters: RobotControlLogParameters;
  }> = [];
  const manager = new KeyboardControlManager(config, roomStore, adapter, {
    onStatus(status) {
      statuses.push(status);
    },
    onControlEvent(event) {
      events.push({
        command: event.command,
        parameters: event.parameters
      });
    }
  });

  return {
    roomStore,
    controller,
    viewer,
    adapter,
    statuses,
    events,
    manager
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

{
  const { manager, controller } = createFixture(createConfig({ enabled: false }));
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "KEYBOARD_CONTROL_DISABLED");
  }
}

{
  const { manager, controller } = createFixture(createConfig({ continuous1001Enabled: false }));
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "KEYBOARD_CONTROL_DISABLED");
  }
}

{
  const { manager, adapter, controller, events } = createFixture();
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });

  assert.equal(result.ok, true);
  assert.equal(adapter.requests.at(-1)?.command, "1001");
  assert.deepEqual(adapter.requests.at(-1)?.parameters, { lv: 80, av: 0, direction: "forward" });
  assert.equal(events.at(-1)?.command, "1001");
  await manager.forceStop("robot-room-001", "test_cleanup");
}

{
  const { manager, adapter, controller } = createFixture();
  await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });
  const result = await manager.keepalive({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 200,
    angularSpeed: 15
  });

  assert.equal(result.ok, true);
  assert.equal(adapter.requests.at(-1)?.command, "1001");
  assert.deepEqual(adapter.requests.at(-1)?.parameters, { lv: 200, av: 0, direction: "forward" });
  await manager.forceStop("robot-room-001", "test_cleanup");
}

{
  const { manager, viewer } = createFixture();
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: viewer.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "NOT_CONTROLLER");
  }
}

{
  const { manager, controller } = createFixture();
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "sideways",
    linearSpeed: 80,
    angularSpeed: 15
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "INVALID_PARAMETERS");
  }
}

{
  const { manager, controller } = createFixture();
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 401,
    angularSpeed: 15
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "linearSpeed must be greater than 0 and no more than 400");
  }
}

{
  const { manager, controller } = createFixture();
  const result = await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "left",
    linearSpeed: 80,
    angularSpeed: 31
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "angularSpeed must be greater than 0 and no more than 30");
  }
}

{
  const { manager, adapter, controller } = createFixture();
  await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward_left",
    linearSpeed: 80,
    angularSpeed: 15
  });
  const result = await manager.stopByController({
    roomName: "robot-room-001",
    senderId: controller.id,
    reason: "client_stop"
  });

  assert.equal(result.ok, true);
  assert.equal(adapter.requests.at(-1)?.command, "1000");
  assert.deepEqual(adapter.requests.at(-1)?.parameters, { stopReason: "client_stop" });
}

{
  const { manager, adapter, controller } = createFixture(createConfig({ deadmanTimeoutMs: 20, maxSessionMs: 1_000 }));
  await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });
  await sleep(60);

  assert.equal(adapter.requests.at(-1)?.command, "1000");
  assert.deepEqual(adapter.requests.at(-1)?.parameters, { stopReason: "deadman_timeout" });
}

{
  const { manager, adapter, controller } = createFixture(createConfig({ deadmanTimeoutMs: 1_000, maxSessionMs: 20 }));
  await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });
  await sleep(60);

  assert.equal(adapter.requests.at(-1)?.command, "1000");
  assert.deepEqual(adapter.requests.at(-1)?.parameters, { stopReason: "max_session_timeout" });
}

{
  const { manager, adapter, controller } = createFixture(createConfig({ deadmanTimeoutMs: 1_000, maxSessionMs: 0 }));
  await manager.start({
    roomName: "robot-room-001",
    senderId: controller.id,
    direction: "forward",
    linearSpeed: 80,
    angularSpeed: 15
  });
  await sleep(60);

  assert.equal(adapter.requests.at(-1)?.command, "1001");
  await manager.forceStop("robot-room-001", "test_cleanup");
}

console.log("keyboardControl manager tests passed");
