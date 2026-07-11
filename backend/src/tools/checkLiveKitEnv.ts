import "dotenv/config";
import { getLiveKitTokenMode, loadConfig } from "../config.js";

try {
  const config = loadConfig();
  const tokenMode = getLiveKitTokenMode(config.liveKitUrl);

  console.log(`LiveKit token mode: ${tokenMode}`);
  console.log(`LIVEKIT_URL scheme: ${config.liveKitUrl.split("://")[0]}://`);
  console.log(`LIVEKIT_API_KEY present: ${config.liveKitApiKey ? "yes" : "no"}`);
  console.log(`LIVEKIT_API_SECRET present: ${config.liveKitApiSecret ? "yes" : "no"}`);
  console.log("LiveKit env check passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : "LiveKit env check failed");
  process.exit(1);
}
