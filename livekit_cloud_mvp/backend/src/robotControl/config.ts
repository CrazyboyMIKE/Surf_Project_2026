export type RobotControlMode = "mock" | "real";

export type RobotVendorConfig = {
  apiBaseUrl?: string;
  appKey?: string;
  appSecret?: string;
  token?: string;
  serialNumber?: string;
  mqttHost?: string;
  mqttPort?: number;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttClientId?: string;
  mqttPostTopic?: string;
  mqttReceiveTopic?: string;
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
      serialNumber: readOptionalString(env.ROBOT_SERIAL_NUMBER),
      mqttHost: readOptionalString(env.ROBOT_MQTT_HOST),
      mqttPort: readPort(env.ROBOT_MQTT_PORT, 1883),
      mqttUsername: readOptionalString(env.ROBOT_MQTT_USERNAME),
      mqttPassword: readOptionalString(env.ROBOT_MQTT_PASSWORD),
      mqttClientId: readOptionalString(env.ROBOT_MQTT_CLIENT_ID),
      mqttPostTopic: readOptionalString(env.ROBOT_MQTT_POST_TOPIC),
      mqttReceiveTopic: readOptionalString(env.ROBOT_MQTT_RECEIVE_TOPIC)
    }
  };
}

export function getMissingRobotVendorFields(config: RobotControlConfig): string[] {
  if (config.mode !== "real") {
    return [];
  }

  return [
    config.vendor.apiBaseUrl ? undefined : "ROBOT_VENDOR_API_BASE_URL",
    config.vendor.token ? undefined : "ROBOT_VENDOR_TOKEN",
    config.vendor.serialNumber ? undefined : "ROBOT_SERIAL_NUMBER"
  ].filter((field): field is string => Boolean(field));
}
