import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WS_URL } from "./api";
import type {
  ChatMessage,
  ControlParameters,
  JoinRoomResponse,
  ParticipantSummary,
  RobotCommand,
  RobotControlEvent,
  RoomSocketMessage,
  WebRole
} from "./types";

type ConnectionState = "idle" | "connecting" | "connected" | "closed" | "error";

export function useRoomSocket(session: JoinRoomResponse | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [role, setRole] = useState<WebRole | null>(session?.role ?? null);
  const [currentControllerName, setCurrentControllerName] = useState<string | undefined>(session?.currentControllerName);
  const [robotOnline, setRobotOnline] = useState<boolean>(session?.robotOnline ?? false);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [robotEvents, setRobotEvents] = useState<RobotControlEvent[]>([]);
  const [lastError, setLastError] = useState<string>("");

  useEffect(() => {
    setRole(session?.role ?? null);
  }, [session?.participantId, session?.role]);

  useEffect(() => {
    setCurrentControllerName(session?.currentControllerName);
    setRobotOnline(session?.robotOnline ?? false);
    setParticipants([]);
    setChatMessages([]);
    setRobotEvents([]);
    setLastError("");
  }, [session?.participantId, session?.currentControllerName, session?.robotOnline]);

  useEffect(() => {
    if (!session) {
      setConnectionState("idle");
      return;
    }

    const roomName = session.roomName;
    const participantId = session.participantId;
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;
    setConnectionState("connecting");

    socket.addEventListener("open", () => {
      setConnectionState("connected");
      socket.send(
        JSON.stringify({
          type: "hello",
          roomName,
          participantId
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as RoomSocketMessage;

      if (message.type === "hello" && message.participantId === participantId) {
        if (message.role === "controller" || message.role === "viewer") {
          setRole(message.role);
        }
        return;
      }

      if (message.type === "chat") {
        setChatMessages((messages) => [...messages, message]);
        return;
      }

      if (message.type === "role_update") {
        setParticipants(message.participants);
        setCurrentControllerName(message.currentControllerName);
        const currentUser = message.participants.find((participant) => participant.id === participantId);
        if (currentUser?.role === "controller" || currentUser?.role === "viewer") {
          setRole(currentUser.role);
        }
        return;
      }

      if (message.type === "robot_status") {
        setRobotOnline(message.online);
        return;
      }

      if (message.type === "robot_control") {
        setRobotEvents((events) => [message, ...events].slice(0, 6));
        return;
      }

      if (message.type === "error") {
        setLastError(`${message.code}: ${message.message}`);
      }
    });

    socket.addEventListener("close", () => {
      setConnectionState("closed");
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
      setLastError("WebSocket connection error");
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [session?.roomName, session?.participantId]);

  const sendChat = useCallback(
    (message: string) => {
      if (!session || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "chat",
          roomName: session.roomName,
          senderId: session.participantId,
          message
        })
      );
    },
    [session]
  );

  const sendControl = useCallback(
    (command: RobotCommand, parameters: ControlParameters = {}) => {
      if (!session || role !== "controller" || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "robot_control",
          roomName: session.roomName,
          senderId: session.participantId,
          command,
          parameters
        })
      );
    },
    [role, session]
  );

  return useMemo(
    () => ({
      connectionState,
      role,
      currentControllerName,
      robotOnline,
      participants,
      chatMessages,
      robotEvents,
      lastError,
      sendChat,
      sendControl
    }),
    [
      chatMessages,
      connectionState,
      currentControllerName,
      lastError,
      participants,
      robotEvents,
      robotOnline,
      role,
      sendChat,
      sendControl
    ]
  );
}
