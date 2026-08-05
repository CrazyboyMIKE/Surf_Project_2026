import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WS_URL } from "./api";
import type {
  ChatMessage,
  ControlParameters,
  ControlRequestState,
  JoinRoomResponse,
  KeyboardControlStatus,
  KeyboardDirection,
  ParticipantSummary,
  PrivateChatErrorMessage,
  PrivateChatMessage,
  RobotCommand,
  RobotControlEvent,
  RoomSocketMessage,
  SpeakerState,
  WebRole
} from "./types";

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";

const MAX_RECONNECT_DELAY_MS = 10_000;
const EMPTY_SPEAKER_STATE: SpeakerState = {
  queue: []
};
const EMPTY_CONTROL_REQUEST_STATE: ControlRequestState = {
  queue: []
};

function getReconnectDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(attempt - 1, 0), MAX_RECONNECT_DELAY_MS);
}

export function useRoomSocket(session: JoinRoomResponse | null, onForcedDisconnect?: (message: string) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const onForcedDisconnectRef = useRef(onForcedDisconnect);
  const roomName = session?.roomName;
  const participantId = session?.participantId;
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [role, setRole] = useState<WebRole | null>(session?.role ?? null);
  const [currentControllerName, setCurrentControllerName] = useState<string | undefined>(session?.currentControllerName);
  const [robotOnline, setRobotOnline] = useState<boolean>(session?.robotOnline ?? false);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [privateMessages, setPrivateMessages] = useState<PrivateChatMessage[]>([]);
  const [privateChatErrors, setPrivateChatErrors] = useState<PrivateChatErrorMessage[]>([]);
  const [robotEvents, setRobotEvents] = useState<RobotControlEvent[]>([]);
  const [keyboardStatus, setKeyboardStatus] = useState<KeyboardControlStatus | null>(null);
  const [speaker, setSpeaker] = useState<SpeakerState>(EMPTY_SPEAKER_STATE);
  const [controlRequests, setControlRequests] = useState<ControlRequestState>(
    session?.controlRequests ?? EMPTY_CONTROL_REQUEST_STATE
  );
  const [lastKeyboardResult, setLastKeyboardResult] = useState("");
  const [lastError, setLastError] = useState<string>("");

  useEffect(() => {
    onForcedDisconnectRef.current = onForcedDisconnect;
  }, [onForcedDisconnect]);

  useEffect(() => {
    setRole(session?.role ?? null);
  }, [session?.participantId]);

  useEffect(() => {
    setCurrentControllerName(session?.currentControllerName);
    setRobotOnline(session?.robotOnline ?? false);
    setParticipants([]);
    setChatMessages([]);
    setPrivateMessages([]);
    setPrivateChatErrors([]);
    setRobotEvents([]);
    setKeyboardStatus(null);
    setSpeaker(EMPTY_SPEAKER_STATE);
    setControlRequests(session?.controlRequests ?? EMPTY_CONTROL_REQUEST_STATE);
    setLastKeyboardResult("");
    setLastError("");
  }, [session?.participantId, session?.currentControllerName, session?.robotOnline, session?.controlRequests]);

  useEffect(() => {
    if (!session) {
      setConnectionState("idle");
      return;
    }

    const roomName = session.roomName;
    const participantId = session.participantId;
    let active = true;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function clearReconnectTimer(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    }

    function connectSocket(): void {
      if (!active) {
        return;
      }

      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;
      setConnectionState(reconnectAttempt > 0 ? "reconnecting" : "connecting");

      socket.addEventListener("open", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }

        reconnectAttempt = 0;
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
        if (!active || socketRef.current !== socket) {
          return;
        }

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

        if (message.type === "private_chat_delivered") {
          setPrivateMessages((messages) => [...messages, message]);
          return;
        }

        if (message.type === "private_chat_error") {
          setPrivateChatErrors((errors) => [...errors, message].slice(-8));
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

        if (message.type === "speaker_update") {
          setSpeaker({
            currentSpeaker: message.currentSpeaker,
            currentSpeakerId: message.currentSpeakerId,
            currentSpeakerName: message.currentSpeakerName,
            currentSpeakerStartedAt: message.currentSpeakerStartedAt,
            queue: message.queue
          });
          return;
        }

        if (message.type === "control_request_update") {
          setControlRequests({
            currentControllerId: message.currentControllerId,
            currentControllerName: message.currentControllerName,
            queue: message.queue
          });
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
          const errorText = `${message.code}: ${message.message}`;
          setLastError(errorText);
          if (message.code === "PARTICIPANT_KICKED" || message.code === "ROOM_CLOSED") {
            onForcedDisconnectRef.current?.(errorText);
            socket.close(1000, "forced_disconnect");
          }
        }
      });

      socket.addEventListener("close", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }

        socketRef.current = null;
        reconnectAttempt += 1;
        const delayMs = getReconnectDelayMs(reconnectAttempt);
        setConnectionState("reconnecting");
        setLastError(
          `WebSocket disconnected (code ${event.code || "unknown"}). Reconnecting in ${Math.round(delayMs / 1000)}s...`
        );
        clearReconnectTimer();
        reconnectTimer = setTimeout(connectSocket, delayMs);
      });

      socket.addEventListener("error", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }

        setConnectionState("error");
        setLastError("WebSocket connection error. Retrying automatically; check VITE_WS_BASE_URL, HTTPS/WSS, and backend CORS if it persists.");
      });
    }

    connectSocket();

    return () => {
      active = false;
      clearReconnectTimer();
      socketRef.current?.close(1000, "session_changed");
      socketRef.current = null;
    };
  }, [session?.roomName, session?.participantId]);

  const sendChat = useCallback(
    (message: string) => {
      if (!roomName || !participantId || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "chat",
          roomName,
          senderId: participantId,
          message
        })
      );
    },
    [participantId, roomName]
  );

  const sendPrivateChat = useCallback(
    (recipientId: string, message: string) => {
      if (!roomName || !participantId || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "private_chat",
          roomName,
          senderId: participantId,
          recipientId,
          message
        })
      );
    },
    [participantId, roomName]
  );

  const sendControl = useCallback(
    (command: RobotCommand, parameters: ControlParameters = {}) => {
      if (!roomName || !participantId || role !== "controller" || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "robot_control",
          roomName,
          senderId: participantId,
          command,
          parameters
        })
      );
    },
    [participantId, role, roomName]
  );

  const sendKeyboardControlStart = useCallback(
    (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => {
      if (!roomName || role !== "controller" || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "keyboard_control_start",
          roomName,
          direction,
          linearSpeed,
          angularSpeed
        })
      );
    },
    [role, roomName]
  );

  const sendKeyboardControlKeepalive = useCallback(
    (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => {
      if (!roomName || role !== "controller" || socketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: "keyboard_control_keepalive",
          roomName,
          direction,
          linearSpeed,
          angularSpeed
        })
      );
    },
    [role, roomName]
  );

  const sendKeyboardControlStop = useCallback(() => {
    if (!roomName || socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "keyboard_control_stop",
        roomName
      })
    );
  }, [roomName]);

  const sendSpeakerRequest = useCallback(() => {
    if (
      !roomName ||
      !participantId ||
      (role !== "viewer" && role !== "controller") ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "speaker_request",
        roomName,
        senderId: participantId
      })
    );
  }, [participantId, role, roomName]);

  const sendSpeakerEnd = useCallback(() => {
    if (!roomName || !participantId || socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "speaker_end",
        roomName,
        senderId: participantId
      })
    );
  }, [participantId, roomName]);

  return useMemo(
    () => ({
      connectionState,
      role,
      currentControllerName,
      robotOnline,
      participants,
      chatMessages,
      privateMessages,
      privateChatErrors,
      robotEvents,
      keyboardStatus,
      speaker,
      controlRequests,
      lastKeyboardResult,
      lastError,
      sendChat,
      sendPrivateChat,
      sendControl,
      sendKeyboardControlStart,
      sendKeyboardControlKeepalive,
      sendKeyboardControlStop,
      sendSpeakerRequest,
      sendSpeakerEnd
    }),
    [
      chatMessages,
      connectionState,
      currentControllerName,
      lastError,
      participants,
      privateChatErrors,
      privateMessages,
      robotEvents,
      keyboardStatus,
      speaker,
      controlRequests,
      lastKeyboardResult,
      robotOnline,
      role,
      sendChat,
      sendPrivateChat,
      sendControl,
      sendKeyboardControlKeepalive,
      sendKeyboardControlStart,
      sendKeyboardControlStop,
      sendSpeakerRequest,
      sendSpeakerEnd
    ]
  );
}
