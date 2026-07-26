import assert from "node:assert/strict";
import { MockRobotControlAdapter, VendorRobotControlAdapter } from "./adapter.js";
import { getMissingRobotVendorFields } from "./config.js";
import { buildPadBotControlPayload, buildPadBotSignedPayload, pickPadBotPostTopic } from "./padBotMqtt.js";
import type { RobotControlConfig } from "./config.js";

function createRealConfig(): RobotControlConfig {
  return {
    mode: "real",
    enabled: true,
    headControlEnabled: true,
    vendor: {
      apiBaseUrl: "http://s.padbot.cn:9080",
      appKey: "test-app-key",
      token: "test-app-token",
      language: "zh-CN",
      serialNumber: "test-serial",
      linearSpeed: 200,
      angularSpeed: 25,
      sendIntervalMs: 300,
      mqttPort: 1883,
      mqttKeepaliveSeconds: 60
    }
  };
}

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
    headControlEnabled: false,
    vendor: {
      language: "zh-CN",
      linearSpeed: 200,
      angularSpeed: 25,
      sendIntervalMs: 300,
      mqttKeepaliveSeconds: 60
    }
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
    headControlEnabled: false,
    vendor: {
      language: "zh-CN",
      linearSpeed: 200,
      angularSpeed: 25,
      sendIntervalMs: 300,
      mqttKeepaliveSeconds: 60
    }
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

{
  assert.deepEqual(
    getMissingRobotVendorFields({
      mode: "real",
      enabled: true,
      headControlEnabled: false,
      vendor: {
        language: "zh-CN",
        linearSpeed: 200,
        angularSpeed: 25,
        sendIntervalMs: 300,
        mqttHost: "mqtt.example.com",
        mqttPort: 1883,
        mqttUsername: "test-user",
        mqttPassword: "test-password",
        mqttClientId: "test-client",
        mqttPostTopic: "robot/control/topic",
        mqttKeepaliveSeconds: 60
      }
    }),
    ["ROBOT_VENDOR_API_BASE_URL", "ROBOT_VENDOR_APP_KEY", "ROBOT_VENDOR_TOKEN", "ROBOT_SERIAL_NUMBER"]
  );
}

{
  const config = createRealConfig();
  assert.equal(
    buildPadBotControlPayload("1000", {}, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1000\\"}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1002", { distanceCm: -20 }, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1002\\",\\"m\\":{\\"d\\":-20,\\"lv\\":200}}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1003", { angleDeg: 15, speed: 30 }, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1003\\",\\"m\\":{\\"a\\":15,\\"av\\":30}}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1001", { lv: 80, av: -15, direction: "forward_right" }, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1001\\",\\"m\\":{\\"lv\\":80,\\"av\\":-15}}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1004", {}, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1004\\"}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1005", { d: 1, a: 90, av: 60 }, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1005\\",\\"m\\":{\\"d\\":1,\\"a\\":90,\\"av\\":60}}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1005", { d: 1, a: 120, av: 60 }, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1005\\",\\"m\\":{\\"d\\":1,\\"a\\":120,\\"av\\":60}}"}'
  );
  assert.equal(
    buildPadBotControlPayload("1006", { d: 1 }, config, "test-message-id"),
    '{"id":"test-message-id","t":"83","m":"{\\"a\\":\\"1006\\",\\"m\\":{\\"d\\":1}}"}'
  );
}

{
  const adapter = new VendorRobotControlAdapter({
    ...createRealConfig(),
    headControlEnabled: false
  });

  const result = await adapter.sendCommand({
    roomName: "robot-room-001",
    senderId: "user-controller",
    command: "1004",
    parameters: {},
    timestamp: Date.now()
  });

  assert.deepEqual(result, {
    ok: false,
    mode: "real",
    code: "ROBOT_CONTROL_DISABLED",
    message: "Robot head control is disabled on backend"
  });
}

{
  const config = createRealConfig();
  const payload = buildPadBotSignedPayload(config, {}, 1234567890);
  assert.deepEqual(Object.keys(payload).sort(), ["system"]);
  assert.equal((payload.system as Record<string, unknown>).appkey, "test-app-key");
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "apptoken"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "token"), false);
  assert.equal(typeof (payload.system as Record<string, unknown>).sign, "string");
}

{
  assert.equal(
    pickPadBotPostTopic(
      {
        robotMqttInfoList: [
          { serialNumber: "other", postTopic: "ignore-this-topic" },
          { serialNumber: "test-serial", sendTopic: "robot/control/topic" }
        ]
      },
      "test-serial"
    ),
    "robot/control/topic"
  );
}

{
  assert.equal(
    pickPadBotPostTopic(
      {
        robotMqttInfoList: [
          { serialNumber: "other", robotSubTopic: "ignore-this-topic" },
          { serialNumber: "test-serial", robotControlTopic: "robot/demo-style/control" }
        ]
      },
      "test-serial"
    ),
    "robot/demo-style/control"
  );
}

console.log("robotControl adapter tests passed");
