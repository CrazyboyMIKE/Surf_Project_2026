import type { ControlParameters, RobotCommand } from "../types.js";
import { getMissingRobotVendorFields, type RobotControlConfig, type RobotControlMode } from "./config.js";

export type RobotControlRequest = {
  roomName: string;
  senderId: string;
  robotId?: string;
  command: RobotCommand;
  parameters: ControlParameters;
  timestamp: number;
};

export type RobotControlResult =
  | {
      ok: true;
      mode: RobotControlMode;
      message: string;
    }
  | {
      ok: false;
      mode: RobotControlMode;
      code: "ROBOT_CONTROL_DISABLED" | "ROBOT_CONTROL_CONFIG_INCOMPLETE" | "ROBOT_CONTROL_FAILED";
      message: string;
    };

export interface RobotControlAdapter {
  readonly mode: RobotControlMode;
  sendCommand(request: RobotControlRequest): Promise<RobotControlResult>;
}

function sanitizeParameters(parameters: ControlParameters): ControlParameters {
  return {
    ...(parameters.distanceCm !== undefined ? { distanceCm: parameters.distanceCm } : {}),
    ...(parameters.angleDeg !== undefined ? { angleDeg: parameters.angleDeg } : {}),
    ...(parameters.speed !== undefined ? { speed: parameters.speed } : {})
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export class MockRobotControlAdapter implements RobotControlAdapter {
  readonly mode = "mock" as const;

  async sendCommand(request: RobotControlRequest): Promise<RobotControlResult> {
    console.log(
      `[robot-control:mock] room=${request.roomName} from=${request.senderId} command=${request.command} parameters=${JSON.stringify(
        sanitizeParameters(request.parameters)
      )}`
    );

    return {
      ok: true,
      mode: this.mode,
      message: "Robot control recorded in mock mode"
    };
  }
}

export class VendorRobotControlAdapter implements RobotControlAdapter {
  readonly mode = "real" as const;

  constructor(private readonly config: RobotControlConfig) {}

  async sendCommand(request: RobotControlRequest): Promise<RobotControlResult> {
    if (!this.config.enabled) {
      return {
        ok: false,
        mode: this.mode,
        code: "ROBOT_CONTROL_DISABLED",
        message: "Robot real control is disabled on backend"
      };
    }

    const missingFields = getMissingRobotVendorFields(this.config);
    if (missingFields.length > 0) {
      return {
        ok: false,
        mode: this.mode,
        code: "ROBOT_CONTROL_CONFIG_INCOMPLETE",
        message: "Robot real control is enabled but vendor config is incomplete"
      };
    }

    const apiBaseUrl = this.config.vendor.apiBaseUrl;
    const token = this.config.vendor.token;
    const serialNumber = this.config.vendor.serialNumber;
    if (!apiBaseUrl || !token || !serialNumber) {
      return {
        ok: false,
        mode: this.mode,
        code: "ROBOT_CONTROL_CONFIG_INCOMPLETE",
        message: "Robot real control is enabled but vendor config is incomplete"
      };
    }

    const endpoint = `${stripTrailingSlash(apiBaseUrl)}/robots/${encodeURIComponent(serialNumber)}/commands`;
    const body = {
      command: request.command,
      parameters: sanitizeParameters(request.parameters),
      roomName: request.roomName,
      requestId: `${request.timestamp}-${request.senderId}`,
      priority: request.command === "1000" ? "high" : "normal"
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(this.config.vendor.appKey ? { "X-Robot-App-Key": this.config.vendor.appKey } : {})
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        return {
          ok: false,
          mode: this.mode,
          code: "ROBOT_CONTROL_FAILED",
          message: `Robot vendor control request failed with HTTP ${response.status}`
        };
      }

      return {
        ok: true,
        mode: this.mode,
        message: request.command === "1000" ? "Robot stop command sent" : "Robot control command sent"
      };
    } catch {
      return {
        ok: false,
        mode: this.mode,
        code: "ROBOT_CONTROL_FAILED",
        message: "Robot vendor control request failed"
      };
    }
  }
}

export function createRobotControlAdapter(config: RobotControlConfig): RobotControlAdapter {
  return config.mode === "real" ? new VendorRobotControlAdapter(config) : new MockRobotControlAdapter();
}
