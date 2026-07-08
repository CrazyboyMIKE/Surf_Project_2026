import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { validateRobotControlMessage } from "../control/commandValidation.js";
import type { ApiErrorCode } from "../types.js";
import type { RoomStore } from "../state/roomStore.js";

type SocketContext = {
  roomName: string;
  participantId: string;
};

type WebSocketMessage = {
  type?: unknown;
  roomName?: unknown;
  participantId?: unknown;
  senderId?: unknown;
  message?: unknown;
  command?: unknown;
  parameters?: unknown;
};

export type WebSocketHub = {
  broadcastRoleUpdate: (roomName: string) => void;
  broadcastRobotStatus: (roomName: string) => void;
};

function isRecord(value: unknown): value is WebSocketMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function parseMessage(raw: RawData): WebSocketMessage | undefined {
  try {
    const parsed = JSON.parse(raw.toString()) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sendError(socket: WebSocket, code: ApiErrorCode | "SOCKET_NOT_IDENTIFIED" | "SENDER_MISMATCH", message: string): void {
  sendJson(socket, {
    type: "error",
    code,
    message
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function contextMatches(context: SocketContext | undefined, roomName: string, participantId: string): boolean {
  return context?.roomName === roomName && context.participantId === participantId;
}

export function attachWebSocketServer(server: Server, roomStore: RoomStore): WebSocketHub {
  const webSocketServer = new WebSocketServer({ server, path: "/ws" });
  const clientsByRoom = new Map<string, Set<WebSocket>>();

  function addClient(roomName: string, socket: WebSocket): void {
    const clients = clientsByRoom.get(roomName) ?? new Set<WebSocket>();
    clients.add(socket);
    clientsByRoom.set(roomName, clients);
  }

  function removeClient(roomName: string, socket: WebSocket): void {
    const clients = clientsByRoom.get(roomName);
    if (!clients) {
      return;
    }

    clients.delete(socket);
    if (clients.size === 0) {
      clientsByRoom.delete(roomName);
    }
  }

  function broadcast(roomName: string, payload: Record<string, unknown>): void {
    const clients = clientsByRoom.get(roomName);
    if (!clients) {
      return;
    }

    for (const client of clients) {
      sendJson(client, payload);
    }
  }

  function broadcastRoleUpdate(roomName: string): void {
    const snapshot = roomStore.getRoomSnapshot(roomName);
    if (!snapshot) {
      return;
    }

    broadcast(roomName, {
      type: "role_update",
      roomName,
      currentControllerId: snapshot.currentControllerId,
      currentControllerName: snapshot.currentControllerName,
      participants: snapshot.participants,
      timestamp: Date.now()
    });
  }

  function broadcastRobotStatus(roomName: string): void {
    const snapshot = roomStore.getRoomSnapshot(roomName);
    if (!snapshot) {
      return;
    }

    broadcast(roomName, {
      type: "robot_status",
      roomName,
      robotId: snapshot.robotId,
      online: snapshot.robotOnline,
      timestamp: Date.now()
    });
  }

  webSocketServer.on("connection", (socket) => {
    let context: SocketContext | undefined;

    socket.on("message", (raw) => {
      const message = parseMessage(raw);
      if (!message || typeof message.type !== "string") {
        sendError(socket, "INVALID_REQUEST", "Message must be a JSON object with type");
        return;
      }

      if (message.type === "hello") {
        const roomName = readString(message.roomName);
        const participantId = readString(message.participantId);

        if (!roomName || !participantId) {
          sendError(socket, "INVALID_REQUEST", "hello requires roomName and participantId");
          return;
        }

        const participant = roomStore.markParticipantConnected(roomName, participantId);
        if (!participant) {
          sendError(socket, "PARTICIPANT_NOT_FOUND", "Participant must join the room before opening WebSocket");
          return;
        }

        if (context) {
          removeClient(context.roomName, socket);
        }

        context = { roomName, participantId };
        addClient(roomName, socket);

        sendJson(socket, {
          type: "hello",
          roomName,
          participantId,
          role: participant.role,
          timestamp: Date.now()
        });
        broadcastRoleUpdate(roomName);
        broadcastRobotStatus(roomName);
        return;
      }

      if (message.type === "chat") {
        const roomName = readString(message.roomName);
        const senderId = readString(message.senderId);
        const chatText = typeof message.message === "string" ? message.message.trim() : "";

        if (!roomName || !senderId || !contextMatches(context, roomName, senderId)) {
          sendError(socket, context ? "SENDER_MISMATCH" : "SOCKET_NOT_IDENTIFIED", "WebSocket sender does not match hello");
          return;
        }

        const room = roomStore.getRoom(roomName);
        const sender = room?.participants.get(senderId);
        if (!room || !sender) {
          sendError(socket, "PARTICIPANT_NOT_FOUND", "Sender is not in the room");
          return;
        }

        if (!chatText || chatText.length > 500) {
          sendError(socket, "INVALID_REQUEST", "Chat message must be between 1 and 500 characters");
          return;
        }

        broadcast(roomName, {
          type: "chat",
          roomName,
          senderId,
          senderName: sender.name,
          message: chatText,
          timestamp: Date.now()
        });
        return;
      }

      if (message.type === "robot_control") {
        const roomName = readString(message.roomName);
        const senderId = readString(message.senderId);

        if (!roomName || !senderId || !contextMatches(context, roomName, senderId)) {
          sendError(socket, context ? "SENDER_MISMATCH" : "SOCKET_NOT_IDENTIFIED", "WebSocket sender does not match hello");
          return;
        }

        const validation = validateRobotControlMessage({
          room: roomStore.getRoom(roomName),
          senderId,
          command: message.command,
          parameters: message.parameters
        });

        if (!validation.ok) {
          sendError(socket, validation.code, validation.message);
          return;
        }

        const timestamp = Date.now();
        roomStore.recordRobotControl(roomName, validation.command, validation.parameters, senderId, timestamp);
        console.log(
          `[mock-robot] room=${roomName} from=${senderId} command=${validation.command} parameters=${JSON.stringify(
            validation.parameters
          )}`
        );

        broadcast(roomName, {
          type: "robot_control",
          roomName,
          command: validation.command,
          parameters: validation.parameters,
          from: senderId,
          timestamp
        });
        return;
      }

      sendError(socket, "INVALID_REQUEST", `Unsupported message type: ${message.type}`);
    });

    socket.on("close", () => {
      if (!context) {
        return;
      }

      removeClient(context.roomName, socket);
      const result = roomStore.markParticipantDisconnected(context.roomName, context.participantId);
      if (result.controllerReleased) {
        broadcastRoleUpdate(context.roomName);
      }
      if (result.robotStatusChanged) {
        broadcastRobotStatus(context.roomName);
      }
    });
  });

  return {
    broadcastRoleUpdate,
    broadcastRobotStatus
  };
}
