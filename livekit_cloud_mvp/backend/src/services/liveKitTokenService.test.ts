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

const robotToken = await service.generateToken({
  roomName: "robot-room-001",
  identity: "robot-1",
  name: "Robot",
  role: "robot"
});

assert.equal(robotToken.mediaPermissions.canSubscribe, true);
assert.equal(robotToken.mediaPermissions.canPublish, true);
assert.equal(robotToken.mediaPermissions.canPublishAudio, true);
assert.equal(robotToken.mediaPermissions.canPublishVideo, true);
assert.equal(Object.prototype.hasOwnProperty.call(robotToken, "LIVEKIT_API_SECRET"), false);

console.log("liveKitTokenService tests passed");
