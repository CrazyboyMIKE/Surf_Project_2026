import { AccessToken } from "livekit-server-sdk";
import type { Role } from "../types.js";

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
      this.options.liveKitUrl !== "mock://livekit" &&
      Boolean(this.options.apiKey) &&
      Boolean(this.options.apiSecret)
    );
  }

  async generateToken(request: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    if (this.hasRealLiveKitConfig()) {
      return this.generateRealToken(request);
    }

    const payload = {
      mock: true,
      roomName: request.roomName,
      identity: request.identity,
      name: request.name,
      role: request.role,
      issuedAt: Date.now()
    };

    return {
      liveKitUrl: this.options.liveKitUrl,
      token: `mock.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`,
      isMock: true
    };
  }

  private async generateRealToken(request: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    const canPublish = request.role === "robot";
    const accessToken = new AccessToken(this.options.apiKey, this.options.apiSecret, {
      identity: request.identity,
      name: request.name,
      ttl: this.options.tokenTtl,
      metadata: JSON.stringify({ role: request.role })
    });

    accessToken.addGrant({
      roomJoin: true,
      room: request.roomName,
      canPublish,
      canSubscribe: true,
      canPublishData: false
    });

    return {
      liveKitUrl: this.options.liveKitUrl,
      token: await accessToken.toJwt(),
      isMock: false
    };
  }
}
