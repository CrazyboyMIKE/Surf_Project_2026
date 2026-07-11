import { Router, type NextFunction, type Request, type Response } from "express";
import type { LiveKitTokenService } from "../services/liveKitTokenService.js";
import type { RoomStore } from "../state/roomStore.js";
import type { ApiErrorCode, RoomSnapshot, WebRole } from "../types.js";

type RouterDependencies = {
  roomStore: RoomStore;
  liveKitTokenService: LiveKitTokenService;
  broadcastRoleUpdate: (roomName: string) => void;
  broadcastRobotStatus: (roomName: string) => void;
};

const MAX_NAME_LENGTH = 80;
const MAX_ROOM_LENGTH = 80;

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
  const { roomStore, liveKitTokenService, broadcastRoleUpdate, broadcastRobotStatus } = dependencies;

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
    const requestedRole = readRequestedRole(body.requestedRole ?? "viewer");

    if (!roomName || !participantName || !requestedRole) {
      sendError(res, 400, "INVALID_REQUEST", "roomName, participantName, and requestedRole are required");
      return;
    }

    const result = roomStore.joinWebParticipant(roomName, participantName, requestedRole);
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
          role: result.participant.role,
          requestedControllerGranted: result.requestedControllerGranted,
          liveKitUrl: token.liveKitUrl,
          token: token.token,
          tokenMode: token.isMock ? "mock" : "livekit",
          mediaPermissions: token.mediaPermissions
        },
        roomStore.getRoomSnapshot(roomName)
      )
    );
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
      mediaPermissions: token.mediaPermissions
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

  return router;
}
