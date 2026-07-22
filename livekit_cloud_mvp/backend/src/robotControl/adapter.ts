import type { RobotControlEventCommand, RobotControlLogParameters } from "../types.js";
import { getMissingRobotVendorFields, type RobotControlConfig, type RobotControlMode } from "./config.js";
import { PadBotRobotControlError, sendPadBotMqttCommand } from "./padBotMqtt.js";

export type RobotControlRequest = {
  roomName: string;
  senderId: string;
  robotId?: string;
  command: RobotControlEventCommand;
  parameters: RobotControlLogParameters;
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

function sanitizeParameters(parameters: RobotControlLogParameters): RobotControlLogParameters {
  return {
    ...(parameters.distanceCm !== undefined ? { distanceCm: parameters.distanceCm } : {}),
    ...(parameters.angleDeg !== undefined ? { angleDeg: parameters.angleDeg } : {}),
    ...(parameters.speed !== undefined ? { speed: parameters.speed } : {}),
    ...(parameters.lv !== undefined ? { lv: parameters.lv } : {}),
    ...(parameters.av !== undefined ? { av: parameters.av } : {}),
    ...(parameters.direction !== undefined ? { direction: parameters.direction } : {}),
    ...(parameters.stopReason !== undefined ? { stopReason: parameters.stopReason } : {})
  };
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

    try {
      await sendPadBotMqttCommand(this.config, request.command, request.parameters);
      console.log(
        `[robot-control:real] room=${request.roomName} from=${request.senderId} command=${request.command} parameters=${JSON.stringify(
          sanitizeParameters(request.parameters)
        )}`
      );

      return {
        ok: true,
        mode: this.mode,
        message: request.command === "1000" ? "Robot stop command sent" : "Robot control command sent"
      };
    } catch (error) {
      if (error instanceof PadBotRobotControlError) {
        return {
          ok: false,
          mode: this.mode,
          code: error.code,
          message: error.message
        };
      }

      return {
        ok: false,
        mode: this.mode,
        code: "ROBOT_CONTROL_FAILED",
        message: "Robot MQTT control request failed"
      };
    }
  }
}

export function createRobotControlAdapter(config: RobotControlConfig): RobotControlAdapter {
  return config.mode === "real" ? new VendorRobotControlAdapter(config) : new MockRobotControlAdapter();
}
