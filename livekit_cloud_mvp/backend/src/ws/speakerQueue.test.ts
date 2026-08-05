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
const robot = roomStore.joinRobot(roomName, "robot-001").participant;
const server = createServer();
const webSocketHub: WebSocketHub = attachWebSocketServer(server, roomStore, fakeRobotControlAdapter, readKeyboardControlConfig({}));
const port = await listen(server);
const wsUrl = `ws://127.0.0.1:${port}/ws`;

const sockets: SocketHarness[] = [];
try {
  const socketController = await connectSocket(wsUrl, roomName, controller.id);
  const socketA = await connectSocket(wsUrl, roomName, viewerA.id);
  const socketB = await connectSocket(wsUrl, roomName, viewerB.id);
  const socketRobot = await connectSocket(wsUrl, roomName, robot.id);
  sockets.push(socketController, socketA, socketB, socketRobot);

  const initialSpeakerUpdate = await socketA.waitForMessage((message) => message.type === "speaker_update");
  assert.deepEqual((initialSpeakerUpdate.currentSpeaker as Record<string, unknown>).id, controller.id);
  assert.deepEqual(initialSpeakerUpdate.queue, []);

  socketA.socket.send(
    JSON.stringify({
      type: "speaker_request",
      roomName,
      senderId: viewerA.id
    })
  );
  const viewerASpeakerUpdate = await socketController.waitForNewMessage(
    (message) => message.type === "speaker_update" && (message.currentSpeaker as Record<string, unknown>)?.id === viewerA.id
  );
  assert.equal(typeof viewerASpeakerUpdate.currentSpeakerStartedAt, "number");
  assert.deepEqual(viewerASpeakerUpdate.queue, []);

  socketA.socket.send(
    JSON.stringify({
      type: "speaker_request",
      roomName,
      senderId: viewerA.id
    })
  );
  const duplicateUpdate = await socketController.waitForNewMessage(
    (message) => message.type === "speaker_update" && (message.currentSpeaker as Record<string, unknown>)?.id === viewerA.id
  );
  assert.deepEqual(duplicateUpdate.queue, []);

  socketB.socket.send(
    JSON.stringify({
      type: "speaker_request",
      roomName,
      senderId: viewerB.id
    })
  );
  const queuedUpdate = await socketController.waitForNewMessage((message) => {
    const queue = message.queue as Array<Record<string, unknown>> | undefined;
    return message.type === "speaker_update" && queue?.[0]?.id === viewerB.id;
  });
  assert.equal((queuedUpdate.currentSpeaker as Record<string, unknown>).id, viewerA.id);
  assert.equal(typeof (queuedUpdate.queue as Array<Record<string, unknown>>)[0]?.requestedAt, "number");

  socketRobot.socket.send(
    JSON.stringify({
      type: "speaker_request",
      roomName,
      senderId: robot.id
    })
  );
  assert.equal((await socketRobot.waitForNewMessage((message) => message.type === "error" && message.code === "FORBIDDEN")).code, "FORBIDDEN");

  socketB.socket.send(
    JSON.stringify({
      type: "speaker_end",
      roomName,
      senderId: viewerB.id
    })
  );
  assert.equal(
    (await socketB.waitForNewMessage((message) => message.type === "error" && message.code === "NOT_SPEAKER")).code,
    "NOT_SPEAKER"
  );

  socketA.socket.send(
    JSON.stringify({
      type: "speaker_end",
      roomName,
      senderId: viewerA.id
    })
  );
  const promotedUpdate = await socketController.waitForNewMessage(
    (message) => message.type === "speaker_update" && (message.currentSpeaker as Record<string, unknown>)?.id === viewerB.id
  );
  assert.equal(typeof promotedUpdate.currentSpeakerStartedAt, "number");
  assert.deepEqual(promotedUpdate.queue, []);

  socketB.socket.close(1000, "speaker left");
  const fallbackUpdate = await socketController.waitForNewMessage(
    (message) => message.type === "speaker_update" && (message.currentSpeaker as Record<string, unknown>)?.id === controller.id
  );
  assert.equal(fallbackUpdate.currentSpeakerStartedAt, undefined);
  assert.deepEqual(fallbackUpdate.queue, []);
} finally {
  for (const harness of sockets) {
    harness.socket.close();
  }
  webSocketHub.close();
  await closeServer(server);
}

console.log("speakerQueue WebSocket tests passed");
