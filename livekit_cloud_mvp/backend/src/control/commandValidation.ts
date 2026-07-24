import type { ApiErrorCode, ControlParameters, RobotCommand, RoomState } from "../types.js";

export const ALLOWED_COMMANDS = ["1000", "1002", "1003", "1004", "1005", "1006"] as const;

const MAX_DISTANCE_CM = 100;
const MAX_ROTATION_DEG = 180;
const MAX_SPEED = 600;
const MIN_HEAD_ANGLE_DEG = 0;
const MAX_HEAD_ANGLE_DEG = 180;
const MAX_HEAD_ANGULAR_SPEED = 120;

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

type SpeedValidationResult =
  | {
      ok: true;
      speed?: number;
    }
  | ValidationFailure;

type HeadAngularSpeedValidationResult =
  | {
      ok: true;
      av: number;
    }
  | ValidationFailure;

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

function hasOnlyAllowedKeys(parameters: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(parameters).every((key) => allowedKeys.includes(key));
}

function readIntegerNumber(value: unknown): number | undefined {
  const numberValue = readFiniteNumber(value);
  return numberValue !== undefined && Number.isInteger(numberValue) ? numberValue : undefined;
}

function readSpeed(parameters: Record<string, unknown>): SpeedValidationResult {
  if (parameters.speed === undefined) {
    return { ok: true };
  }

  const speed = readFiniteNumber(parameters.speed);
  if (speed === undefined || speed <= 0 || speed > MAX_SPEED) {
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: `speed must be greater than 0 and no more than ${MAX_SPEED}`
    };
  }

  return {
    ok: true,
    speed
  };
}

function readHeadAngularSpeed(parameters: Record<string, unknown>): HeadAngularSpeedValidationResult {
  const av = readFiniteNumber(parameters.av);
  if (av === undefined || av <= 0 || av > MAX_HEAD_ANGULAR_SPEED) {
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: `av must be greater than 0 and no more than ${MAX_HEAD_ANGULAR_SPEED}`
    };
  }

  return {
    ok: true,
    av
  };
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
    if (!hasOnlyAllowedKeys(parameters, ["distanceCm", "speed"])) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "1002 only accepts distanceCm and speed"
      };
    }

    const distanceCm = readFiniteNumber(parameters.distanceCm);
    const normalizedDistance = distanceCm ?? 20;
    const speedResult = readSpeed(parameters);
    if (!speedResult.ok) {
      return speedResult;
    }

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
      parameters: { distanceCm: normalizedDistance, ...(speedResult.speed !== undefined ? { speed: speedResult.speed } : {}) }
    };
  }

  if (command === "1003") {
    if (!hasOnlyAllowedKeys(parameters, ["angleDeg", "speed"])) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "1003 only accepts angleDeg and speed"
      };
    }

    const angleDeg = readFiniteNumber(parameters.angleDeg);
    const normalizedAngle = angleDeg ?? 15;
    const speedResult = readSpeed(parameters);
    if (!speedResult.ok) {
      return speedResult;
    }

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
      parameters: { angleDeg: normalizedAngle, ...(speedResult.speed !== undefined ? { speed: speedResult.speed } : {}) }
    };
  }

  if (command === "1004") {
    if (Object.keys(parameters).length > 0) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "1004 head stop must not include movement parameters"
      };
    }

    return {
      ok: true,
      command,
      parameters: {}
    };
  }

  if (command === "1005") {
    if (!hasOnlyAllowedKeys(parameters, ["d", "a", "av"])) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "1005 only accepts d, a, and av"
      };
    }

    const d = readIntegerNumber(parameters.d);
    if (d !== 1 && d !== 2) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "d must be 1 for vertical head movement or 2 for horizontal head movement"
      };
    }

    const a = readFiniteNumber(parameters.a);
    if (a === undefined || a < MIN_HEAD_ANGLE_DEG || a > MAX_HEAD_ANGLE_DEG) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: `a must be between ${MIN_HEAD_ANGLE_DEG} and ${MAX_HEAD_ANGLE_DEG}`
      };
    }

    const avResult = readHeadAngularSpeed(parameters);
    if (!avResult.ok) {
      return avResult;
    }

    return {
      ok: true,
      command,
      parameters: { d, a, av: avResult.av }
    };
  }

  if (command === "1006") {
    if (!hasOnlyAllowedKeys(parameters, ["d"])) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "1006 only accepts d"
      };
    }

    const d = parameters.d === undefined ? 0 : readIntegerNumber(parameters.d);
    if (d !== 0 && d !== 1 && d !== 2) {
      return {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "d must be 0, 1, or 2"
      };
    }

    return {
      ok: true,
      command,
      parameters: { d }
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
      message: "Command must be one of 1000, 1002, 1003, 1004, 1005, or 1006"
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
