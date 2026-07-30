import { randomUUID } from "node:crypto";
import type { RoomHistoryRepository } from "../db/roomHistoryRepository.js";
import type {
  AdminRoomDetail,
  AdminRoomSummary,
  ControlRequestQueueSnapshot,
  KeyboardControlStatus,
  Participant,
  RobotControlEventCommand,
  RobotControlLogParameters,
  RoomSnapshot,
  RoomRecordDetail,
  RoomRecordSummary,
  RoomState,
  SpeakerStateSnapshot,
  WebRole
} from "../types.js";

const OFFLINE_CLEANUP_AFTER_MS = 30_000;

export type JoinWebParticipantResult = {
  room: RoomState;
  participant: Participant;
  requestedControllerGranted: boolean;
  reusedParticipant: boolean;
};

export type JoinRobotResult = {
  room: RoomState;
  participant: Participant;
  reusedParticipant: boolean;
};

export type ControlRequestResult =
  | {
      ok: true;
      room: RoomState;
      participant: Participant;
      granted: boolean;
      queued: boolean;
      message: string;
    }
  | {
      ok: false;
      room?: RoomState;
      status: number;
      code: "ROOM_NOT_FOUND" | "PARTICIPANT_NOT_FOUND" | "FORBIDDEN" | "TARGET_OFFLINE";
      role: WebRole;
      message: string;
    };

export type ControlReleaseResult =
  | {
      ok: true;
      room: RoomState;
      released: boolean;
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: "ROOM_NOT_FOUND" | "PARTICIPANT_NOT_FOUND";
      message: string;
    };

export type ControlTransferResult =
  | {
      ok: true;
      room: RoomState;
      previousController: Participant;
      newController: Participant;
      message: string;
    }
  | {
      ok: false;
      room?: RoomState;
      status: number;
      code:
        | "ROOM_NOT_FOUND"
        | "PARTICIPANT_NOT_FOUND"
        | "FORBIDDEN"
        | "NOT_CONTROLLER"
        | "CONTROL_REQUEST_NOT_FOUND"
        | "TARGET_NOT_VIEWER"
        | "TARGET_OFFLINE";
      message: string;
    };

export type SpeakerRequestResult =
  | {
      ok: true;
      room: RoomState;
      speaker: Participant;
      message: string;
    }
  | {
      ok: false;
      room?: RoomState;
      status: number;
      code: "ROOM_NOT_FOUND" | "PARTICIPANT_NOT_FOUND" | "FORBIDDEN" | "TARGET_OFFLINE";
      message: string;
    };

export type SpeakerEndResult =
  | {
      ok: true;
      room: RoomState;
      endedSpeaker: Participant;
      message: string;
    }
  | {
      ok: false;
      room?: RoomState;
      status: number;
      code: "ROOM_NOT_FOUND" | "PARTICIPANT_NOT_FOUND" | "NOT_SPEAKER" | "TARGET_OFFLINE";
      message: string;
    };

export type AdminReleaseControlResult =
  | {
      ok: true;
      room: RoomState;
      released: boolean;
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: "ROOM_NOT_FOUND";
      message: string;
    };

export type CleanupParticipantsResult =
  | {
      ok: true;
      room: RoomState;
      removedCount: number;
    }
  | {
      ok: false;
      status: number;
      code: "ROOM_NOT_FOUND";
      message: string;
    };

export type CloseRoomResult =
  | {
      ok: true;
      closedParticipants?: Participant[];
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: "ROOM_NOT_FOUND" | "ROOM_NOT_EMPTY";
      message: string;
      room?: RoomState;
    };

export type AdminKickParticipantResult =
  | {
      ok: true;
      room?: RoomState;
      kickedParticipant: Participant;
      controllerReleased: boolean;
      robotStatusChanged: boolean;
      roomDeleted: boolean;
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: "ROOM_NOT_FOUND" | "PARTICIPANT_NOT_FOUND";
      message: string;
    };

export type AdminCloseRoomResult =
  | {
      ok: true;
      closedParticipants: Participant[];
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: "ROOM_NOT_FOUND";
      message: string;
    };

export type RemoveParticipantResult = {
  room?: RoomState;
  removedParticipant?: Participant;
  controllerReleased: boolean;
  robotStatusChanged: boolean;
  roomDeleted: boolean;
};

export class RoomStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly historyRepository?: RoomHistoryRepository;

  constructor(private readonly options: { mockRobotOnline: boolean; historyRepository?: RoomHistoryRepository }) {
    this.historyRepository = options.historyRepository;
  }

  getRoom(roomName: string): RoomState | undefined {
    return this.rooms.get(roomName);
  }

  getOrCreateRoom(roomName: string): RoomState {
    const existingRoom = this.rooms.get(roomName);
    if (existingRoom) {
      return existingRoom;
    }

    const room: RoomState = {
      roomName,
      robotOnline: this.options.mockRobotOnline,
      participants: new Map(),
      controllerRequestQueue: [],
      speakerQueue: [],
      updatedAt: Date.now()
    };

    this.rooms.set(roomName, room);
    this.ensureHistoryRoom(room);
    return room;
  }

  joinWebParticipant(
    roomName: string,
    participantName: string,
    requestedRole: WebRole,
    options: { previousParticipantId?: string; clientSessionId?: string } = {}
  ): JoinWebParticipantResult {
    const room = this.getOrCreateRoom(roomName);
    this.normalizeControllerRequestQueue(room);
    const now = Date.now();
    const reusableParticipant = this.findReusableWebParticipant(room, participantName, options);
    if (reusableParticipant) {
      const canGrantController = requestedRole === "controller" && !room.currentControllerId;
      if (canGrantController) {
        this.removeControlRequest(room, reusableParticipant.id);
        reusableParticipant.role = "controller";
        room.currentControllerId = reusableParticipant.id;
      }
      reusableParticipant.name = participantName;
      reusableParticipant.clientSessionId = options.clientSessionId ?? reusableParticipant.clientSessionId;
      reusableParticipant.lastSeenAt = now;
      reusableParticipant.disconnectedAt = undefined;
      this.touchRoom(room, now);
      this.persistParticipant(room, reusableParticipant, "participant_joined", now);

      return {
        room,
        participant: reusableParticipant,
        requestedControllerGranted: reusableParticipant.role === "controller",
        reusedParticipant: true
      };
    }

    const participantId = `user-${randomUUID()}`;
    const canGrantController = requestedRole === "controller" && !room.currentControllerId;
    const role: WebRole = canGrantController ? "controller" : "viewer";

    const participant: Participant = {
      id: participantId,
      name: participantName,
      role,
      clientSessionId: options.clientSessionId,
      connected: false,
      joinedAt: now,
      lastSeenAt: now
    };

    room.participants.set(participantId, participant);
    if (role === "controller") {
      this.removeControlRequest(room, participantId);
      room.currentControllerId = participantId;
    }
    this.touchRoom(room);
    this.persistParticipant(room, participant, "participant_joined", now);
    if (role === "controller") {
      this.recordHistoryEvent(room, "controller_changed", participant, {
        participantId,
        participantName,
        role
      }, now);
    }

    return {
      room,
      participant,
      requestedControllerGranted: canGrantController,
      reusedParticipant: false
    };
  }

  joinRobot(
    roomName: string,
    robotId: string,
    options: { previousParticipantId?: string; clientSessionId?: string } = {}
  ): JoinRobotResult {
    const room = this.getOrCreateRoom(roomName);
    const now = Date.now();
    const participantId = `robot-${robotId}`;
    const previousParticipant = options.previousParticipantId ? room.participants.get(options.previousParticipantId) : undefined;
    const reusableParticipant =
      previousParticipant?.role === "robot" && previousParticipant.id === participantId && previousParticipant.name === robotId
        ? previousParticipant
        : room.participants.get(participantId);
    const participant: Participant = reusableParticipant ?? {
      id: participantId,
      name: robotId,
      role: "robot",
      connected: true,
      joinedAt: now,
      lastSeenAt: now
    };

    participant.name = robotId;
    participant.clientSessionId = options.clientSessionId ?? participant.clientSessionId;
    participant.connected = true;
    participant.lastSeenAt = now;
    participant.disconnectedAt = undefined;

    room.robotId = robotId;
    room.robotOnline = true;
    room.participants.set(participantId, participant);
    this.touchRoom(room);
    this.persistParticipant(room, participant, "robot_online", now);

    return {
      room,
      participant,
      reusedParticipant: Boolean(reusableParticipant)
    };
  }

  requestControl(roomName: string, participantId: string): ControlRequestResult {
    const room = this.getRoom(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        role: "viewer",
        message: "Room does not exist"
      };
    }

    this.normalizeControllerRequestQueue(room);
    const participant = room.participants.get(participantId);
    if (!participant) {
      return {
        ok: false,
        room,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        role: "viewer",
        message: "Participant is not in this room"
      };
    }

    if (participant.role === "robot") {
      return {
        ok: false,
        room,
        status: 403,
        code: "FORBIDDEN",
        role: "viewer",
        message: "Robot cannot request control"
      };
    }

    if (!participant.connected) {
      return {
        ok: false,
        room,
        status: 409,
        code: "TARGET_OFFLINE",
        role: participant.role === "controller" ? "controller" : "viewer",
        message: "Participant is offline"
      };
    }

    if (room.currentControllerId && room.currentControllerId !== participantId) {
      participant.role = "viewer";
      const alreadyQueued = room.controllerRequestQueue.includes(participantId);
      if (!alreadyQueued) {
        room.controllerRequestQueue.push(participantId);
      }
      participant.lastSeenAt = Date.now();
      this.touchRoom(room, participant.lastSeenAt);
      this.persistParticipant(room, participant, undefined, participant.lastSeenAt);

      return {
        ok: true,
        room,
        participant,
        granted: false,
        queued: true,
        message: alreadyQueued ? "Control request already queued" : "Control request queued"
      };
    }

    if (room.currentControllerId === participantId && participant.role === "controller") {
      this.removeControlRequest(room, participantId);
      participant.lastSeenAt = Date.now();
      this.touchRoom(room, participant.lastSeenAt);
      return {
        ok: true,
        room,
        participant,
        granted: true,
        queued: false,
        message: "Already controller"
      };
    }

    this.removeControlRequest(room, participantId);
    participant.role = "controller";
    room.currentControllerId = participantId;
    this.normalizeSpeakerState(room);
    participant.lastSeenAt = Date.now();
    this.touchRoom(room);
    this.persistParticipant(room, participant, "controller_changed", participant.lastSeenAt, {
      participantId,
      participantName: participant.name,
      role: participant.role
    });

    return {
      ok: true,
      room,
      participant,
      granted: true,
      queued: false,
      message: "Control granted"
    };
  }

  releaseControl(roomName: string, participantId: string): ControlReleaseResult {
    const room = this.getRoom(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const participant = room.participants.get(participantId);
    if (!participant || participant.role === "robot") {
      return {
        ok: false,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Participant is not in this room"
      };
    }

    const released = room.currentControllerId === participantId;
    if (released) {
      room.currentControllerId = undefined;
    }
    this.removeControlRequest(room, participantId);
    participant.role = "viewer";
    this.normalizeSpeakerState(room);
    this.normalizeControllerRequestQueue(room);
    participant.lastSeenAt = Date.now();
    this.touchRoom(room);
    this.persistParticipant(room, participant, released ? "controller_changed" : undefined, participant.lastSeenAt, {
      participantId,
      participantName: participant.name,
      role: participant.role
    });

    return {
      ok: true,
      room,
      released,
      message: released ? "Control released" : "Participant was not the active controller"
    };
  }

  transferControl(roomName: string, fromParticipantId: string, targetParticipantId: string): ControlTransferResult {
    const room = this.getRoom(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    this.normalizeControllerRequestQueue(room);
    const fromParticipant = room.participants.get(fromParticipantId);
    if (!fromParticipant) {
      return {
        ok: false,
        room,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Current controller participant is not in this room"
      };
    }

    if (fromParticipant.role === "robot") {
      return {
        ok: false,
        room,
        status: 403,
        code: "FORBIDDEN",
        message: "Robot cannot approve control requests"
      };
    }

    if (room.currentControllerId !== fromParticipantId || fromParticipant.role !== "controller") {
      return {
        ok: false,
        room,
        status: 403,
        code: "NOT_CONTROLLER",
        message: "Only the active controller can transfer control"
      };
    }

    const targetParticipant = room.participants.get(targetParticipantId);
    if (!targetParticipant) {
      return {
        ok: false,
        room,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Target participant is not in this room"
      };
    }

    if (targetParticipant.role !== "viewer") {
      return {
        ok: false,
        room,
        status: 400,
        code: "TARGET_NOT_VIEWER",
        message: "Control can only be transferred to an online viewer"
      };
    }

    if (!targetParticipant.connected) {
      return {
        ok: false,
        room,
        status: 409,
        code: "TARGET_OFFLINE",
        message: "Target viewer is offline"
      };
    }

    if (!room.controllerRequestQueue.includes(targetParticipantId)) {
      return {
        ok: false,
        room,
        status: 409,
        code: "CONTROL_REQUEST_NOT_FOUND",
        message: "Target participant must request control before approval"
      };
    }

    const now = Date.now();
    this.removeControlRequest(room, fromParticipantId);
    this.removeControlRequest(room, targetParticipantId);
    fromParticipant.role = "viewer";
    fromParticipant.lastSeenAt = now;
    targetParticipant.role = "controller";
    targetParticipant.lastSeenAt = now;
    room.currentControllerId = targetParticipant.id;
    this.normalizeSpeakerState(room);
    this.touchRoom(room, now);
    this.persistParticipant(room, fromParticipant, undefined, now);
    this.persistParticipant(room, targetParticipant, "controller_changed", now, {
      previousRole: "controller",
      newRole: "controller",
      targetParticipantId: targetParticipant.id,
      targetName: targetParticipant.name
    });

    return {
      ok: true,
      room,
      previousController: fromParticipant,
      newController: targetParticipant,
      message: "Control transferred"
    };
  }

  requestSpeaker(roomName: string, participantId: string): SpeakerRequestResult {
    const room = this.getRoom(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    this.normalizeSpeakerState(room);
    const participant = room.participants.get(participantId);
    if (!participant) {
      return {
        ok: false,
        room,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Participant is not in this room"
      };
    }

    if (!participant.connected) {
      return {
        ok: false,
        room,
        status: 409,
        code: "TARGET_OFFLINE",
        message: "Participant is offline"
      };
    }

    if (participant.role !== "viewer") {
      return {
        ok: false,
        room,
        status: 403,
        code: "FORBIDDEN",
        message: "Only viewers can request Speaker"
      };
    }

    if (room.currentSpeakerId === participantId || room.speakerQueue.includes(participantId)) {
      return {
        ok: true,
        room,
        speaker: participant,
        message: room.currentSpeakerId === participantId ? "Already current Speaker" : "Already in Speaker queue"
      };
    }

    if (!room.currentSpeakerId) {
      room.currentSpeakerId = participantId;
      participant.lastSeenAt = Date.now();
      this.touchRoom(room, participant.lastSeenAt);
      return {
        ok: true,
        room,
        speaker: participant,
        message: "Speaker granted"
      };
    }

    room.speakerQueue.push(participantId);
    participant.lastSeenAt = Date.now();
    this.touchRoom(room, participant.lastSeenAt);
    return {
      ok: true,
      room,
      speaker: participant,
      message: "Added to Speaker queue"
    };
  }

  endSpeaker(roomName: string, participantId: string): SpeakerEndResult {
    const room = this.getRoom(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    this.normalizeSpeakerState(room);
    const participant = room.participants.get(participantId);
    if (!participant) {
      return {
        ok: false,
        room,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Participant is not in this room"
      };
    }

    if (!participant.connected) {
      return {
        ok: false,
        room,
        status: 409,
        code: "TARGET_OFFLINE",
        message: "Participant is offline"
      };
    }

    if (room.currentSpeakerId !== participantId) {
      return {
        ok: false,
        room,
        status: 403,
        code: "NOT_SPEAKER",
        message: "Only the current Speaker can end Speaker"
      };
    }

    room.currentSpeakerId = undefined;
    participant.lastSeenAt = Date.now();
    this.normalizeSpeakerState(room);
    this.touchRoom(room, participant.lastSeenAt);

    return {
      ok: true,
      room,
      endedSpeaker: participant,
      message: "Speaker ended"
    };
  }

  markParticipantConnected(roomName: string, participantId: string): Participant | undefined {
    const room = this.rooms.get(roomName);
    const participant = room?.participants.get(participantId);
    if (participant) {
      const now = Date.now();
      participant.connected = true;
      participant.lastSeenAt = now;
      participant.disconnectedAt = undefined;
      if (room && participant.role === "robot") {
        room.robotOnline = true;
      }
      if (room) {
        this.touchRoom(room, now);
        this.persistParticipant(room, participant, undefined, now);
      }
    }
    return participant;
  }

  markParticipantDisconnected(roomName: string, participantId: string): {
    room?: RoomState;
    robotStatusChanged: boolean;
  } {
    const room = this.rooms.get(roomName);
    const participant = room?.participants.get(participantId);
    if (!room || !participant) {
      return { robotStatusChanged: false };
    }

    const now = Date.now();
    const controllerReleased = room.currentControllerId === participantId;
    if (controllerReleased) {
      room.currentControllerId = undefined;
      if (participant.role === "controller") {
        participant.role = "viewer";
      }
    }
    this.removeControlRequest(room, participantId);
    participant.connected = false;
    participant.lastSeenAt = now;
    participant.disconnectedAt = now;
    this.normalizeControllerRequestQueue(room);
    this.normalizeSpeakerState(room);
    this.touchRoom(room, now);
    this.persistParticipant(room, participant, controllerReleased ? "controller_changed" : undefined, now, {
      participantId,
      participantName: participant.name,
      role: participant.role
    });

    return { room, robotStatusChanged: false };
  }

  removeParticipant(
    roomName: string,
    participantId: string,
    options: { closeReason?: string; eventType?: "participant_left" | "participant_kicked"; kickReason?: string } = {}
  ): RemoveParticipantResult {
    const room = this.rooms.get(roomName);
    const participant = room?.participants.get(participantId);
    if (!room || !participant) {
      return {
        controllerReleased: false,
        robotStatusChanged: false,
        roomDeleted: false
      };
    }

    const now = Date.now();
    const controllerReleased = room.currentControllerId === participantId;
    const robotStatusChanged = participant.role === "robot" && room.robotOnline;

    if (controllerReleased) {
      room.currentControllerId = undefined;
    }
    this.removeControlRequest(room, participantId);

    if (participant.role === "robot") {
      room.robotOnline = false;
      if (room.robotId === participant.name) {
        room.robotId = undefined;
      }
    }
    this.markHistoryParticipantRemoved(room, participant, options, now);

    room.participants.delete(participantId);

    if (room.participants.size === 0) {
      this.closeHistoryRoom(room, options.closeReason ?? "empty_room", undefined, now);
      this.rooms.delete(roomName);
      return {
        removedParticipant: participant,
        controllerReleased,
        robotStatusChanged,
        roomDeleted: true
      };
    }

    this.normalizeControllerRequestQueue(room);
    this.normalizeSpeakerState(room);
    this.touchRoom(room, now);
    this.persistRoomState(room, now);
    return {
      room,
      removedParticipant: participant,
      controllerReleased,
      robotStatusChanged,
      roomDeleted: false
    };
  }

  recordRobotControl(
    roomName: string,
    command: RobotControlEventCommand,
    parameters: RobotControlLogParameters,
    from: string,
    timestamp: number
  ): void {
    const room = this.rooms.get(roomName);
    if (!room) {
      return;
    }

    room.lastRobotControl = {
      command,
      parameters,
      from,
      timestamp
    };
    this.touchRoom(room, timestamp);
    this.recordHistoryEvent(
      room,
      "robot_control",
      room.participants.get(from),
      {
        command,
        participantId: from,
        timestamp
      },
      timestamp
    );
  }

  setKeyboardControlStatus(roomName: string, status: KeyboardControlStatus): void {
    const room = this.rooms.get(roomName);
    if (!room) {
      return;
    }

    room.keyboardControl = status;
    this.touchRoom(room, status.updatedAt);
  }

  getRoomSnapshot(roomName: string): RoomSnapshot | undefined {
    const room = this.rooms.get(roomName);
    if (!room) {
      return undefined;
    }

    const currentController = room.currentControllerId ? room.participants.get(room.currentControllerId) : undefined;

    return {
      roomName: room.roomName,
      robotId: room.robotId,
      robotOnline: room.robotOnline,
      currentControllerId: room.currentControllerId,
      currentControllerName: currentController?.name,
      controlRequests: this.getControlRequestQueueSnapshot(room),
      speaker: this.getSpeakerStateSnapshot(room),
      lastRobotControl: room.lastRobotControl,
      keyboardControl: room.keyboardControl,
      participants: Array.from(room.participants.values()).map((participant) => ({
        id: participant.id,
        name: participant.name,
        role: participant.role,
        connected: participant.connected,
        joinedAt: participant.joinedAt,
        lastSeenAt: participant.lastSeenAt,
        disconnectedAt: participant.disconnectedAt
      }))
    };
  }

  listAdminRoomSummaries(): AdminRoomSummary[] {
    return Array.from(this.rooms.values())
      .map((room) => this.toAdminRoomSummary(room))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  getAdminRoomDetail(roomName: string): AdminRoomDetail | undefined {
    const room = this.rooms.get(roomName);
    if (!room) {
      return undefined;
    }

    return {
      ...this.toAdminRoomSummary(room),
      participants: Array.from(room.participants.values())
        .map((participant) => ({
          participantId: participant.id,
          identity: participant.id,
          displayName: participant.name,
          role: participant.role,
          connected: participant.connected,
          joinedAt: participant.joinedAt,
          lastSeenAt: participant.lastSeenAt,
          disconnectedAt: participant.disconnectedAt
        }))
        .sort((left, right) => left.role.localeCompare(right.role) || left.displayName.localeCompare(right.displayName))
    };
  }

  releaseControllerByAdmin(roomName: string): AdminReleaseControlResult {
    const room = this.rooms.get(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const controllerId = room.currentControllerId;
    if (!controllerId) {
      return {
        ok: true,
        room,
        released: false,
        message: "No active controller to release"
      };
    }

    const controller = room.participants.get(controllerId);
    if (controller && controller.role !== "robot") {
      controller.role = "viewer";
      controller.lastSeenAt = Date.now();
      this.persistParticipant(room, controller, undefined, controller.lastSeenAt);
    }
    this.removeControlRequest(room, controllerId);
    room.currentControllerId = undefined;
    this.normalizeControllerRequestQueue(room);
    this.normalizeSpeakerState(room);
    this.touchRoom(room);
    this.persistRoomState(room);
    this.recordHistoryEvent(room, "controller_changed", controller, {
      participantId: controller?.id ?? controllerId,
      participantName: controller?.name ?? "",
      role: "viewer"
    });

    return {
      ok: true,
      room,
      released: true,
      message: "Controller released by admin"
    };
  }

  cleanupDisconnectedParticipants(roomName: string): CleanupParticipantsResult {
    const room = this.rooms.get(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const now = Date.now();
    let removedCount = 0;
    for (const participant of Array.from(room.participants.values())) {
      const offlineLongEnough = !participant.connected && now - participant.lastSeenAt >= OFFLINE_CLEANUP_AFTER_MS;
      if (!offlineLongEnough) {
        continue;
      }

      this.removeControlRequest(room, participant.id);
      room.participants.delete(participant.id);
      removedCount += 1;
      this.markHistoryParticipantRemoved(room, participant, { eventType: "participant_left" }, now);
      if (room.currentControllerId === participant.id) {
        room.currentControllerId = undefined;
      }
      if (participant.role === "robot") {
        room.robotOnline = false;
        if (room.robotId === participant.name) {
          room.robotId = undefined;
        }
      }
    }

    if (removedCount > 0) {
      this.normalizeControllerRequestQueue(room);
      this.normalizeSpeakerState(room);
      this.touchRoom(room, now);
      if (room.participants.size === 0) {
        this.closeHistoryRoom(room, "empty_room", undefined, now);
        this.rooms.delete(roomName);
      } else {
        this.persistRoomState(room, now);
      }
    }

    return {
      ok: true,
      room,
      removedCount
    };
  }

  closeRoomIfEmpty(roomName: string): CloseRoomResult {
    const room = this.rooms.get(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const closeGuard = this.getCloseGuard(room);
    if (!closeGuard.canClose) {
      return {
        ok: false,
        status: 409,
        code: "ROOM_NOT_EMPTY",
        message: closeGuard.reason ?? "Room still has online participants",
        room
      };
    }

    this.rooms.delete(roomName);
    this.closeHistoryRoom(room, "admin_closed", undefined, Date.now());
    return {
      ok: true,
      message: "Room closed"
    };
  }

  listRoomRecords(days?: number): RoomRecordSummary[] {
    return this.historyRepository?.listRoomRecords(days) ?? [];
  }

  getRoomRecord(roomId: number): RoomRecordDetail | undefined {
    return this.historyRepository?.getRoomRecord(roomId);
  }

  kickParticipantByAdmin(roomName: string, participantId: string, kickReason = "admin_kicked"): AdminKickParticipantResult {
    const room = this.rooms.get(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      return {
        ok: false,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Participant is not in this room"
      };
    }

    const result = this.removeParticipant(roomName, participantId, {
      eventType: "participant_kicked",
      kickReason,
      closeReason: "empty_room"
    });

    return {
      ok: true,
      room: result.room,
      kickedParticipant: participant,
      controllerReleased: result.controllerReleased,
      robotStatusChanged: result.robotStatusChanged,
      roomDeleted: result.roomDeleted,
      message: "Participant kicked"
    };
  }

  closeRoomByAdmin(roomName: string): AdminCloseRoomResult {
    const room = this.rooms.get(roomName);
    if (!room) {
      return {
        ok: false,
        status: 404,
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist"
      };
    }

    const now = Date.now();
    const closedParticipants = Array.from(room.participants.values());
    this.closeHistoryRoom(room, "admin_closed", undefined, now);
    this.rooms.delete(roomName);

    return {
      ok: true,
      closedParticipants,
      message: "Room closed by admin"
    };
  }

  private normalizeControllerRequestQueue(room: RoomState): void {
    room.controllerRequestQueue = room.controllerRequestQueue ?? [];
    const nextQueue: string[] = [];
    const seen = new Set<string>();
    for (const participantId of room.controllerRequestQueue) {
      if (participantId === room.currentControllerId || seen.has(participantId)) {
        continue;
      }

      const participant = room.participants.get(participantId);
      if (!participant || participant.role !== "viewer" || !participant.connected) {
        continue;
      }

      seen.add(participantId);
      nextQueue.push(participantId);
    }

    room.controllerRequestQueue = nextQueue;
  }

  private removeControlRequest(room: RoomState, participantId: string): void {
    room.controllerRequestQueue = (room.controllerRequestQueue ?? []).filter((queuedParticipantId) => queuedParticipantId !== participantId);
  }

  private toControlRequestParticipantSnapshot(
    participant: Participant | undefined
  ): ControlRequestQueueSnapshot["queue"][number] | undefined {
    if (!participant || participant.role !== "viewer") {
      return undefined;
    }

    return {
      id: participant.id,
      name: participant.name,
      role: participant.role,
      connected: participant.connected
    };
  }

  private getControlRequestQueueSnapshot(room: RoomState): ControlRequestQueueSnapshot {
    this.normalizeControllerRequestQueue(room);
    const currentController = room.currentControllerId ? room.participants.get(room.currentControllerId) : undefined;

    return {
      currentControllerId: room.currentControllerId,
      currentControllerName: currentController?.name,
      queue: room.controllerRequestQueue
        .map((participantId) => this.toControlRequestParticipantSnapshot(room.participants.get(participantId)))
        .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant))
    };
  }

  private normalizeSpeakerState(room: RoomState): void {
    room.speakerQueue = room.speakerQueue ?? [];
    const currentSpeaker = room.currentSpeakerId ? room.participants.get(room.currentSpeakerId) : undefined;
    if (!currentSpeaker || currentSpeaker.role !== "viewer" || !currentSpeaker.connected) {
      room.currentSpeakerId = undefined;
    }

    const nextQueue: string[] = [];
    const seen = new Set<string>();
    for (const participantId of room.speakerQueue) {
      if (participantId === room.currentSpeakerId || seen.has(participantId)) {
        continue;
      }

      const participant = room.participants.get(participantId);
      if (!participant || participant.role !== "viewer" || !participant.connected) {
        continue;
      }

      seen.add(participantId);
      nextQueue.push(participantId);
    }

    room.speakerQueue = nextQueue;
    if (!room.currentSpeakerId) {
      room.currentSpeakerId = room.speakerQueue.shift();
    }
  }

  private toSpeakerParticipantSnapshot(participant: Participant | undefined): SpeakerStateSnapshot["currentSpeaker"] {
    if (!participant || (participant.role !== "controller" && participant.role !== "viewer")) {
      return undefined;
    }

    return {
      id: participant.id,
      name: participant.name,
      role: participant.role,
      connected: participant.connected
    };
  }

  private getSpeakerStateSnapshot(room: RoomState): SpeakerStateSnapshot {
    this.normalizeSpeakerState(room);
    const viewerSpeaker = room.currentSpeakerId ? room.participants.get(room.currentSpeakerId) : undefined;
    const fallbackController = room.currentControllerId ? room.participants.get(room.currentControllerId) : undefined;
    const currentSpeaker = this.toSpeakerParticipantSnapshot(viewerSpeaker) ?? this.toSpeakerParticipantSnapshot(fallbackController);

    return {
      currentSpeaker,
      currentSpeakerId: currentSpeaker?.id,
      currentSpeakerName: currentSpeaker?.name,
      queue: room.speakerQueue
        .map((participantId) => this.toSpeakerParticipantSnapshot(room.participants.get(participantId)))
        .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant))
    };
  }

  private ensureHistoryRoom(room: RoomState, timestamp = Date.now()): number | undefined {
    if (!this.historyRepository) {
      return undefined;
    }

    if (!room.historyRoomId) {
      room.historyRoomId = this.historyRepository.ensureOpenRoom(room.roomName, timestamp);
    }

    this.persistRoomState(room, timestamp);
    return room.historyRoomId;
  }

  private persistRoomState(room: RoomState, timestamp = Date.now()): void {
    if (!this.historyRepository) {
      return;
    }

    const roomId = room.historyRoomId ?? this.ensureHistoryRoom(room, timestamp);
    if (!roomId) {
      return;
    }

    this.historyRepository.updateRoomState(roomId, {
      currentControllerParticipantId: room.currentControllerId,
      robotId: room.robotId,
      updatedAt: timestamp
    });
  }

  private persistParticipant(
    room: RoomState,
    participant: Participant,
    eventType?: string,
    timestamp = Date.now(),
    payload?: Record<string, unknown>
  ): void {
    if (!this.historyRepository) {
      return;
    }

    const roomId = room.historyRoomId ?? this.ensureHistoryRoom(room, timestamp);
    if (!roomId) {
      return;
    }

    this.historyRepository.upsertParticipant(roomId, participant, timestamp);
    this.persistRoomState(room, timestamp);

    if (eventType) {
      this.historyRepository.recordEvent(
        roomId,
        eventType,
        participant,
        {
          participantId: participant.id,
          participantName: participant.name,
          role: participant.role,
          ...payload
        },
        timestamp
      );
    }
  }

  private markHistoryParticipantRemoved(
    room: RoomState,
    participant: Participant,
    options: { eventType?: "participant_left" | "participant_kicked"; kickReason?: string } = {},
    timestamp = Date.now()
  ): void {
    if (!this.historyRepository) {
      return;
    }

    const roomId = room.historyRoomId ?? this.ensureHistoryRoom(room, timestamp);
    if (!roomId) {
      return;
    }

    const eventType = options.eventType ?? "participant_left";
    if (eventType === "participant_kicked") {
      this.historyRepository.markParticipantKicked(roomId, participant, options.kickReason ?? "admin_kicked", timestamp);
    } else {
      this.historyRepository.markParticipantLeft(roomId, participant, timestamp);
    }

    this.historyRepository.recordEvent(
      roomId,
      eventType,
      participant,
      {
        participantId: participant.id,
        participantName: participant.name,
        role: participant.role,
        kickReason: options.kickReason
      },
      timestamp
    );

    if (participant.role === "robot") {
      this.historyRepository.recordEvent(roomId, "robot_offline", participant, {
        robotId: participant.name,
        participantId: participant.id
      }, timestamp);
    }
  }

  private closeHistoryRoom(room: RoomState, closeReason: string, actor?: Participant, timestamp = Date.now()): void {
    if (!this.historyRepository) {
      return;
    }

    const roomId = room.historyRoomId ?? this.ensureHistoryRoom(room, timestamp);
    if (!roomId) {
      return;
    }

    this.historyRepository.closeRoom(roomId, closeReason, actor, timestamp);
  }

  private recordHistoryEvent(
    room: RoomState,
    eventType: string,
    actor?: Participant,
    payload?: Record<string, unknown>,
    timestamp = Date.now()
  ): void {
    if (!this.historyRepository) {
      return;
    }

    const roomId = room.historyRoomId ?? this.ensureHistoryRoom(room, timestamp);
    if (!roomId) {
      return;
    }

    this.historyRepository.recordEvent(roomId, eventType, actor, payload, timestamp);
  }

  private touchRoom(room: RoomState, timestamp = Date.now()): void {
    room.updatedAt = timestamp;
  }

  private findReusableWebParticipant(
    room: RoomState,
    participantName: string,
    options: { previousParticipantId?: string; clientSessionId?: string }
  ): Participant | undefined {
    const previousParticipant = options.previousParticipantId ? room.participants.get(options.previousParticipantId) : undefined;
    if (
      previousParticipant &&
      previousParticipant.role !== "robot" &&
      previousParticipant.name === participantName &&
      options.clientSessionId &&
      previousParticipant.clientSessionId === options.clientSessionId
    ) {
      return previousParticipant;
    }

    if (options.clientSessionId) {
      return Array.from(room.participants.values()).find(
        (participant) =>
          participant.role !== "robot" &&
          participant.name === participantName &&
          participant.clientSessionId === options.clientSessionId
      );
    }

    return Array.from(room.participants.values()).find(
      (participant) =>
        participant.role !== "robot" &&
        !participant.connected &&
        !participant.clientSessionId &&
        participant.name === participantName
    );
  }

  private toAdminRoomSummary(room: RoomState): AdminRoomSummary {
    const participants = Array.from(room.participants.values());
    const currentController = room.currentControllerId ? room.participants.get(room.currentControllerId) : undefined;
    const connectedParticipantCount = participants.filter((participant) => participant.connected).length;
    const viewerCount = participants.filter((participant) => participant.role === "viewer").length;
    const closeGuard = this.getCloseGuard(room);

    return {
      roomName: room.roomName,
      liveKitRoomName: room.roomName,
      robotId: room.robotId,
      robotOnline: room.robotOnline,
      currentControllerId: room.currentControllerId,
      currentControllerName: currentController?.name,
      viewerCount,
      participantCount: participants.length,
      connectedParticipantCount,
      updatedAt: room.updatedAt,
      canClose: closeGuard.canClose,
      closeDisabledReason: closeGuard.reason
    };
  }

  private getCloseGuard(room: RoomState): { canClose: boolean; reason?: string } {
    const connectedParticipants = Array.from(room.participants.values()).filter((participant) => participant.connected);
    if (connectedParticipants.length > 0) {
      return {
        canClose: false,
        reason: "Room has online participants"
      };
    }

    return { canClose: true };
  }
}
