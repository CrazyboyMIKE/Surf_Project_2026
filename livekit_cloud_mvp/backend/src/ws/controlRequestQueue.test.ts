import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { readKeyboardControlConfig } from "../keyboardControl/config.js";
import type { RobotControlAdapter } from "../robotControl/adapter.js";
import { RoomStore } from "../state/roomStore.js";
import { attachWebSocketServer, type WebSocketHub } from "./webSocketServer.js";

type SocketHarness = {
  socket: WebSocket;
  messages: Array<Record<string, unknown>>;
  waitForMessage: (predicate: (message: Record<string, unknown>) => boolean, timeoutMs?: number) => Promise<Record<string, unknown>>;
  waitForNewMessage: (
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>;
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.notEqual(address, null);
      assert.notEqual(typeof address, "string");
      resolve((address as AddressInfo).port);
    });
  });
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

async function connectSocket(wsUrl: string, roomName: string, participantId: string): Promise<SocketHarness> {
  const socket = new WebSocket(wsUrl);
  const messages: Array<Record<string, unknown>> = [];

  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()) as Record<string, unknown>);
  });

  await waitForOpen(socket);

  function waitForMessage(
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs = 700
  ): Promise<Record<string, unknown>> {
    const existing = messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return waitForNewMessage(predicate, timeoutMs);
  }

  function waitForNewMessage(
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs = 700
  ): Promise<Record<string, unknown>> {
    const startIndex = messages.length;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off("message", onMessage);
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeoutMs);

      function onMessage(raw: Buffer): void {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        const isNewMessage = messages.indexOf(parsed) >= startIndex || !messages.includes(parsed);
        if (!isNewMessage || !predicate(parsed)) {
          return;
        }

        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(parsed);
      }

      socket.on("message", onMessage);
    });
  }

  socket.send(
    JSON.stringify({
      type: "hello",
      roomName,
      participantId
    })
  );
  await waitForNewMessage((message) => message.type === "hello" && message.participantId === participantId);

  return {
    socket,
    messages,
    waitForMessage,
    waitForNewMessage
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

const fakeRobotControlAdapter = {
  mode: "mock",
  async sendCommand() {
    return {
      ok: true,
      mode: "mock",
      message: "mock command"
    };
  }
} satisfies RobotControlAdapter;

const roomName = "robot-room-001";
const roomStore = new RoomStore({ mockRobotOnline: false });
const controller = roomStore.joinWebParticipant(roomName, "Controller", "controller").participant;
const viewerA = roomStore.joinWebParticipant(roomName, "Viewer A", "viewer").participant;
const viewerB = roomStore.joinWebParticipant(roomName, "Viewer B", "viewer").participant;
const server = createServer();
const webSocketHub: WebSocketHub = attachWebSocketServer(server, roomStore, fakeRobotControlAdapter, readKeyboardControlConfig({}));
const port = await listen(server);
const wsUrl = `ws://127.0.0.1:${port}/ws`;

const sockets: SocketHarness[] = [];
try {
  const socketController = await connectSocket(wsUrl, roomName, controller.id);
  const socketA = await connectSocket(wsUrl, roomName, viewerA.id);
  const socketB = await connectSocket(wsUrl, roomName, viewerB.id);
  sockets.push(socketController, socketA, socketB);

  const initialUpdate = await socketController.waitForMessage((message) => message.type === "control_request_update");
  assert.deepEqual(initialUpdate.queue, []);

  roomStore.requestControl(roomName, viewerA.id);
  webSocketHub.broadcastRoleUpdate(roomName);
  const queuedUpdate = await socketController.waitForNewMessage((message) => {
    const queue = message.queue as Array<Record<string, unknown>> | undefined;
    return message.type === "control_request_update" && queue?.[0]?.id === viewerA.id;
  });
  assert.equal(queuedUpdate.currentControllerId, controller.id);

  roomStore.requestControl(roomName, viewerA.id);
  webSocketHub.broadcastRoleUpdate(roomName);
  const duplicateUpdate = await socketController.waitForNewMessage((message) => {
    const queue = message.queue as Array<Record<string, unknown>> | undefined;
    return message.type === "control_request_update" && queue?.length === 1 && queue[0]?.id === viewerA.id;
  });
  assert.equal(duplicateUpdate.currentControllerId, controller.id);

  roomStore.requestControl(roomName, viewerB.id);
  roomStore.transferControl(roomName, controller.id, viewerA.id);
  webSocketHub.broadcastRoleUpdate(roomName);
  const transferredUpdate = await socketA.waitForNewMessage((message) => {
    const queue = message.queue as Array<Record<string, unknown>> | undefined;
    return message.type === "control_request_update" && message.currentControllerId === viewerA.id && queue?.[0]?.id === viewerB.id;
  });
  assert.equal(transferredUpdate.currentControllerId, viewerA.id);

  socketB.socket.close(1000, "requester left");
  const cleanupUpdate = await socketA.waitForNewMessage((message) => {
    const queue = message.queue as Array<Record<string, unknown>> | undefined;
    return message.type === "control_request_update" && message.currentControllerId === viewerA.id && queue?.length === 0;
  });
  assert.deepEqual(cleanupUpdate.queue, []);
} finally {
  for (const harness of sockets) {
    harness.socket.close();
  }
  webSocketHub.close();
  await closeServer(server);
}

console.log("controlRequestQueue WebSocket tests passed");
