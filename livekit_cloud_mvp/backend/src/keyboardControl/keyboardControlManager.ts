import type { RobotControlAdapter } from "../robotControl/adapter.js";
import type { RoomStore } from "../state/roomStore.js";
import type {
  ApiErrorCode,
  KeyboardControlStatus,
  KeyboardDirection,
  RobotControlEventCommand,
  RobotControlLogParameters,
  RoomState
} from "../types.js";
import type { KeyboardControlConfig } from "./config.js";

type KeyboardControlRequest = {
  roomName: string;
  senderId: string;
  direction: unknown;
  linearSpeed: unknown;
  angularSpeed: unknown;
};

type KeyboardStopRequest = {
  roomName: string;
  senderId: string;
  reason: string;
};

type KeyboardControlSuccess = {
  ok: true;
  status: KeyboardControlStatus;
  message: string;
};

type KeyboardControlFailure = {
  ok: false;
  status: number;
  code: ApiErrorCode;
  message: string;
};

export type KeyboardControlResult = KeyboardControlSuccess | KeyboardControlFailure;

type KeyboardSession = {
  roomName: string;
  controllerId: string;
  direction: KeyboardDirection;
  linearSpeed: number;
  angularSpeed: number;
  startedAt: number;
  lastSeenAt: number;
  deadmanTimer?: NodeJS.Timeout;
  maxSessionTimer?: NodeJS.Timeout;
  pulseStopTimer?: NodeJS.Timeout;
};

type KeyboardControlCallbacks = {
  onStatus: (status: KeyboardControlStatus) => void;
  onControlEvent: (event: {
    roomName: string;
    command: RobotControlEventCommand;
    parameters: RobotControlLogParameters;
    from: string;
    timestamp: number;
  }) => void;
};

const DIRECTIONS = [
  "forward",
  "backward",
  "left",
  "right",
  "forward_left",
  "forward_right",
  "backward_left",
  "backward_right"
] as const satisfies KeyboardDirection[];
const FULL_SPEED_DUTY_THRESHOLD = 0.98;
const MIN_PULSE_ACTIVE_MS = 25;
const PULSE_STOP_MARGIN_MS = 25;
const SPEED_PULSE_STOP_REASON = "speed_pulse";

function isKeyboardDirection(value: unknown): value is KeyboardDirection {
  return typeof value === "string" && DIRECTIONS.includes(value as KeyboardDirection);
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function toVelocity(
  direction: KeyboardDirection,
  linearSpeed: number,
  angularSpeed: number
): { lv: number; av: number } {
  const lv = direction.includes("forward") ? linearSpeed : direction.includes("backward") ? -linearSpeed : 0;
  const av = direction.includes("left") ? angularSpeed : direction.includes("right") ? -angularSpeed : 0;
  return { lv, av };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hasLinearMotion(direction: KeyboardDirection): boolean {
  return direction.includes("forward") || direction.includes("backward");
}

function hasAngularMotion(direction: KeyboardDirection): boolean {
  return direction.includes("left") || direction.includes("right");
}

function speedDutyCycle(session: KeyboardSession, config: KeyboardControlConfig): number {
  const linearDuty = hasLinearMotion(session.direction) ? session.linearSpeed / config.maxLinearSpeed : 0;
  const angularDuty = hasAngularMotion(session.direction) ? session.angularSpeed / config.maxAngularSpeed : 0;
  return clamp(Math.max(linearDuty, angularDuty), 0, 1);
}

function pulseActiveMs(dutyCycle: number, sendIntervalMs: number): number {
  const interval = Math.max(1, sendIntervalMs);
  const maxActiveMs = Math.max(1, interval - PULSE_STOP_MARGIN_MS);
  return clamp(Math.round(interval * dutyCycle), MIN_PULSE_ACTIVE_MS, maxActiveMs);
}

function sanitizeReason(reason: string): string {
  return reason.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

export class KeyboardControlManager {
  private readonly sessions = new Map<string, KeyboardSession>();

  constructor(
    private readonly config: KeyboardControlConfig,
    private readonly roomStore: RoomStore,
    private readonly robotControlAdapter: RobotControlAdapter,
    private readonly callbacks: KeyboardControlCallbacks
  ) {}

  getPublicConfig(): KeyboardControlConfig {
    return { ...this.config };
  }

  getStatus(roomName: string): KeyboardControlStatus {
    const session = this.sessions.get(roomName);
    if (session) {
      return this.statusFromSession(session, true);
    }

    return (
      this.roomStore.getRoom(roomName)?.keyboardControl ?? {
        roomName,
        active: false,
        updatedAt: Date.now()
      }
    );
  }

  async start(request: KeyboardControlRequest): Promise<KeyboardControlResult> {
    const validation = this.validateControlRequest(request);
    if (!validation.ok) {
      return validation;
    }

    const existingSession = this.sessions.get(request.roomName);
    if (existingSession && existingSession.controllerId !== request.senderId) {
      return {
        ok: false,
        status: 409,
        code: "KEYBOARD_CONTROL_ACTIVE",
        message: "Keyboard control is already active in this room"
      };
    }

    const timestamp = Date.now();
    const sendResult = await this.sendVelocity(validation.room, request.senderId, validation.parameters, timestamp);
    if (!sendResult.ok) {
      return sendResult;
    }

    const session: KeyboardSession = {
      roomName: request.roomName,
      controllerId: request.senderId,
      direction: validation.direction,
      linearSpeed: validation.linearSpeed,
      angularSpeed: validation.angularSpeed,
      startedAt: existingSession?.startedAt ?? timestamp,
      lastSeenAt: timestamp
    };
    this.replaceSession(session);
    const status = this.statusFromSession(session, true);
    this.saveAndBroadcastStatus(status);
    console.log(
      `[keyboard-control] room=${request.roomName} controller=${request.senderId} direction=${validation.direction} linearSpeed=${validation.linearSpeed} angularSpeed=${validation.angularSpeed}`
    );

    return {
      ok: true,
      status,
      message: "Keyboard control started"
    };
  }

  async keepalive(request: KeyboardControlRequest): Promise<KeyboardControlResult> {
    const session = this.sessions.get(request.roomName);
    if (!session || session.controllerId !== request.senderId) {
      return {
        ok: false,
        status: 409,
        code: "KEYBOARD_CONTROL_INACTIVE",
        message: "Keyboard control session is not active"
      };
    }

    const validation = this.validateControlRequest(request);
    if (!validation.ok) {
      await this.forceStop(request.roomName, "invalid_keepalive");
      return validation;
    }

    const timestamp = Date.now();
    const sendResult = await this.sendVelocity(validation.room, request.senderId, validation.parameters, timestamp);
    if (!sendResult.ok) {
      await this.forceStop(request.roomName, "adapter_failed");
      return sendResult;
    }

    session.direction = validation.direction;
    session.linearSpeed = validation.linearSpeed;
    session.angularSpeed = validation.angularSpeed;
    session.lastSeenAt = timestamp;
    this.scheduleDeadmanTimer(session);
    this.schedulePulseStopTimer(session);
    const status = this.statusFromSession(session, true);
    this.saveAndBroadcastStatus(status);

    return {
      ok: true,
      status,
      message: "Keyboard control keepalive accepted"
    };
  }

  async stopByController(request: KeyboardStopRequest): Promise<KeyboardControlResult> {
    const session = this.sessions.get(request.roomName);
    if (!session) {
      const status = this.inactiveStatus(request.roomName, request.senderId, request.reason);
      this.saveAndBroadcastStatus(status);
      return {
        ok: true,
        status,
        message: "Keyboard control already stopped"
      };
    }

    if (session.controllerId !== request.senderId) {
      return {
        ok: false,
        status: 403,
        code: "NOT_CONTROLLER",
        message: "Only the active keyboard controller can stop this keyboard session"
      };
    }

    return this.stopSession(session, request.reason);
  }

  async forceStop(roomName: string, reason: string): Promise<KeyboardControlResult | undefined> {
    const session = this.sessions.get(roomName);
    if (!session) {
      const status = this.inactiveStatus(roomName, undefined, reason);
      this.saveAndBroadcastStatus(status);
      return undefined;
    }

    return this.stopSession(session, reason);
  }

  private validateControlRequest(request: KeyboardControlRequest):
    | {
        ok: true;
        room: RoomState;
        direction: KeyboardDirection;
        linearSpeed: number;
        angularSpeed: number;
        parameters: RobotControlLogParameters;
      }
    | KeyboardControlFailure {
    if (!this.config.enabled || !this.config.continuous1001Enabled) {
      return {
        ok: false,
        status: 403,
        code: "KEYBOARD_CONTROL_DISABLED",
        message: "Keyboard 1001 control is disabled on backend"
      };
    }

    const room = this.roomStore.getRoom(request.roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const participant = room.participants.get(request.senderId);
    if (!participant) {
      return {
        ok: false,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Sender is not in the room"
      };
    }

    if (room.currentControllerId !== request.senderId || participant.role !== "controller") {
      return {
        ok: false,
        status: 403,
        code: "NOT_CONTROLLER",
        message: "Only controller can use keyboard control"
      };
    }

    if (!room.robotOnline) {
      return {
        ok: false,
        status: 409,
        code: "ROBOT_OFFLINE",
        message: "Robot is offline"
      };
    }

    if (!isKeyboardDirection(request.direction)) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_PARAMETERS",
        message: "Keyboard direction is invalid"
      };
    }

    const linearSpeed = readPositiveNumber(request.linearSpeed);
    if (linearSpeed === undefined || linearSpeed > this.config.maxLinearSpeed) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_PARAMETERS",
        message: `linearSpeed must be greater than 0 and no more than ${this.config.maxLinearSpeed}`
      };
    }

    const angularSpeed = readPositiveNumber(request.angularSpeed);
    if (angularSpeed === undefined || angularSpeed > this.config.maxAngularSpeed) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_PARAMETERS",
        message: `angularSpeed must be greater than 0 and no more than ${this.config.maxAngularSpeed}`
      };
    }

    const velocity = toVelocity(request.direction, linearSpeed, angularSpeed);
    return {
      ok: true,
      room,
      direction: request.direction,
      linearSpeed,
      angularSpeed,
      parameters: {
        ...velocity,
        direction: request.direction
      }
    };
  }

  private async sendVelocity(
    room: RoomState,
    senderId: string,
    parameters: RobotControlLogParameters,
    timestamp: number
  ): Promise<KeyboardControlSuccess | KeyboardControlFailure> {
    const result = await this.robotControlAdapter.sendCommand({
      roomName: room.roomName,
      senderId,
      robotId: room.robotId,
      command: "1001",
      parameters,
      timestamp
    });

    if (!result.ok) {
      return {
        ok: false,
        status: 502,
        code: result.code,
        message: result.message
      };
    }

    this.roomStore.recordRobotControl(room.roomName, "1001", parameters, senderId, timestamp);
    this.callbacks.onControlEvent({
      roomName: room.roomName,
      command: "1001",
      parameters,
      from: senderId,
      timestamp
    });

    return {
      ok: true,
      status: this.getStatus(room.roomName),
      message: result.message
    };
  }

  private async sendStop(session: KeyboardSession, reason: string, timestamp: number): Promise<KeyboardControlFailure | undefined> {
    const room = this.roomStore.getRoom(session.roomName);
    const parameters: RobotControlLogParameters = { stopReason: sanitizeReason(reason) };
    const result = await this.robotControlAdapter.sendCommand({
      roomName: session.roomName,
      senderId: session.controllerId,
      robotId: room?.robotId,
      command: "1000",
      parameters,
      timestamp
    });

    this.roomStore.recordRobotControl(session.roomName, "1000", parameters, session.controllerId, timestamp);
    this.callbacks.onControlEvent({
      roomName: session.roomName,
      command: "1000",
      parameters,
      from: session.controllerId,
      timestamp
    });

    if (!result.ok) {
      return {
        ok: false,
        status: 502,
        code: result.code,
        message: result.message
      };
    }

    return undefined;
  }

  private async stopSession(session: KeyboardSession, reason: string): Promise<KeyboardControlResult> {
    this.clearTimers(session);
    this.sessions.delete(session.roomName);

    const timestamp = Date.now();
    const stopFailure = await this.sendStop(session, reason, timestamp);
    const status = this.inactiveStatus(session.roomName, session.controllerId, reason, timestamp);
    this.saveAndBroadcastStatus(status);
    console.log(
      `[keyboard-control] stop room=${session.roomName} controller=${session.controllerId} reason=${sanitizeReason(reason)}`
    );

    if (stopFailure) {
      return stopFailure;
    }

    return {
      ok: true,
      status,
      message: "Keyboard control stopped"
    };
  }

  private replaceSession(session: KeyboardSession): void {
    const existingSession = this.sessions.get(session.roomName);
    if (existingSession) {
      this.clearTimers(existingSession);
      session.startedAt = existingSession.startedAt;
    }

    this.sessions.set(session.roomName, session);
    this.scheduleDeadmanTimer(session);
    this.scheduleMaxSessionTimer(session);
    this.schedulePulseStopTimer(session);
  }

  private scheduleDeadmanTimer(session: KeyboardSession): void {
    if (session.deadmanTimer) {
      clearTimeout(session.deadmanTimer);
    }

    session.deadmanTimer = setTimeout(() => {
      void this.forceStop(session.roomName, "deadman_timeout");
    }, this.config.deadmanTimeoutMs);
  }

  private scheduleMaxSessionTimer(session: KeyboardSession): void {
    if (session.maxSessionTimer) {
      clearTimeout(session.maxSessionTimer);
    }

    if (this.config.maxSessionMs <= 0) {
      session.maxSessionTimer = undefined;
      return;
    }

    const elapsedMs = Date.now() - session.startedAt;
    const remainingMs = Math.max(0, this.config.maxSessionMs - elapsedMs);
    session.maxSessionTimer = setTimeout(() => {
      void this.forceStop(session.roomName, "max_session_timeout");
    }, remainingMs);
  }

  private schedulePulseStopTimer(session: KeyboardSession): void {
    if (session.pulseStopTimer) {
      clearTimeout(session.pulseStopTimer);
    }

    const dutyCycle = speedDutyCycle(session, this.config);
    if (dutyCycle >= FULL_SPEED_DUTY_THRESHOLD) {
      session.pulseStopTimer = undefined;
      return;
    }

    const activeMs = pulseActiveMs(dutyCycle, this.config.sendIntervalMs);
    session.pulseStopTimer = setTimeout(() => {
      session.pulseStopTimer = undefined;
      if (this.sessions.get(session.roomName) !== session) {
        return;
      }

      void this.sendPulseStop(session);
    }, activeMs);
  }

  private async sendPulseStop(session: KeyboardSession): Promise<void> {
    const stopFailure = await this.sendStop(session, SPEED_PULSE_STOP_REASON, Date.now());
    if (stopFailure) {
      await this.forceStop(session.roomName, "pulse_stop_failed");
    }
  }

  private clearTimers(session: KeyboardSession): void {
    if (session.deadmanTimer) {
      clearTimeout(session.deadmanTimer);
    }
    if (session.maxSessionTimer) {
      clearTimeout(session.maxSessionTimer);
    }
    if (session.pulseStopTimer) {
      clearTimeout(session.pulseStopTimer);
    }
  }

  private statusFromSession(session: KeyboardSession, active: boolean): KeyboardControlStatus {
    const room = this.roomStore.getRoom(session.roomName);
    const controller = room?.participants.get(session.controllerId);
    return {
      roomName: session.roomName,
      active,
      controllerId: session.controllerId,
      controllerName: controller?.name,
      direction: session.direction,
      linearSpeed: session.linearSpeed,
      angularSpeed: session.angularSpeed,
      updatedAt: Date.now()
    };
  }

  private inactiveStatus(
    roomName: string,
    controllerId: string | undefined,
    reason: string,
    timestamp = Date.now()
  ): KeyboardControlStatus {
    const room = this.roomStore.getRoom(roomName);
    const controller = controllerId ? room?.participants.get(controllerId) : undefined;
    return {
      roomName,
      active: false,
      controllerId,
      controllerName: controller?.name,
      stopReason: sanitizeReason(reason),
      updatedAt: timestamp
    };
  }

  private saveAndBroadcastStatus(status: KeyboardControlStatus): void {
    this.roomStore.setKeyboardControlStatus(status.roomName, status);
    this.callbacks.onStatus(status);
  }
}
