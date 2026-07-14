import type { ApiErrorCode, ControlParameters, RobotCommand, RoomState } from "../types.js";

export const ALLOWED_COMMANDS = ["1002", "1003", "1000"] as const;

const MAX_DISTANCE_CM = 100;
const MAX_ROTATION_DEG = 180;

type ValidationSuccess = {
  ok: true;
  command: RobotCommand;
  parameters: ControlParameters;
};

type ValidationFailure = {
  ok: false;
  code: ApiErrorCode;
  message: string;
};

export type RobotControlValidationResult = ValidationSuccess | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRobotCommand(command: unknown): RobotCommand | undefined {
  if (typeof command !== "string") {
    return undefined;
  }

  return ALLOWED_COMMANDS.includes(command as RobotCommand) ? (command as RobotCommand) : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeControlParameters(
  command: RobotCommand,
  rawParameters: unknown
): RobotControlValidationResult {
  const parameters = rawParameters === undefined ? {} : rawParameters;

  if (!isRecord(parameters)) {
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: "Control parameters must be an object"
    };
  }

  if (command === "1002") {
    const distanceCm = readFiniteNumber(parameters.distanceCm);
    const normalizedDistance = distanceCm ?? 20;

    if (Math.abs(normalizedDistance) > MAX_DISTANCE_CM) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: `distanceCm must be between -${MAX_DISTANCE_CM} and ${MAX_DISTANCE_CM}`
      };
    }

    return {
      ok: true,
      command,
      parameters: { distanceCm: normalizedDistance }
    };
  }

  if (command === "1003") {
    const angleDeg = readFiniteNumber(parameters.angleDeg);
    const normalizedAngle = angleDeg ?? 15;

    if (Math.abs(normalizedAngle) > MAX_ROTATION_DEG) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: `angleDeg must be between -${MAX_ROTATION_DEG} and ${MAX_ROTATION_DEG}`
      };
    }

    return {
      ok: true,
      command,
      parameters: { angleDeg: normalizedAngle }
    };
  }

  if (Object.keys(parameters).length > 0) {
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: "Stop command must not include movement parameters"
    };
  }

  return {
    ok: true,
    command,
    parameters: {}
  };
}

export function validateRobotControlMessage(options: {
  room: RoomState | undefined;
  senderId: unknown;
  command: unknown;
  parameters: unknown;
}): RobotControlValidationResult {
  const { room, senderId } = options;

  if (!room) {
    return {
      ok: false,
      code: "ROOM_NOT_FOUND",
      message: "Room does not exist"
    };
  }

  if (typeof senderId !== "string" || senderId.trim().length === 0) {
    return {
      ok: false,
      code: "PARTICIPANT_NOT_FOUND",
      message: "senderId is required"
    };
  }

  const participant = room.participants.get(senderId);
  if (!participant) {
    return {
      ok: false,
      code: "PARTICIPANT_NOT_FOUND",
      message: "Sender is not in the room"
    };
  }

  if (room.currentControllerId !== senderId || participant.role !== "controller") {
    return {
      ok: false,
      code: "NOT_CONTROLLER",
      message: "Only controller can send robot control"
    };
  }

  const command = parseRobotCommand(options.command);
  if (!command) {
    return {
      ok: false,
      code: "COMMAND_NOT_ALLOWED",
      message: "Command must be one of 1002, 1003, or 1000"
    };
  }

  if (!room.robotOnline) {
    return {
      ok: false,
      code: "ROBOT_OFFLINE",
      message: "Robot is offline"
    };
  }

  return normalizeControlParameters(command, options.parameters);
}
