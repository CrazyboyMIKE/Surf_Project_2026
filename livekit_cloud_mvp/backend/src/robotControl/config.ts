export type RobotControlMode = "mock" | "real";

export type RobotVendorConfig = {
  apiBaseUrl?: string;
  appKey?: string;
  appSecret?: string;
  token?: string;
  language: string;
  serialNumber?: string;
  linearSpeed: number;
  angularSpeed: number;
  sendIntervalMs: number;
  mqttHost?: string;
  mqttPort?: number;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttClientId?: string;
  mqttPostTopic?: string;
  mqttReceiveTopic?: string;
  mqttKeepaliveSeconds: number;
};

export type RobotControlConfig = {
  mode: RobotControlMode;
  enabled: boolean;
  vendor: RobotVendorConfig;
};

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

function readOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readPort(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readInteger(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readMode(value: string | undefined): RobotControlMode {
  return value?.trim().toLowerCase() === "real" ? "real" : "mock";
}

export function readRobotControlConfig(env: NodeJS.ProcessEnv = process.env): RobotControlConfig {
  return {
    mode: readMode(env.ROBOT_CONTROL_MODE),
    enabled: readBoolean(env.ROBOT_CONTROL_ENABLED, false),
    vendor: {
      apiBaseUrl: readOptionalString(env.ROBOT_VENDOR_API_BASE_URL),
      appKey: readOptionalString(env.ROBOT_VENDOR_APP_KEY),
      appSecret: readOptionalString(env.ROBOT_VENDOR_APP_SECRET),
      token: readOptionalString(env.ROBOT_VENDOR_TOKEN),
      language: readOptionalString(env.ROBOT_VENDOR_LANGUAGE) ?? "zh-CN",
      serialNumber: readOptionalString(env.ROBOT_SERIAL_NUMBER),
      linearSpeed: readInteger(env.ROBOT_LINEAR_SPEED, 200),
      angularSpeed: readInteger(env.ROBOT_ANGULAR_SPEED, 25),
      sendIntervalMs: readInteger(env.ROBOT_SEND_INTERVAL_MS, 300),
      mqttHost: readOptionalString(env.ROBOT_MQTT_HOST),
      mqttPort: readPort(env.ROBOT_MQTT_PORT, 1883),
      mqttUsername: readOptionalString(env.ROBOT_MQTT_USERNAME),
      mqttPassword: readOptionalString(env.ROBOT_MQTT_PASSWORD),
      mqttClientId: readOptionalString(env.ROBOT_MQTT_CLIENT_ID),
      mqttPostTopic: readOptionalString(env.ROBOT_MQTT_POST_TOPIC),
      mqttReceiveTopic: readOptionalString(env.ROBOT_MQTT_RECEIVE_TOPIC),
      mqttKeepaliveSeconds: readInteger(env.ROBOT_MQTT_KEEPALIVE_SECONDS, 60)
    }
  };
}

export function getMissingRobotVendorFields(config: RobotControlConfig): string[] {
  if (config.mode !== "real") {
    return [];
  }

  const hasStaticMqttConfig = Boolean(
    config.vendor.mqttHost &&
      config.vendor.mqttUsername &&
      config.vendor.mqttPassword &&
      config.vendor.mqttClientId &&
      config.vendor.mqttPostTopic
  );

  if (hasStaticMqttConfig) {
    return [];
  }

  return [
    config.vendor.apiBaseUrl ? undefined : "ROBOT_VENDOR_API_BASE_URL",
    config.vendor.appKey ? undefined : "ROBOT_VENDOR_APP_KEY",
    config.vendor.token ? undefined : "ROBOT_VENDOR_TOKEN",
    config.vendor.serialNumber ? undefined : "ROBOT_SERIAL_NUMBER"
  ].filter((field): field is string => Boolean(field));
}
