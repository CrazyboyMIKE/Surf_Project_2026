import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { RoomStore } from "../state/roomStore.js";
import type { ApiErrorCode } from "../types.js";

type AdminRouterDependencies = {
  roomStore: RoomStore;
  adminEnabled: boolean;
  adminToken?: string;
  broadcastRoleUpdate: (roomName: string) => void;
  broadcastRobotStatus: (roomName: string) => void;
  broadcastRoomUpdate: (roomName: string) => void;
};

const SAFE_ROOM_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

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
