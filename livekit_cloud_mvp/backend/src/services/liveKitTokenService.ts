import { AccessToken } from "livekit-server-sdk";
import { getLiveKitTokenMode } from "../config.js";
import type { MediaPermissions, Role } from "../types.js";

export type LiveKitTokenRequest = {
  roomName: string;
  identity: string;
  name: string;
  role: Role;
};

export type LiveKitTokenResponse = {
  liveKitUrl: string;
  token: string;
  isMock: boolean;
  mediaPermissions: MediaPermissions;
};

export class LiveKitTokenService {
  constructor(
    private readonly options: {
      liveKitUrl: string;
      apiKey?: string;
      apiSecret?: string;
      tokenTtl: string;
    }
  ) {}

  get tokenMode(): "mock" | "livekit" {
    return this.hasRealLiveKitConfig() ? "livekit" : "mock";
  }

  private hasRealLiveKitConfig(): boolean {
    return (
      this.options.liveKitUrl.trim().length > 0 &&
      getLiveKitTokenMode(this.options.liveKitUrl) === "livekit" &&
      Boolean(this.options.apiKey) &&
      Boolean(this.options.apiSecret)
    );
  }

  async generateToken(request: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    const mediaPermissions = this.getMediaPermissions(request.role);

    if (this.hasRealLiveKitConfig()) {
      return this.generateRealToken(request, mediaPermissions);
    }

    const payload = {
      mock: true,
      roomName: request.roomName,
      identity: request.identity,
      name: request.name,
      role: request.role,
      mediaPermissions,
      issuedAt: Date.now()
    };

    return {
      liveKitUrl: this.options.liveKitUrl,
      token: `mock.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`,
      isMock: true,
      mediaPermissions
    };
  }

  private getMediaPermissions(role: Role): MediaPermissions {
    const canPublish = role === "robot" || role === "controller" || role === "viewer";

    return {
      canSubscribe: true,
      canPublish,
      canPublishAudio: canPublish,
      canPublishVideo: canPublish
    };
  }

  private async generateRealToken(
    request: LiveKitTokenRequest,
    mediaPermissions: MediaPermissions
  ): Promise<LiveKitTokenResponse> {
    const accessToken = new AccessToken(this.options.apiKey, this.options.apiSecret, {
      identity: request.identity,
      name: request.name,
      ttl: this.options.tokenTtl,
      metadata: JSON.stringify({ role: request.role, mediaPermissions })
    });

    accessToken.addGrant({
      roomJoin: true,
      room: request.roomName,
      canPublish: mediaPermissions.canPublish,
      canSubscribe: mediaPermissions.canSubscribe,
      canPublishData: false
    });

    return {
      liveKitUrl: this.options.liveKitUrl,
      token: await accessToken.toJwt(),
      isMock: false,
      mediaPermissions
    };
  }
}
