import { randomUUID } from "node:crypto";
import type { ControlParameters, Participant, RobotCommand, RoomSnapshot, RoomState, WebRole } from "../types.js";

export type JoinWebParticipantResult = {
  room: RoomState;
  participant: Participant;
  requestedControllerGranted: boolean;
};

export type JoinRobotResult = {
  room: RoomState;
  participant: Participant;
};

export type ControlRequestResult =
  | {
      ok: true;
      room: RoomState;
      participant: Participant;
      message: string;
    }
  | {
      ok: false;
      room?: RoomState;
      status: number;
      code: "ROOM_NOT_FOUND" | "PARTICIPANT_NOT_FOUND" | "CONTROLLER_BUSY";
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

export class RoomStore {
  private readonly rooms = new Map<string, RoomState>();

  constructor(private readonly options: { mockRobotOnline: boolean }) {}

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
      participants: new Map()
    };

    this.rooms.set(roomName, room);
    return room;
  }

  joinWebParticipant(roomName: string, participantName: string, requestedRole: WebRole): JoinWebParticipantResult {
    const room = this.getOrCreateRoom(roomName);
    const participantId = `user-${randomUUID()}`;
    const canGrantController = requestedRole === "controller" && !room.currentControllerId;
    const role: WebRole = canGrantController ? "controller" : "viewer";

    const participant: Participant = {
      id: participantId,
      name: participantName,
      role,
      connected: false
    };

    room.participants.set(participantId, participant);
    if (role === "controller") {
      room.currentControllerId = participantId;
    }

    return {
      room,
      participant,
      requestedControllerGranted: canGrantController
    };
  }

  joinRobot(roomName: string, robotId: string): JoinRobotResult {
    const room = this.getOrCreateRoom(roomName);
    const participantId = `robot-${robotId}`;
    const participant: Participant = {
      id: participantId,
      name: robotId,
      role: "robot",
      connected: true
    };

    room.robotId = robotId;
    room.robotOnline = true;
    room.participants.set(participantId, participant);

    return {
      room,
      participant
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

    const participant = room.participants.get(participantId);
    if (!participant || participant.role === "robot") {
      return {
        ok: false,
        room,
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        role: "viewer",
        message: "Participant is not in this room"
      };
    }

    if (room.currentControllerId && room.currentControllerId !== participantId) {
      participant.role = "viewer";
      return {
        ok: false,
        room,
        status: 409,
        code: "CONTROLLER_BUSY",
        role: "viewer",
        message: "Another controller is active"
      };
    }

    participant.role = "controller";
    room.currentControllerId = participantId;

    return {
      ok: true,
      room,
      participant,
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
    participant.role = "viewer";

    return {
      ok: true,
      room,
      released,
      message: released ? "Control released" : "Participant was not the active controller"
    };
  }

  markParticipantConnected(roomName: string, participantId: string): Participant | undefined {
    const participant = this.rooms.get(roomName)?.participants.get(participantId);
    if (participant) {
      participant.connected = true;
    }
    return participant;
  }

  markParticipantDisconnected(roomName: string, participantId: string): {
    room?: RoomState;
    controllerReleased: boolean;
    robotStatusChanged: boolean;
  } {
    const room = this.rooms.get(roomName);
    const participant = room?.participants.get(participantId);
    if (!room || !participant) {
      return { controllerReleased: false, robotStatusChanged: false };
    }

    participant.connected = false;
    const robotStatusChanged = participant.role === "robot" && room.robotOnline;
    if (robotStatusChanged) {
      room.robotOnline = false;
    }

    if (room.currentControllerId === participantId) {
      room.currentControllerId = undefined;
      participant.role = "viewer";
      return { room, controllerReleased: true, robotStatusChanged };
    }

    return { room, controllerReleased: false, robotStatusChanged };
  }

  recordRobotControl(roomName: string, command: RobotCommand, parameters: ControlParameters, from: string, timestamp: number): void {
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
      participants: Array.from(room.participants.values()).map((participant) => ({
        id: participant.id,
        name: participant.name,
        role: participant.role,
        connected: participant.connected
      }))
    };
  }
}
