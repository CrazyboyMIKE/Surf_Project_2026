import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WS_URL } from "./api";
import type {
  ChatMessage,
  ControlParameters,
  JoinRoomResponse,
  KeyboardControlStatus,
  KeyboardDirection,
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
  const [keyboardStatus, setKeyboardStatus] = useState<KeyboardControlStatus | null>(null);
  const [lastKeyboardResult, setLastKeyboardResult] = useState("");
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
    setKeyboardStatus(null);
    setLastKeyboardResult("");
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
      setLastError("");
      socket.send(
        JSON.stringify({
          type: "hello",
          roomName,
          participantId
        })
      );
    });

    socket.addEventListener("message", (event) => {
      let message: RoomSocketMessage;
      try {
        message = JSON.parse(event.data as string) as RoomSocketMessage;
      } catch {
        setLastError("WebSocket received an invalid message");
        return;
      }

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

      if (message.type === "robot_control_result") {
        if (!message.ok) {
          setLastError(`${message.code ?? "ROBOT_CONTROL_FAILED"}: ${message.message}`);
        }
        return;
      }

      if (message.type === "keyboard_control_status") {
        setKeyboardStatus(message);
        return;
      }

      if (message.type === "keyboard_control_result") {
        setLastKeyboardResult(message.ok ? message.message : `${message.code ?? "KEYBOARD_CONTROL_FAILED"}: ${message.message}`);
        if (!message.ok) {
          setLastError(`${message.code ?? "KEYBOARD_CONTROL_FAILED"}: ${message.message}`);
        }
        if (message.status) {
          setKeyboardStatus(message.status);
        }
        return;
      }

      if (message.type === "error") {
        setLastError(`${message.code}: ${message.message}`);
      }
    });

    socket.addEventListener("close", (event) => {
      setConnectionState("closed");
      if (!event.wasClean) {
        setLastError("WebSocket closed unexpectedly. Check the public WSS URL and backend health.");
      }
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
      setLastError("WebSocket connection error. Check VITE_WS_BASE_URL, HTTPS/WSS, and backend CORS.");
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

  const sendKeyboardControlStart = useCallback(
    (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => {
      if (!session || role !== "controller" || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "keyboard_control_start",
          roomName: session.roomName,
          direction,
          linearSpeed,
          angularSpeed
        })
      );
    },
    [role, session]
  );

  const sendKeyboardControlKeepalive = useCallback(
    (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => {
      if (!session || role !== "controller" || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "keyboard_control_keepalive",
          roomName: session.roomName,
          direction,
          linearSpeed,
          angularSpeed
        })
      );
    },
    [role, session]
  );

  const sendKeyboardControlStop = useCallback(() => {
    if (!session || socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "keyboard_control_stop",
        roomName: session.roomName
      })
    );
  }, [session]);

  return useMemo(
    () => ({
      connectionState,
      role,
      currentControllerName,
      robotOnline,
      participants,
      chatMessages,
      robotEvents,
      keyboardStatus,
      lastKeyboardResult,
      lastError,
      sendChat,
      sendControl,
      sendKeyboardControlStart,
      sendKeyboardControlKeepalive,
      sendKeyboardControlStop
    }),
    [
      chatMessages,
      connectionState,
      currentControllerName,
      lastError,
      participants,
      robotEvents,
      keyboardStatus,
      lastKeyboardResult,
      robotOnline,
      role,
      sendChat,
      sendControl,
      sendKeyboardControlKeepalive,
      sendKeyboardControlStart,
      sendKeyboardControlStop
    ]
  );
}
