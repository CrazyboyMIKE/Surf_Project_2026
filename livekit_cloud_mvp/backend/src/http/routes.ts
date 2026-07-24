import { Router, type NextFunction, type Request, type Response } from "express";
import type { KeyboardControlConfig } from "../keyboardControl/config.js";
import { getPublicKeyboardControlConfig } from "../keyboardControl/config.js";
import type { LiveKitTokenService } from "../services/liveKitTokenService.js";
import type { RoomStore } from "../state/roomStore.js";
import type { ApiErrorCode, RoomSnapshot, WebRole } from "../types.js";

type RouterDependencies = {
  roomStore: RoomStore;
  liveKitTokenService: LiveKitTokenService;
  keyboardControlConfig: KeyboardControlConfig;
  stopKeyboardControl: (roomName: string, reason: string) => Promise<void>;
  broadcastRoleUpdate: (roomName: string) => void;
  broadcastRobotStatus: (roomName: string) => void;
};

const MAX_NAME_LENGTH = 80;
const MAX_ROOM_LENGTH = 80;
const MAX_SESSION_ID_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(body: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = body[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return undefined;
  }

  return trimmed;
}

function sendError(res: Response, status: number, code: ApiErrorCode, message: string): void {
  res.status(status).json({
    ok: false,
    code,
    message
  });
}

function readBody(req: Request, res: Response): Record<string, unknown> | undefined {
  if (!isRecord(req.body)) {
    sendError(res, 400, "INVALID_REQUEST", "Request body must be a JSON object");
    return undefined;
  }

  return req.body;
}

function readRequestedRole(value: unknown): WebRole | undefined {
  return value === "viewer" || value === "controller" ? value : undefined;
}

function isSafeRoomName(value: string): boolean {
  return /^[A-Za-z0-9._:-]+$/.test(value);
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res).catch(next);
  };
}

function appendRoomSnapshot(response: Record<string, unknown>, snapshot: RoomSnapshot | undefined): Record<string, unknown> {
  if (!snapshot) {
    return response;
  }

  return {
    ...response,
    robotOnline: snapshot.robotOnline,
    currentControllerId: snapshot.currentControllerId,
    currentControllerName: snapshot.currentControllerName
  };
}

export function createApiRouter(dependencies: RouterDependencies): Router {
  const router = Router();
  const { roomStore, liveKitTokenService, keyboardControlConfig, stopKeyboardControl, broadcastRoleUpdate, broadcastRobotStatus } =
    dependencies;
  const keyboardControl = getPublicKeyboardControlConfig(keyboardControlConfig);

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/api/rooms/join", asyncRoute(async (req, res) => {
    const body = readBody(req, res);
    if (!body) {
      return;
    }

    const roomName = readTrimmedString(body, "roomName", MAX_ROOM_LENGTH);
    const participantName = readTrimmedString(body, "participantName", MAX_NAME_LENGTH);
    const previousParticipantId = readTrimmedString(body, "previousParticipantId", MAX_NAME_LENGTH);
    const clientSessionId = readTrimmedString(body, "clientSessionId", MAX_SESSION_ID_LENGTH);
    const requestedRole = readRequestedRole(body.requestedRole ?? "viewer");

    if (!roomName || !participantName || !requestedRole) {
      sendError(res, 400, "INVALID_REQUEST", "roomName, participantName, and requestedRole are required");
      return;
    }

    const result = roomStore.joinWebParticipant(roomName, participantName, requestedRole, {
      previousParticipantId,
      clientSessionId
    });
    const token = await liveKitTokenService.generateToken({
      roomName,
      identity: result.participant.id,
      name: participantName,
      role: result.participant.role
    });

    if (result.participant.role === "controller") {
      broadcastRoleUpdate(roomName);
    }

    res.status(201).json(
      appendRoomSnapshot(
        {
          roomName,
          participantId: result.participant.id,
          participantName,
          clientSessionId: result.participant.clientSessionId,
          role: result.participant.role,
          requestedControllerGranted: result.requestedControllerGranted,
          reusedParticipant: result.reusedParticipant,
          liveKitUrl: token.liveKitUrl,
          token: token.token,
          tokenMode: token.isMock ? "mock" : "livekit",
          mediaPermissions: token.mediaPermissions,
          keyboardControl
        },
        roomStore.getRoomSnapshot(roomName)
      )
    );
  }));

  router.post("/api/rooms/leave", asyncRoute(async (req, res) => {
    const body = readBody(req, res);
    if (!body) {
      return;
    }

    const roomName = readTrimmedString(body, "roomName", MAX_ROOM_LENGTH);
    const participantId = readTrimmedString(body, "participantId", MAX_NAME_LENGTH);
    const clientSessionId = readTrimmedString(body, "clientSessionId", MAX_SESSION_ID_LENGTH);

    if (!roomName || !participantId || !clientSessionId) {
      sendError(res, 400, "INVALID_REQUEST", "roomName, participantId, and clientSessionId are required");
      return;
    }

    const room = roomStore.getRoom(roomName);
    const participant = room?.participants.get(participantId);
    if (!room || !participant || participant.role === "robot") {
      sendError(res, 404, "PARTICIPANT_NOT_FOUND", "Participant is not in this room");
      return;
    }

    if (participant.clientSessionId !== clientSessionId) {
      sendError(res, 403, "FORBIDDEN", "clientSessionId does not match participant");
      return;
    }

    const wasController = room.currentControllerId === participantId;
    if (wasController) {
      await stopKeyboardControl(roomName, "participant_left");
    }

    const result = roomStore.removeParticipant(roomName, participantId);
    if (!result.roomDeleted) {
      broadcastRoleUpdate(roomName);
      if (result.robotStatusChanged) {
        broadcastRobotStatus(roomName);
      }
    }

    res.json({
      ok: true,
      roomDeleted: result.roomDeleted,
      message: result.roomDeleted ? "Participant left and room was closed" : "Participant left room"
    });
  }));

  router.post("/api/robots/join", asyncRoute(async (req, res) => {
    const body = readBody(req, res);
    if (!body) {
      return;
    }

    const robotId = readTrimmedString(body, "robotId", MAX_NAME_LENGTH);
    const roomName = readTrimmedString(body, "roomName", MAX_ROOM_LENGTH);

    if (!robotId || !roomName) {
      sendError(res, 400, "INVALID_REQUEST", "robotId and roomName are required");
      return;
    }

    const result = roomStore.joinRobot(roomName, robotId);
    const token = await liveKitTokenService.generateToken({
      roomName,
      identity: result.participant.id,
      name: robotId,
      role: "robot"
    });

    broadcastRobotStatus(roomName);

    res.status(201).json({
      robotId,
      roomName,
      participantId: result.participant.id,
      role: result.participant.role,
      online: true,
      liveKitUrl: token.liveKitUrl,
      token: token.token,
      tokenMode: token.isMock ? "mock" : "livekit",
      mediaPermissions: token.mediaPermissions,
      keyboardControl
    });
  }));

  router.post("/api/rooms/control/request", asyncRoute(async (req, res) => {
    const body = readBody(req, res);
    if (!body) {
      return;
    }

    const roomName = readTrimmedString(body, "roomName", MAX_ROOM_LENGTH);
    const participantId = readTrimmedString(body, "participantId", MAX_NAME_LENGTH);

    if (!roomName || !participantId) {
      sendError(res, 400, "INVALID_REQUEST", "roomName and participantId are required");
      return;
    }

    const result = roomStore.requestControl(roomName, participantId);
    if (!result.ok) {
      res.status(result.status).json({
        ok: false,
        code: result.code,
        role: result.role,
        message: result.message
      });
      return;
    }

    broadcastRoleUpdate(roomName);
    const token = await liveKitTokenService.generateToken({
      roomName,
      identity: result.participant.id,
      name: result.participant.name,
      role: result.participant.role
    });

    res.json({
      ok: true,
      role: result.participant.role,
      message: result.message,
      liveKitUrl: token.liveKitUrl,
      token: token.token,
      tokenMode: token.isMock ? "mock" : "livekit",
      mediaPermissions: token.mediaPermissions
    });
  }));

  router.post("/api/rooms/control/release", asyncRoute(async (req, res) => {
    const body = readBody(req, res);
    if (!body) {
      return;
    }

    const roomName = readTrimmedString(body, "roomName", MAX_ROOM_LENGTH);
    const participantId = readTrimmedString(body, "participantId", MAX_NAME_LENGTH);

    if (!roomName || !participantId) {
      sendError(res, 400, "INVALID_REQUEST", "roomName and participantId are required");
      return;
    }

    const result = roomStore.releaseControl(roomName, participantId);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    if (result.released) {
      await stopKeyboardControl(roomName, "controller_released");
    }
    broadcastRoleUpdate(roomName);
    const participant = result.room.participants.get(participantId);
    const token = participant
      ? await liveKitTokenService.generateToken({
          roomName,
          identity: participant.id,
          name: participant.name,
          role: participant.role
        })
      : undefined;

    res.json({
      ok: true,
      role: participant?.role,
      message: result.message,
      liveKitUrl: token?.liveKitUrl,
      token: token?.token,
      tokenMode: token ? (token.isMock ? "mock" : "livekit") : undefined,
      mediaPermissions: token?.mediaPermissions
    });
  }));

  router.post("/api/rooms/control/transfer", asyncRoute(async (req, res) => {
    const body = readBody(req, res);
    if (!body) {
      return;
    }

    const roomName = readTrimmedString(body, "roomName", MAX_ROOM_LENGTH);
    const fromParticipantId = readTrimmedString(body, "fromParticipantId", MAX_NAME_LENGTH);
    const targetParticipantId = readTrimmedString(body, "targetParticipantId", MAX_NAME_LENGTH);

    if (!roomName || !fromParticipantId || !targetParticipantId) {
      sendError(res, 400, "INVALID_REQUEST", "roomName, fromParticipantId, and targetParticipantId are required");
      return;
    }
    if (!isSafeRoomName(roomName)) {
      sendError(res, 400, "INVALID_REQUEST", "roomName contains unsupported characters");
      return;
    }

    const result = roomStore.transferControl(roomName, fromParticipantId, targetParticipantId);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    await stopKeyboardControl(roomName, "controller_transferred");
    broadcastRoleUpdate(roomName);

    res.json({
      ok: true,
      message: result.message,
      roomName,
      previousControllerId: result.previousController.id,
      previousControllerName: result.previousController.name,
      currentControllerId: result.newController.id,
      currentControllerName: result.newController.name,
      participants: roomStore.getRoomSnapshot(roomName)?.participants ?? []
    });
  }));

  return router;
}
