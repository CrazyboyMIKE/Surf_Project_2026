import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { RoomStore } from "../state/roomStore.js";
import type { ApiErrorCode } from "../types.js";

type AdminRouterDependencies = {
  roomStore: RoomStore;
  adminEnabled: boolean;
  adminToken?: string;
  stopKeyboardControl: (roomName: string, reason: string) => Promise<void>;
  broadcastRoleUpdate: (roomName: string) => void;
  broadcastRobotStatus: (roomName: string) => void;
  broadcastRoomUpdate: (roomName: string) => void;
  disconnectParticipant: (roomName: string, participantId: string, payload: Record<string, unknown>) => void;
  disconnectRoom: (roomName: string, payload: Record<string, unknown>) => void;
};

const SAFE_ROOM_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const SAFE_PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const MAX_RECORD_DAYS = 30;

function sendError(res: Response, status: number, code: ApiErrorCode, message: string): void {
  res.status(status).json({
    ok: false,
    code,
    message
  });
}

function readBearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return undefined;
  }

  return token.trim();
}

function safeTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(
  req: Request,
  res: Response,
  dependencies: Pick<AdminRouterDependencies, "adminEnabled" | "adminToken">
): boolean {
  if (!dependencies.adminEnabled) {
    sendError(res, 404, "ADMIN_DISABLED", "Admin API disabled");
    return false;
  }

  const expectedToken = dependencies.adminToken;
  if (!expectedToken) {
    sendError(res, 403, "FORBIDDEN", "Admin API is not configured");
    return false;
  }

  const token = readBearerToken(req);
  if (!token) {
    sendError(res, 401, "UNAUTHORIZED", "Admin bearer token is required");
    return false;
  }

  if (!safeTokenEquals(token, expectedToken)) {
    sendError(res, 403, "FORBIDDEN", "Admin bearer token is invalid");
    return false;
  }

  return true;
}

function readSafeRoomName(req: Request, res: Response): string | undefined {
  const roomName = req.params.roomName;
  if (!roomName || !SAFE_ROOM_NAME_PATTERN.test(roomName)) {
    sendError(res, 400, "INVALID_REQUEST", "roomName may contain only letters, numbers, dot, dash, underscore, or colon");
    return undefined;
  }

  return roomName;
}

function readSafeParticipantId(req: Request, res: Response): string | undefined {
  const participantId = req.params.participantId;
  if (!participantId || !SAFE_PARTICIPANT_ID_PATTERN.test(participantId)) {
    sendError(res, 400, "INVALID_REQUEST", "participantId contains unsupported characters");
    return undefined;
  }

  return participantId;
}

function readRecordDays(req: Request): number {
  const value = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }

  return Math.min(Math.trunc(value), MAX_RECORD_DAYS);
}

function readRecordId(req: Request, res: Response): number | undefined {
  const roomId = Number.parseInt(req.params.roomId ?? "", 10);
  if (!Number.isFinite(roomId) || roomId <= 0) {
    sendError(res, 400, "INVALID_REQUEST", "roomId must be a positive integer");
    return undefined;
  }

  return roomId;
}

function broadcastRoomState(dependencies: AdminRouterDependencies, roomName: string): void {
  dependencies.broadcastRoleUpdate(roomName);
  dependencies.broadcastRobotStatus(roomName);
  dependencies.broadcastRoomUpdate(roomName);
}

export function createAdminRouter(dependencies: AdminRouterDependencies): Router {
  const router = Router();
  const adminGuard = (req: Request, res: Response): boolean => requireAdmin(req, res, dependencies);

  router.get("/api/admin/rooms", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    res.json({
      ok: true,
      rooms: dependencies.roomStore.listAdminRoomSummaries()
    });
  });

  router.get("/api/admin/rooms/:roomName", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomName = readSafeRoomName(req, res);
    if (!roomName) {
      return;
    }

    const room = dependencies.roomStore.getAdminRoomDetail(roomName);
    if (!room) {
      sendError(res, 404, "ROOM_NOT_FOUND", "Room does not exist");
      return;
    }

    res.json({
      ok: true,
      room
    });
  });

  router.get("/api/admin/room-records", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const days = readRecordDays(req);
    res.json({
      ok: true,
      days,
      records: dependencies.roomStore.listRoomRecords(days)
    });
  });

  router.get("/api/admin/room-records/:roomId", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomId = readRecordId(req, res);
    if (!roomId) {
      return;
    }

    const record = dependencies.roomStore.getRoomRecord(roomId);
    if (!record) {
      sendError(res, 404, "ROOM_NOT_FOUND", "Room record does not exist");
      return;
    }

    res.json({
      ok: true,
      record
    });
  });

  router.post("/api/admin/rooms/:roomName/control/release", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomName = readSafeRoomName(req, res);
    if (!roomName) {
      return;
    }

    const result = dependencies.roomStore.releaseControllerByAdmin(roomName);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    void dependencies.stopKeyboardControl(roomName, "admin_released_controller");
    broadcastRoomState(dependencies, roomName);
    res.json({
      ok: true,
      released: result.released,
      message: result.message,
      room: dependencies.roomStore.getAdminRoomDetail(roomName)
    });
  });

  router.post("/api/admin/rooms/:roomName/participants/cleanup", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomName = readSafeRoomName(req, res);
    if (!roomName) {
      return;
    }

    const result = dependencies.roomStore.cleanupDisconnectedParticipants(roomName);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    broadcastRoomState(dependencies, roomName);
    res.json({
      ok: true,
      removedCount: result.removedCount,
      room: dependencies.roomStore.getAdminRoomDetail(roomName)
    });
  });

  router.post("/api/admin/rooms/:roomName/participants/:participantId/kick", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomName = readSafeRoomName(req, res);
    const participantId = readSafeParticipantId(req, res);
    if (!roomName || !participantId) {
      return;
    }

    const roomBefore = dependencies.roomStore.getRoom(roomName);
    const participantBefore = roomBefore?.participants.get(participantId);
    if (!participantBefore) {
      sendError(res, 404, "PARTICIPANT_NOT_FOUND", "Participant is not in this room");
      return;
    }

    if (roomBefore?.currentControllerId === participantId) {
      await dependencies.stopKeyboardControl(roomName, "admin_kicked_controller");
    }

    const result = dependencies.roomStore.kickParticipantByAdmin(roomName, participantId);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    dependencies.disconnectParticipant(roomName, participantId, {
      type: "error",
      code: "PARTICIPANT_KICKED",
      message: "You were kicked by admin"
    });

    if (result.roomDeleted) {
      dependencies.disconnectRoom(roomName, {
        type: "error",
        code: "ROOM_CLOSED",
        message: "Room closed"
      });
    } else {
      broadcastRoomState(dependencies, roomName);
    }

    res.json({
      ok: true,
      message: result.message,
      kickedParticipantId: participantId,
      roomDeleted: result.roomDeleted,
      room: result.roomDeleted ? undefined : dependencies.roomStore.getAdminRoomDetail(roomName)
    });
  });

  router.post("/api/admin/rooms/:roomName/close", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomName = readSafeRoomName(req, res);
    if (!roomName) {
      return;
    }

    await dependencies.stopKeyboardControl(roomName, "admin_closed_room");
    const result = dependencies.roomStore.closeRoomByAdmin(roomName);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    dependencies.disconnectRoom(roomName, {
      type: "error",
      code: "ROOM_CLOSED",
      message: "Room closed by admin"
    });

    res.json({
      ok: true,
      message: result.message,
      closedParticipants: result.closedParticipants.length
    });
  });

  router.delete("/api/admin/rooms/:roomName", (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }

    const roomName = readSafeRoomName(req, res);
    if (!roomName) {
      return;
    }

    const result = dependencies.roomStore.closeRoomIfEmpty(roomName);
    if (!result.ok) {
      sendError(res, result.status, result.code, result.message);
      return;
    }

    res.json({
      ok: true,
      message: result.message
    });
  });

  return router;
}
