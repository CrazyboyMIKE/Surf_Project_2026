import { createHash } from "node:crypto";
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { RobotControlEventCommand, RobotControlLogParameters } from "../types.js";
import type { RobotControlConfig } from "./config.js";

const MQTT_INFO_PATH = "/cloud/openapirobot/applyRobotMqttInfo.action";
const MQTT_CONNECT_TIMEOUT_MS = 10_000;
const CONTROL_TOPIC_KEYS = [
  "robotControlTopic",
  "robotSubTopic",
  "subTopic",
  "robotPostTopic",
  "postTopic",
  "sendTopic",
  "publishTopic"
];
const RECEIVE_TOPIC_KEYS = [
  "robotStatusTopic",
  "robotPubTopic",
  "robotReceiveTopic",
  "pubTopic",
  "receiveTopic",
  "dataTopic",
  "statusTopic",
  "subscribeTopic",
  "subTopic"
];

type SafeRobotControlErrorCode = "ROBOT_CONTROL_CONFIG_INCOMPLETE" | "ROBOT_CONTROL_FAILED";

export class PadBotRobotControlError extends Error {
  constructor(
    readonly code: SafeRobotControlErrorCode,
    message: string
  ) {
    super(message);
  }
}

type ResolvedMqttInfo = {
  clientId: string;
  username: string;
  token: string;
  host: string;
  port: number;
  postTopic: string;
  receiveTopics: string[];
};

type ConnectedMqttSession = {
  client: MqttClient;
  info: ResolvedMqttInfo;
};

let cachedMqttSession: Promise<ConnectedMqttSession> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, undefined, 0);
}

function valueForSign(value: unknown): string {
  return isRecord(value) || Array.isArray(value) ? compactJson(value) : String(value);
}

function requireVendorField(value: string | undefined, fieldName: string): string {
  if (!value) {
    throw new PadBotRobotControlError(
      "ROBOT_CONTROL_CONFIG_INCOMPLETE",
      `Robot real control is enabled but ${fieldName} is missing`
    );
  }
  return value;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeMqttHost(host: string): string {
  if (!host.includes("://")) {
    return host;
  }

  try {
    return new URL(host).hostname;
  } catch {
    return host;
  }
}

function parseTopics(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseTopics(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function readMqttPort(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRobotItems(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawItems = data.robotMqttInfoList ?? data.mqttInfoList ?? data.robots ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.filter(isRecord);
}

function itemMatchesSerialNumber(item: Record<string, unknown>, serialNumber: string): boolean {
  const itemSerial =
    asString(item.serialNumber) ?? asString(item.sn) ?? asString(item.robotSn) ?? asString(item.robotSerialNumber);
  return !itemSerial || itemSerial === serialNumber;
}

function firstTopicFromKeys(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const topics = parseTopics(data[key]);
    if (topics.length > 0) {
      return topics[0];
    }
  }

  return undefined;
}

export function pickPadBotPostTopic(data: Record<string, unknown>, serialNumber: string, fallback?: string): string {
  if (fallback) {
    return fallback;
  }

  const topLevelTopic = firstTopicFromKeys(data, CONTROL_TOPIC_KEYS);
  if (topLevelTopic) {
    return topLevelTopic;
  }

  for (const item of getRobotItems(data)) {
    if (!itemMatchesSerialNumber(item, serialNumber)) {
      continue;
    }

    const itemTopic = firstTopicFromKeys(item, CONTROL_TOPIC_KEYS);
    if (itemTopic) {
      return itemTopic;
    }
  }

  throw new PadBotRobotControlError(
    "ROBOT_CONTROL_CONFIG_INCOMPLETE",
    "Robot MQTT post topic was not returned by vendor; configure ROBOT_MQTT_POST_TOPIC or check vendor MQTT info response"
  );
}

function pickPadBotReceiveTopics(
  data: Record<string, unknown>,
  serialNumber: string,
  fallback: string | undefined,
  postTopic: string
): string[] {
  const topics = parseTopics(fallback);

  for (const key of RECEIVE_TOPIC_KEYS) {
    topics.push(...parseTopics(data[key]));
  }

  for (const item of getRobotItems(data)) {
    if (!itemMatchesSerialNumber(item, serialNumber)) {
      continue;
    }

    for (const key of RECEIVE_TOPIC_KEYS) {
      topics.push(...parseTopics(item[key]));
    }
  }

  return [...new Set(topics.filter((topic) => topic !== postTopic))];
}

export function buildPadBotSignedPayload(
  config: RobotControlConfig,
  businessParams: Record<string, unknown> = {},
  timestampSeconds = Math.floor(Date.now() / 1000)
): Record<string, unknown> {
  const appKey = requireVendorField(config.vendor.appKey, "ROBOT_VENDOR_APP_KEY");
  const appToken = requireVendorField(config.vendor.token, "ROBOT_VENDOR_TOKEN");
  const signParts = Object.keys(businessParams)
    .sort()
    .map((key) => `${key}:${valueForSign(businessParams[key])}`);

  signParts.push(`time:${timestampSeconds}`);
  signParts.push(`appkey:${appKey}`);
  signParts.push(`apptoken:${appToken}`);

  const sign = createHash("md5").update(signParts.join(","), "utf8").digest("hex");

  return {
    system: {
      time: timestampSeconds,
      appkey: appKey,
      language: config.vendor.language,
      sign
    },
    ...businessParams
  };
}

export function buildPadBotControlPayload(
  command: RobotControlEventCommand,
  parameters: RobotControlLogParameters,
  config: RobotControlConfig
): string {
  const inner: Record<string, unknown> = { a: command };

  if (command === "1002") {
    inner.m = {
      d: parameters.distanceCm ?? 20,
      lv: Math.round(parameters.speed ?? config.vendor.linearSpeed)
    };
  }

  if (command === "1003") {
    inner.m = {
      a: parameters.angleDeg ?? 15,
      av: Math.round(parameters.speed ?? config.vendor.angularSpeed)
    };
  }

  if (command === "1001") {
    inner.m = {
      lv: Math.round(parameters.lv ?? 0),
      av: Math.round(parameters.av ?? 0)
    };
  }

  return compactJson({
    t: "83",
    m: compactJson(inner)
  });
}

function resolveStaticMqttInfo(config: RobotControlConfig): ResolvedMqttInfo | undefined {
  const { vendor } = config;
  if (
    !vendor.mqttHost ||
    !vendor.mqttUsername ||
    !vendor.mqttPassword ||
    !vendor.mqttClientId ||
    !vendor.mqttPostTopic
  ) {
    return undefined;
  }

  return {
    clientId: vendor.mqttClientId,
    username: vendor.mqttUsername,
    token: vendor.mqttPassword,
    host: vendor.mqttHost,
    port: vendor.mqttPort ?? 1883,
    postTopic: vendor.mqttPostTopic,
    receiveTopics: parseTopics(vendor.mqttReceiveTopic)
  };
}

async function applyPadBotMqttInfo(config: RobotControlConfig): Promise<ResolvedMqttInfo> {
  const apiBaseUrl = stripTrailingSlash(requireVendorField(config.vendor.apiBaseUrl, "ROBOT_VENDOR_API_BASE_URL"));
  const serialNumber = requireVendorField(config.vendor.serialNumber, "ROBOT_SERIAL_NUMBER");
  const endpoint = `${apiBaseUrl}${MQTT_INFO_PATH}`;
  const payload = buildPadBotSignedPayload(config);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new PadBotRobotControlError(
      "ROBOT_CONTROL_FAILED",
      `Robot MQTT info request failed with HTTP ${response.status}`
    );
  }

  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT info response was not valid JSON");
  }

  if (body.messageCode !== 10000) {
    throw new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT info request was rejected by vendor");
  }

  const data = body.data;
  if (!isRecord(data)) {
    throw new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT info response did not include data");
  }

  const clientId = asString(data.clientId);
  const username = asString(data.username);
  const token = asString(data.token);
  const host = asString(data.host);
  if (!clientId || !username || !token || !host) {
    throw new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT info response was incomplete");
  }

  const postTopic = pickPadBotPostTopic(data, serialNumber, config.vendor.mqttPostTopic);

  return {
    clientId,
    username,
    token,
    host,
    port: readMqttPort(data.port, config.vendor.mqttPort ?? 1883),
    postTopic,
    receiveTopics: pickPadBotReceiveTopics(data, serialNumber, config.vendor.mqttReceiveTopic, postTopic)
  };
}

async function resolvePadBotMqttInfo(config: RobotControlConfig): Promise<ResolvedMqttInfo> {
  return resolveStaticMqttInfo(config) ?? applyPadBotMqttInfo(config);
}

function buildMqttUrl(info: ResolvedMqttInfo): string {
  const host = normalizeMqttHost(info.host);
  const protocol = info.port === 8883 ? "mqtts" : "mqtt";
  return `${protocol}://${host}:${info.port}`;
}

async function connectMqtt(url: string, options: IClientOptions): Promise<MqttClient> {
  const client = mqtt.connect(url, options);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      client.end(true);
      reject(new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT connection timed out"));
    }, MQTT_CONNECT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      client.off("connect", handleConnect);
      client.off("error", handleError);
    };

    const handleConnect = () => {
      cleanup();
      resolve(client);
    };

    const handleError = () => {
      cleanup();
      client.end(true);
      reject(new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT connection failed"));
    };

    client.once("connect", handleConnect);
    client.once("error", handleError);
  });
}

async function subscribeReceiveTopics(client: MqttClient, topics: string[]): Promise<void> {
  const uniqueTopics = [...new Set(topics.filter(Boolean))];
  if (uniqueTopics.length === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    client.subscribe(uniqueTopics, { qos: 0 }, (error) => {
      if (error) {
        reject(new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT subscribe failed"));
        return;
      }

      resolve();
    });
  });
}

async function createMqttSession(config: RobotControlConfig): Promise<ConnectedMqttSession> {
  const info = await resolvePadBotMqttInfo(config);
  const client = await connectMqtt(buildMqttUrl(info), {
    clientId: info.clientId,
    username: info.username,
    password: info.token,
    keepalive: config.vendor.mqttKeepaliveSeconds,
    reconnectPeriod: 0,
    connectTimeout: MQTT_CONNECT_TIMEOUT_MS
  });

  client.on("message", () => {
    console.log("[robot-control:padbot] MQTT status message received");
  });
  client.on("close", () => {
    cachedMqttSession = undefined;
    console.log("[robot-control:padbot] MQTT connection closed");
  });
  client.on("offline", () => {
    cachedMqttSession = undefined;
    console.log("[robot-control:padbot] MQTT connection offline");
  });
  client.on("error", () => {
    cachedMqttSession = undefined;
    console.error("[robot-control:padbot] MQTT client error");
  });

  await subscribeReceiveTopics(client, info.receiveTopics);
  console.log(`[robot-control:padbot] MQTT connected receiveTopics=${info.receiveTopics.length}`);

  return {
    client,
    info
  };
}

async function getMqttSession(config: RobotControlConfig): Promise<ConnectedMqttSession> {
  if (cachedMqttSession) {
    const session = await cachedMqttSession;
    if (session.client.connected) {
      return session;
    }

    cachedMqttSession = undefined;
  }

  cachedMqttSession = createMqttSession(config);
  try {
    return await cachedMqttSession;
  } catch (error) {
    cachedMqttSession = undefined;
    throw error;
  }
}

function resetMqttSession(session: ConnectedMqttSession): void {
  cachedMqttSession = undefined;
  session.client.end(true);
}

async function publishMqttCommand(config: RobotControlConfig, payload: string): Promise<void> {
  const session = await getMqttSession(config);

  await new Promise<void>((resolve, reject) => {
    session.client.publish(session.info.postTopic, payload, { qos: 0 }, (error) => {
      if (error) {
        resetMqttSession(session);
        reject(new PadBotRobotControlError("ROBOT_CONTROL_FAILED", "Robot MQTT publish failed"));
        return;
      }

      resolve();
    });
  });
}

export async function sendPadBotMqttCommand(
  config: RobotControlConfig,
  command: RobotControlEventCommand,
  parameters: RobotControlLogParameters
): Promise<void> {
  const payload = buildPadBotControlPayload(command, parameters, config);
  await publishMqttCommand(config, payload);
}
