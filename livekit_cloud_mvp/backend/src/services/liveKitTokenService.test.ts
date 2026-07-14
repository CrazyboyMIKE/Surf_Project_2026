import assert from "node:assert/strict";
import { LiveKitTokenService } from "./liveKitTokenService.js";

const service = new LiveKitTokenService({
  liveKitUrl: "mock://livekit",
  tokenTtl: "1h"
});

const viewerToken = await service.generateToken({
  roomName: "robot-room-001",
  identity: "viewer-1",
  name: "Viewer",
  role: "viewer"
});

assert.equal(viewerToken.mediaPermissions.canSubscribe, true);
assert.equal(viewerToken.mediaPermissions.canPublish, true);
assert.equal(viewerToken.mediaPermissions.canPublishAudio, true);
assert.equal(viewerToken.mediaPermissions.canPublishVideo, true);

console.log("liveKitTokenService tests passed");
