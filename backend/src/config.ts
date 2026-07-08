export type AppConfig = {
  port: number;
  corsOrigins: string[];
  liveKitUrl: string;
  liveKitApiKey?: string;
  liveKitApiSecret?: string;
  liveKitTokenTtl: string;
  mockRobotOnline: boolean;
};

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

export function loadConfig(): AppConfig {
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  const corsOrigins = (
    process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: Number.isFinite(port) ? port : 3001,
    corsOrigins,
    liveKitUrl: process.env.LIVEKIT_URL?.trim() || "mock://livekit",
    liveKitApiKey: process.env.LIVEKIT_API_KEY?.trim() || undefined,
    liveKitApiSecret: process.env.LIVEKIT_API_SECRET?.trim() || undefined,
    liveKitTokenTtl: process.env.LIVEKIT_TOKEN_TTL?.trim() || "1h",
    mockRobotOnline: readBoolean(process.env.MOCK_ROBOT_ONLINE, true)
  };
}
