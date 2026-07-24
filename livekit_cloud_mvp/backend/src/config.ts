import { readKeyboardControlConfig, type KeyboardControlConfig } from "./keyboardControl/config.js";
import { readRobotControlConfig, type RobotControlConfig } from "./robotControl/config.js";

export type AppConfig = {
  port: number;
  publicBaseUrl: string;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
  roomRecordRetentionDays: number;
  liveKitUrl: string;
  liveKitApiKey?: string;
  liveKitApiSecret?: string;
  liveKitTokenTtl: string;
  mockRobotOnline: boolean;
  robotControl: RobotControlConfig;
  keyboardControl: KeyboardControlConfig;
  adminEnabled: boolean;
  adminToken?: string;
};

export type LiveKitTokenMode = "mock" | "livekit";

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

function readPositiveInteger(value: string | undefined, defaultValue: number, maxValue: number): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return Math.min(parsed, maxValue);
}

export function getLiveKitTokenMode(liveKitUrl: string): LiveKitTokenMode {
  return liveKitUrl.startsWith("mock://") ? "mock" : "livekit";
}

export function validateLiveKitConfig(values: {
  liveKitUrl: string;
  liveKitApiKey?: string;
  liveKitApiSecret?: string;
}): void {
  const { liveKitUrl, liveKitApiKey, liveKitApiSecret } = values;

  if (getLiveKitTokenMode(liveKitUrl) === "mock") {
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(liveKitUrl);
  } catch {
    throw new Error("LIVEKIT_URL must be mock://livekit or a LiveKit Cloud wss:// URL");
  }

  if (parsedUrl.protocol !== "wss:" || !parsedUrl.hostname.endsWith(".livekit.cloud")) {
    throw new Error("LIVEKIT_URL must use LiveKit Cloud, for example wss://your-project.livekit.cloud");
  }

  const missingValues = [
    liveKitApiKey ? undefined : "LIVEKIT_API_KEY",
    liveKitApiSecret ? undefined : "LIVEKIT_API_SECRET"
  ].filter((name): name is string => Boolean(name));

  if (missingValues.length > 0) {
    throw new Error(`${missingValues.join(" and ")} must be set when LIVEKIT_URL uses LiveKit Cloud`);
  }
}

export function loadConfig(): AppConfig {
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim() || `http://localhost:${Number.isFinite(port) ? port : 3001}`;
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const corsOrigins = (
    process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const liveKitUrl = process.env.LIVEKIT_URL?.trim() || "mock://livekit";
  const liveKitApiKey = process.env.LIVEKIT_API_KEY?.trim() || undefined;
  const liveKitApiSecret = process.env.LIVEKIT_API_SECRET?.trim() || undefined;
  const databaseUrl = process.env.DATABASE_URL?.trim() || "file:./data/livekit_cloud_mvp.sqlite";
  const roomRecordRetentionDays = readPositiveInteger(process.env.ROOM_RECORD_RETENTION_DAYS, 30, 30);
  const adminEnabled = readBoolean(process.env.ADMIN_ENABLED, false);
  const adminToken = process.env.ADMIN_TOKEN?.trim() || undefined;

  validateLiveKitConfig({
    liveKitUrl,
    liveKitApiKey,
    liveKitApiSecret
  });

  if (adminEnabled && (!adminToken || adminToken === "CHANGE_ME_ADMIN_TOKEN")) {
    throw new Error("ADMIN_TOKEN must be set to a strong non-default value when ADMIN_ENABLED=true");
  }

  return {
    port: Number.isFinite(port) ? port : 3001,
    publicBaseUrl,
    nodeEnv,
    corsOrigins,
    databaseUrl,
    roomRecordRetentionDays,
    liveKitUrl,
    liveKitApiKey,
    liveKitApiSecret,
    liveKitTokenTtl: process.env.LIVEKIT_TOKEN_TTL?.trim() || "1h",
    mockRobotOnline: readBoolean(process.env.MOCK_ROBOT_ONLINE, true),
    robotControl: readRobotControlConfig(),
    keyboardControl: readKeyboardControlConfig(),
    adminEnabled,
    adminToken
  };
}
