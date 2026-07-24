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
  assertNoMessage: (predicate: (message: Record<string, unknown>) => boolean, timeoutMs?: number) => Promise<void>;
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

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off("message", onMessage);
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeoutMs);

      function onMessage(raw: Buffer): void {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (!predicate(parsed)) {
          return;
        }

        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(parsed);
      }

      socket.on("message", onMessage);
    });
  }

  async function assertNoMessage(predicate: (message: Record<string, unknown>) => boolean, timeoutMs = 140): Promise<void> {
    const startIndex = messages.length;
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    assert.equal(messages.slice(startIndex).some(predicate), false);
  }

  socket.send(
    JSON.stringify({
      type: "hello",
      roomName,
      participantId
    })
  );
  await waitForMessage((message) => message.type === "hello" && message.participantId === participantId);

  return {
    socket,
    messages,
    waitForMessage,
    assertNoMessage
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
const viewerA = roomStore.joinWebParticipant(roomName, "Viewer A", "viewer").participant;
const viewerB = roomStore.joinWebParticipant(roomName, "Viewer B", "viewer").participant;
const viewerC = roomStore.joinWebParticipant(roomName, "Viewer C", "viewer").participant;
const offlineViewer = roomStore.joinWebParticipant(roomName, "Offline Viewer", "viewer").participant;
const controller = roomStore.joinWebParticipant(roomName, "Controller", "controller").participant;
const robot = roomStore.joinRobot(roomName, "robot-001").participant;
const server = createServer();
const webSocketHub: WebSocketHub = attachWebSocketServer(server, roomStore, fakeRobotControlAdapter, readKeyboardControlConfig({}));
const port = await listen(server);
const wsUrl = `ws://127.0.0.1:${port}/ws`;

const sockets: SocketHarness[] = [];
try {
  const socketA = await connectSocket(wsUrl, roomName, viewerA.id);
  const socketB = await connectSocket(wsUrl, roomName, viewerB.id);
  const socketC = await connectSocket(wsUrl, roomName, viewerC.id);
  const socketController = await connectSocket(wsUrl, roomName, controller.id);
  const socketRobot = await connectSocket(wsUrl, roomName, robot.id);
  sockets.push(socketA, socketB, socketC, socketController, socketRobot);

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: viewerB.id,
      message: "hello privately"
    })
  );

  const deliveredToA = await socketA.waitForMessage(
    (message) => message.type === "private_chat_delivered" && message.message === "hello privately"
  );
  const deliveredToB = await socketB.waitForMessage(
    (message) => message.type === "private_chat_delivered" && message.message === "hello privately"
  );
  await socketC.assertNoMessage((message) => message.type === "private_chat_delivered");

  assert.equal(deliveredToA.senderId, viewerA.id);
  assert.equal(deliveredToA.recipientId, viewerB.id);
  assert.equal(deliveredToB.senderId, viewerA.id);
  assert.equal(deliveredToB.recipientId, viewerB.id);
  assert.equal(Object.prototype.hasOwnProperty.call(deliveredToA, "token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(deliveredToA, "LIVEKIT_API_SECRET"), false);

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: controller.id,
      message: "no controller"
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Private chat recipient must be an online viewer"))
      .code,
    "TARGET_NOT_VIEWER"
  );

  socketController.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: controller.id,
      recipientId: viewerA.id,
      message: "controller blocked"
    })
  );
  assert.equal(
    (await socketController.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Only viewers can send private chat")).code,
    "FORBIDDEN"
  );

  socketRobot.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: robot.id,
      recipientId: viewerA.id,
      message: "robot blocked"
    })
  );
  assert.equal(
    (await socketRobot.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Only viewers can send private chat")).code,
    "FORBIDDEN"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: viewerA.id,
      message: "self"
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Private chat recipient must be another viewer")).code,
    "INVALID_REQUEST"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: "missing-viewer",
      message: "missing"
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Recipient is not in this room")).code,
    "PARTICIPANT_NOT_FOUND"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: offlineViewer.id,
      message: "offline"
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Recipient viewer is offline")).code,
    "TARGET_OFFLINE"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: viewerB.id,
      message: ""
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Private chat message must be between 1 and 500 characters"))
      .code,
    "INVALID_REQUEST"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: viewerB.id,
      message: "x".repeat(501)
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Private chat message must be between 1 and 500 characters"))
      .code,
    "INVALID_REQUEST"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "private_chat",
      roomName,
      senderId: viewerA.id,
      recipientId: viewerB.id,
      message: "extra",
      token: "should-not-be-accepted"
    })
  );
  assert.equal(
    (await socketA.waitForMessage((message) => message.type === "private_chat_error" && message.message === "Private chat message contains unsupported fields")).code,
    "INVALID_REQUEST"
  );
} finally {
  for (const socket of sockets) {
    socket.socket.close(1000, "test_complete");
  }
  webSocketHub.close();
  await closeServer(server);
}

console.log("privateChat tests passed");
