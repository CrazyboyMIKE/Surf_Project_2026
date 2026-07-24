import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Participant,
  Role,
  RoomEventRecord,
  RoomParticipantRecord,
  RoomRecordDetail,
  RoomRecordSummary
} from "../types.js";

export type RoomHistoryRepositoryOptions = {
  databaseUrl: string;
  retentionDays: number;
};

type SqlRow = Record<string, unknown>;

type EventActor = {
  id?: string;
  participantId?: string;
  name?: string;
};

const MAX_QUERY_DAYS = 30;
const DEFAULT_RETENTION_DAYS = 30;

export function normalizeRetentionDays(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(Math.trunc(value), MAX_QUERY_DAYS);
}

function nowMs(): number {
  return Date.now();
}

function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:" || databaseUrl === "file::memory:") {
    return databaseUrl;
  }

  const filePrefix = "file:";
  const pathValue = databaseUrl.startsWith(filePrefix) ? databaseUrl.slice(filePrefix.length) : databaseUrl;
  if (!pathValue.trim()) {
    throw new Error("DATABASE_URL must point to a SQLite file, for example file:./data/livekit_cloud_mvp.sqlite");
  }

  return resolve(process.cwd(), pathValue);
}

function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === ":memory:" || databasePath === "file::memory:") {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return asNumber(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === 1 || value === true;
}

function stringifyPayload(payload?: Record<string, unknown>): string | undefined {
  if (!payload) {
    return undefined;
  }

  return JSON.stringify(payload);
}

function parsePayload(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeEventPayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }

  const allowed: Record<string, unknown> = {};
  for (const key of [
    "roomName",
    "participantId",
    "participantName",
    "role",
    "previousRole",
    "newRole",
    "targetParticipantId",
    "targetName",
    "robotId",
    "closeReason",
    "kickReason",
    "command",
    "timestamp"
  ]) {
    const value = payload[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      allowed[key] = value;
    }
  }

  return Object.keys(allowed).length > 0 ? allowed : undefined;
}

export class RoomHistoryRepository {
  private readonly db: DatabaseSync;
  readonly retentionDays: number;

  constructor(options: RoomHistoryRepositoryOptions) {
    const databasePath = resolveDatabasePath(options.databaseUrl);
    ensureDatabaseDirectory(databasePath);
    this.db = new DatabaseSync(databasePath);
    this.retentionDays = normalizeRetentionDays(options.retentionDays);
    this.initialize();
    this.pruneOldClosedRooms();
  }

  initialize(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomName TEXT NOT NULL,
        inviteCode TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
        currentControllerParticipantId TEXT,
        robotId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        closedAt INTEGER,
        closeReason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_rooms_room_status ON rooms(roomName, status);
      CREATE INDEX IF NOT EXISTS idx_rooms_createdAt ON rooms(createdAt);
      CREATE INDEX IF NOT EXISTS idx_rooms_closedAt ON rooms(closedAt);

      CREATE TABLE IF NOT EXISTS room_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        participantId TEXT NOT NULL,
        clientSessionId TEXT,
        participantName TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('robot', 'controller', 'viewer')),
        connected INTEGER NOT NULL DEFAULT 0,
        joinedAt INTEGER NOT NULL,
        lastSeenAt INTEGER NOT NULL,
        leftAt INTEGER,
        kickedAt INTEGER,
        kickReason TEXT,
        UNIQUE(roomId, participantId)
      );

      CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(roomId);
      CREATE INDEX IF NOT EXISTS idx_room_participants_session ON room_participants(roomId, clientSessionId);

      CREATE TABLE IF NOT EXISTS room_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        actorParticipantId TEXT,
        actorName TEXT,
        payloadJson TEXT,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_room_events_room ON room_events(roomId, createdAt);
    `);
  }

  close(): void {
    this.db.close();
  }

  ensureOpenRoom(roomName: string, timestamp = nowMs()): number {
    const existing = this.db.prepare("SELECT id FROM rooms WHERE roomName = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(
      roomName
    ) as SqlRow | undefined;
    if (existing) {
      return asNumber(existing.id);
    }

    const result = this.db
      .prepare(
        `INSERT INTO rooms (roomName, status, createdAt, updatedAt)
         VALUES (?, 'open', ?, ?)`
      )
      .run(roomName, timestamp, timestamp);
    const roomId = Number(result.lastInsertRowid);
    this.recordEvent(roomId, "room_created", undefined, { roomName }, timestamp);
    return roomId;
  }

  updateRoomState(
    roomId: number,
    values: {
      currentControllerParticipantId?: string;
      robotId?: string;
      updatedAt?: number;
    }
  ): void {
    this.db
      .prepare(
        `UPDATE rooms
         SET currentControllerParticipantId = ?,
             robotId = ?,
             updatedAt = ?
         WHERE id = ? AND status = 'open'`
      )
      .run(
        values.currentControllerParticipantId ?? null,
        values.robotId ?? null,
        values.updatedAt ?? nowMs(),
        roomId
      );
  }

  upsertParticipant(roomId: number, participant: Participant, timestamp = nowMs()): void {
    this.db
      .prepare(
        `INSERT INTO room_participants (
           roomId, participantId, clientSessionId, participantName, role,
           connected, joinedAt, lastSeenAt, leftAt, kickedAt, kickReason
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
         ON CONFLICT(roomId, participantId) DO UPDATE SET
           clientSessionId = excluded.clientSessionId,
           participantName = excluded.participantName,
           role = excluded.role,
           connected = excluded.connected,
           lastSeenAt = excluded.lastSeenAt,
           leftAt = NULL`
      )
      .run(
        roomId,
        participant.id,
        participant.clientSessionId ?? null,
        participant.name,
        participant.role,
        participant.connected ? 1 : 0,
        participant.joinedAt,
        timestamp
      );
  }

  setParticipantConnected(roomId: number, participant: Participant, connected: boolean, timestamp = nowMs()): void {
    this.db
      .prepare(
        `UPDATE room_participants
         SET connected = ?,
             role = ?,
             participantName = ?,
             clientSessionId = ?,
             lastSeenAt = ?,
             leftAt = CASE WHEN ? = 1 THEN NULL ELSE leftAt END
         WHERE roomId = ? AND participantId = ?`
      )
      .run(
        connected ? 1 : 0,
        participant.role,
        participant.name,
        participant.clientSessionId ?? null,
        timestamp,
        connected ? 1 : 0,
        roomId,
        participant.id
      );
  }

  updateParticipantRole(roomId: number, participant: Participant, timestamp = nowMs()): void {
    this.db
      .prepare(
        `UPDATE room_participants
         SET role = ?,
             participantName = ?,
             lastSeenAt = ?
         WHERE roomId = ? AND participantId = ?`
      )
      .run(participant.role, participant.name, timestamp, roomId, participant.id);
  }

  markParticipantLeft(roomId: number, participant: Participant, timestamp = nowMs()): void {
    this.db
      .prepare(
        `UPDATE room_participants
         SET connected = 0,
             lastSeenAt = ?,
             leftAt = COALESCE(leftAt, ?)
         WHERE roomId = ? AND participantId = ?`
      )
      .run(timestamp, timestamp, roomId, participant.id);
  }

  markParticipantKicked(roomId: number, participant: Participant, kickReason: string, timestamp = nowMs()): void {
    this.db
      .prepare(
        `UPDATE room_participants
         SET connected = 0,
             lastSeenAt = ?,
             leftAt = COALESCE(leftAt, ?),
             kickedAt = ?,
             kickReason = ?
         WHERE roomId = ? AND participantId = ?`
      )
      .run(timestamp, timestamp, timestamp, kickReason, roomId, participant.id);
  }

  closeRoom(roomId: number, closeReason: string, actor?: EventActor, timestamp = nowMs()): void {
    this.db
      .prepare(
        `UPDATE room_participants
         SET connected = 0,
             lastSeenAt = ?,
             leftAt = COALESCE(leftAt, ?)
         WHERE roomId = ? AND leftAt IS NULL`
      )
      .run(timestamp, timestamp, roomId);
    this.db
      .prepare(
        `UPDATE rooms
         SET status = 'closed',
             currentControllerParticipantId = NULL,
             updatedAt = ?,
             closedAt = COALESCE(closedAt, ?),
             closeReason = ?
         WHERE id = ?`
      )
      .run(timestamp, timestamp, closeReason, roomId);
    this.recordEvent(roomId, "room_closed", actor, { closeReason }, timestamp);
  }

  recordEvent(
    roomId: number,
    type: string,
    actor?: EventActor,
    payload?: Record<string, unknown>,
    timestamp = nowMs()
  ): void {
    this.db
      .prepare(
        `INSERT INTO room_events (roomId, type, actorParticipantId, actorName, payloadJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        roomId,
        type,
        actor?.participantId ?? actor?.id ?? null,
        actor?.name ?? null,
        stringifyPayload(sanitizeEventPayload(payload)) ?? null,
        timestamp
      );
  }

  listRoomRecords(days = this.retentionDays): RoomRecordSummary[] {
    const safeDays = normalizeRetentionDays(days);
    const cutoff = nowMs() - safeDays * 24 * 60 * 60 * 1000;
    const rows = this.db
      .prepare(
        `SELECT
           r.id,
           r.roomName,
           r.inviteCode,
           r.status,
           r.currentControllerParticipantId,
           r.robotId,
           r.createdAt,
           r.updatedAt,
           r.closedAt,
           r.closeReason,
           COUNT(p.id) AS participantCount,
           SUM(CASE WHEN p.role = 'viewer' THEN 1 ELSE 0 END) AS viewerCount,
           SUM(CASE WHEN p.role = 'controller' THEN 1 ELSE 0 END) AS controllerCount,
           (
             SELECT participantName
             FROM room_participants pc
             WHERE pc.roomId = r.id AND pc.role = 'controller'
             ORDER BY pc.lastSeenAt DESC
             LIMIT 1
           ) AS latestControllerName,
           (
             SELECT participantName
             FROM room_participants pr
             WHERE pr.roomId = r.id AND pr.role = 'robot'
             ORDER BY pr.lastSeenAt DESC
             LIMIT 1
           ) AS robotParticipantName
         FROM rooms r
         LEFT JOIN room_participants p ON p.roomId = r.id
         WHERE r.createdAt >= ? OR (r.closedAt IS NOT NULL AND r.closedAt >= ?)
         GROUP BY r.id
         ORDER BY COALESCE(r.closedAt, r.updatedAt, r.createdAt) DESC`
      )
      .all(cutoff, cutoff) as SqlRow[];

    return rows.map((row) => this.toRoomRecordSummary(row));
  }

  getRoomRecord(roomId: number): RoomRecordDetail | undefined {
    const row = this.db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId) as SqlRow | undefined;
    if (!row) {
      return undefined;
    }

    const summaryRows = this.db
      .prepare(
        `SELECT
           r.id,
           r.roomName,
           r.inviteCode,
           r.status,
           r.currentControllerParticipantId,
           r.robotId,
           r.createdAt,
           r.updatedAt,
           r.closedAt,
           r.closeReason,
           COUNT(p.id) AS participantCount,
           SUM(CASE WHEN p.role = 'viewer' THEN 1 ELSE 0 END) AS viewerCount,
           SUM(CASE WHEN p.role = 'controller' THEN 1 ELSE 0 END) AS controllerCount,
           (
             SELECT participantName
             FROM room_participants pc
             WHERE pc.roomId = r.id AND pc.role = 'controller'
             ORDER BY pc.lastSeenAt DESC
             LIMIT 1
           ) AS latestControllerName,
           (
             SELECT participantName
             FROM room_participants pr
             WHERE pr.roomId = r.id AND pr.role = 'robot'
             ORDER BY pr.lastSeenAt DESC
             LIMIT 1
           ) AS robotParticipantName
         FROM rooms r
         LEFT JOIN room_participants p ON p.roomId = r.id
         WHERE r.id = ?
         GROUP BY r.id`
      )
      .all(roomId) as SqlRow[];
    const summary = summaryRows[0] ? this.toRoomRecordSummary(summaryRows[0]) : undefined;
    if (!summary) {
      return undefined;
    }

    const participants = this.db
      .prepare("SELECT * FROM room_participants WHERE roomId = ? ORDER BY joinedAt ASC, id ASC")
      .all(roomId) as SqlRow[];
    const events = this.db
      .prepare("SELECT * FROM room_events WHERE roomId = ? ORDER BY createdAt ASC, id ASC")
      .all(roomId) as SqlRow[];

    return {
      ...summary,
      participants: participants.map((participant) => this.toParticipantRecord(participant)),
      events: events.map((event) => this.toEventRecord(event))
    };
  }

  pruneOldClosedRooms(): void {
    const cutoff = nowMs() - this.retentionDays * 24 * 60 * 60 * 1000;
    this.db.prepare("DELETE FROM rooms WHERE status = 'closed' AND closedAt IS NOT NULL AND closedAt < ?").run(cutoff);
  }

  private toRoomRecordSummary(row: SqlRow): RoomRecordSummary {
    return {
      id: asNumber(row.id),
      roomName: String(row.roomName),
      inviteCode: asOptionalString(row.inviteCode),
      status: row.status === "closed" ? "closed" : "open",
      currentControllerParticipantId: asOptionalString(row.currentControllerParticipantId),
      robotId: asOptionalString(row.robotId),
      createdAt: asNumber(row.createdAt),
      updatedAt: asNumber(row.updatedAt),
      closedAt: asOptionalNumber(row.closedAt),
      closeReason: asOptionalString(row.closeReason),
      participantCount: asNumber(row.participantCount ?? 0),
      viewerCount: asNumber(row.viewerCount ?? 0),
      controllerCount: asNumber(row.controllerCount ?? 0),
      latestControllerName: asOptionalString(row.latestControllerName),
      robotParticipantName: asOptionalString(row.robotParticipantName)
    };
  }

  private toParticipantRecord(row: SqlRow): RoomParticipantRecord {
    return {
      id: asNumber(row.id),
      roomId: asNumber(row.roomId),
      participantId: String(row.participantId),
      clientSessionId: asOptionalString(row.clientSessionId),
      participantName: String(row.participantName),
      role: row.role as Role,
      connected: asBoolean(row.connected),
      joinedAt: asNumber(row.joinedAt),
      lastSeenAt: asNumber(row.lastSeenAt),
      leftAt: asOptionalNumber(row.leftAt),
      kickedAt: asOptionalNumber(row.kickedAt),
      kickReason: asOptionalString(row.kickReason)
    };
  }

  private toEventRecord(row: SqlRow): RoomEventRecord {
    return {
      id: asNumber(row.id),
      roomId: asNumber(row.roomId),
      type: String(row.type),
      actorParticipantId: asOptionalString(row.actorParticipantId),
      actorName: asOptionalString(row.actorName),
      payload: parsePayload(row.payloadJson),
      createdAt: asNumber(row.createdAt)
    };
  }
}
