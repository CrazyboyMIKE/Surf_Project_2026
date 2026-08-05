import { useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, leaveRoom, releaseControl, requestControl, sendLeaveRoomBeacon, transferControl } from "./api";
import { AdminConsole } from "./components/AdminConsole";
import { ChatPanel } from "./components/ChatPanel";
import { ControlPanel } from "./components/ControlPanel";
import { JoinRoomForm } from "./components/JoinRoomForm";
import { MediaControls } from "./components/MediaControls";
import { ParticipantsPanel } from "./components/ParticipantsPanel";
import { PrivateChatPanel } from "./components/PrivateChatPanel";
import { RobotVideo } from "./components/RobotVideo";
import { StatusBar } from "./components/StatusBar";
import { useKeyboardDirectionControl } from "./useKeyboardDirectionControl";
import { useLiveKitRoom } from "./useLiveKitRoom";
import { useRoomSocket } from "./useRoomSocket";
import type {
  ControlParameters,
  JoinRoomRequest,
  JoinRoomResponse,
  KeyboardControlConfig,
  KeyboardDirection,
  Role,
  RobotCommand,
  WebRole
} from "./types";

const FALLBACK_KEYBOARD_CONTROL_CONFIG: KeyboardControlConfig = {
  enabled: false,
  continuous1001Enabled: false,
  mode: "1001",
  sendIntervalMs: 300,
  deadmanTimeoutMs: 900,
  maxSessionMs: 0,
  maxLinearSpeed: 120,
  maxAngularSpeed: 20,
  defaultLinearSpeed: 80,
  defaultAngularSpeed: 15,
  requireFocus: true
};

const SESSION_STORAGE_KEY = "livekitCloudWebSession";
const CLIENT_SESSION_STORAGE_KEY = "livekitCloudWebClientSessionId";
const ROOM_NOTICE_STORAGE_KEY = "livekitCloudWebRoomNotice";
const LEGACY_SESSION_STORAGE_KEY = "livekit-cloud-mvp.room-session";
const LEGACY_CLIENT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.client-session-id";
const STORED_SESSION_VERSION = 2;
const STORED_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const ROBOT_STAGE_PARTICIPANT_ID = "__robot_stage__";
type DirectionFeedbackSignal = KeyboardDirection | "stop";
type WebRoute = "/" | "/login" | "/room" | "/admin";

type StoredSessionEnvelope = {
  version: number;
  savedAt: number;
  session: JoinRoomResponse;
};

function isJoinRoomResponseLike(value: unknown): value is JoinRoomResponse {
  const parsed = value as Partial<JoinRoomResponse>;
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof parsed.roomName === "string" &&
    typeof parsed.participantName === "string" &&
    typeof parsed.participantId === "string" &&
    (parsed.role === "controller" || parsed.role === "viewer") &&
    typeof parsed.liveKitUrl === "string" &&
    typeof parsed.token === "string"
  );
}

function isFreshStoredSession(savedAt: number): boolean {
  const now = Date.now();
  return Number.isFinite(savedAt) && savedAt <= now + 60_000 && now - savedAt <= STORED_SESSION_TTL_MS;
}

function readStoredSession(): JoinRoomResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_CLIENT_SESSION_STORAGE_KEY);
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    const envelope = parsed as Partial<StoredSessionEnvelope>;

    if (
      typeof envelope === "object" &&
      envelope !== null &&
      envelope.version === STORED_SESSION_VERSION &&
      typeof envelope.savedAt === "number" &&
      isJoinRoomResponseLike(envelope.session)
    ) {
      if (isFreshStoredSession(envelope.savedAt)) {
        return envelope.session;
      }

      clearStoredSession();
      clearClientSessionId();
      return null;
    }

    if (isJoinRoomResponseLike(parsed)) {
      clearStoredSession();
      clearClientSessionId();
    }

    return null;
  } catch {
    clearStoredSession();
    clearClientSessionId();
    return null;
  }
}

function saveStoredSession(session: JoinRoomResponse): void {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      version: STORED_SESSION_VERSION,
      savedAt: Date.now(),
      session
    } satisfies StoredSessionEnvelope)
  );
  if (session.clientSessionId) {
    sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, session.clientSessionId);
  }
}

function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(ROOM_NOTICE_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
}

function clearClientSessionId(): void {
  sessionStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_CLIENT_SESSION_STORAGE_KEY);
}

function createClientSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
      .slice(8, 10)
      .join("")}-${hex.slice(10, 16).join("")}`;
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getOrCreateClientSessionId(): string {
  const existing = sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createClientSessionId();
  sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, next);
  return next;
}

function savePendingRoomNotice(message: string): void {
  if (!message) {
    return;
  }

  sessionStorage.setItem(ROOM_NOTICE_STORAGE_KEY, message);
}

function consumePendingRoomNotice(): string {
  const message = sessionStorage.getItem(ROOM_NOTICE_STORAGE_KEY) ?? "";
  sessionStorage.removeItem(ROOM_NOTICE_STORAGE_KEY);
  return message;
}

function getCurrentWebRoute(): WebRoute {
  const pathname = window.location.pathname;
  if (pathname === "/login" || pathname === "/room" || pathname === "/admin") {
    return pathname;
  }

  return "/";
}

function navigateToWebRoute(route: Exclude<WebRoute, "/">, options: { replace?: boolean } = {}): void {
  if (window.location.pathname === route) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }

  if (options.replace) {
    window.history.replaceState(null, "", route);
  } else {
    window.history.pushState(null, "", route);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useWebRoute(): WebRoute {
  const [route, setRoute] = useState<WebRoute>(() => getCurrentWebRoute());

  useEffect(() => {
    const syncRoute = () => setRoute(getCurrentWebRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  return route;
}

function shouldRefreshLiveKitToken(lastError: string): boolean {
  const normalized = lastError.toLowerCase();
  return (
    normalized.includes("token") ||
    normalized.includes("jwt") ||
    normalized.includes("authorization") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("401") ||
    normalized.includes("403")
  );
}

function formatNotificationCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function dockButtonClassName(active: boolean, highlighted: boolean): string {
  return ["floating-dock-button", active ? "active" : "", highlighted ? "has-alert" : ""].filter(Boolean).join(" ");
}

function mobileActionClassName(kind: "primary" | "secondary" | "danger", active = false): string {
  return ["mobile-room-action-button", `mobile-${kind}`, active ? "active" : ""].filter(Boolean).join(" ");
}

function getManualFeedbackDirection(command: RobotCommand, parameters: ControlParameters = {}): DirectionFeedbackSignal {
  if (command === "1000") {
    return "stop";
  }

  if (command === "1002") {
    return (parameters.distanceCm ?? 0) < 0 ? "backward" : "forward";
  }

  return (parameters.angleDeg ?? 0) < 0 ? "right" : "left";
}

function getJoinNotice(payload: JoinRoomRequest, response: JoinRoomResponse): string {
  if (payload.requestedRole === "controller") {
    return response.role === "controller" && response.requestedControllerGranted
      ? "Control granted"
      : "Controller already exists; joined as viewer";
  }

  return response.role === "controller" ? "Control granted" : "Joined as viewer";
}

export function App() {
  const route = useWebRoute();
  const [loginNotice, setLoginNotice] = useState("");

  useEffect(() => {
    if (route === "/") {
      navigateToWebRoute(readStoredSession() ? "/room" : "/login", { replace: true });
      return;
    }

    if (route === "/room" && !readStoredSession()) {
      setLoginNotice("Please join a room first");
      navigateToWebRoute("/login", { replace: true });
      return;
    }

    if (route === "/login" && readStoredSession()) {
      navigateToWebRoute("/room", { replace: true });
    }
  }, [route]);

  if (route === "/admin") {
    return <AdminConsole />;
  }

  if (route === "/room") {
    const storedSession = readStoredSession();
    if (!storedSession) {
      return null;
    }

    return (
      <RoomApp
        initialSession={storedSession}
        initialNotice={loginNotice}
        onLeaveComplete={(message) => {
          setLoginNotice(message);
          navigateToWebRoute("/login", { replace: true });
        }}
      />
    );
  }

  if (route === "/login") {
    return (
      <LoginPage
        notice={loginNotice}
        onNoticeChange={setLoginNotice}
        onJoined={(message) => {
          savePendingRoomNotice(message);
          setLoginNotice(message);
          navigateToWebRoute("/room");
        }}
      />
    );
  }

  return null;
}

function LoginPage({
  notice,
  onNoticeChange,
  onJoined
}: {
  notice: string;
  onNoticeChange: (message: string) => void;
  onJoined: (message: string) => void;
}) {
  async function handleJoin(payload: JoinRoomRequest) {
    const response = await joinRoom({
      ...payload,
      clientSessionId: getOrCreateClientSessionId()
    });
    saveStoredSession(response);
    onJoined(getJoinNotice(payload, response));
  }

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => onNoticeChange(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice, onNoticeChange]);

  return <JoinRoomForm onJoin={handleJoin} notice={notice} />;
}

function MobileRoomActions({
  role,
  robotOnline,
  webSocketState,
  controlRequestPending,
  controlActionsDisabled,
  actionPending,
  onRequestControl,
  onReleaseControl,
  onLeaveRoom
}: {
  role: WebRole | null;
  robotOnline: boolean;
  webSocketState: string;
  controlRequestPending: boolean;
  controlActionsDisabled: boolean;
  actionPending: boolean;
  onRequestControl: () => void;
  onReleaseControl: () => void;
  onLeaveRoom: () => void;
}) {
  const isController = role === "controller";

  return (
    <nav className="mobile-room-actions" aria-label="Room actions">
      <div className="mobile-room-summary" aria-label="Room status">
        <span>{role ?? "viewer"}</span>
        <span className={webSocketState === "connected" ? "online" : "offline"}>
          {webSocketState === "connected" ? "connected" : "reconnecting"}
        </span>
        <span className={robotOnline ? "online" : "offline"}>{robotOnline ? "robot online" : "robot offline"}</span>
      </div>
      <div className="mobile-room-action-grid">
        <button
          type="button"
          className={mobileActionClassName("primary", controlRequestPending)}
          onClick={onRequestControl}
          disabled={isController || controlRequestPending || actionPending || controlActionsDisabled}
        >
          {controlRequestPending ? "Queued" : "Request"}
        </button>
        <button
          type="button"
          className={mobileActionClassName("secondary")}
          onClick={onReleaseControl}
          disabled={!isController || actionPending || controlActionsDisabled}
        >
          Release
        </button>
        <button type="button" className={mobileActionClassName("danger")} onClick={onLeaveRoom} disabled={actionPending}>
          Leave
        </button>
      </div>
    </nav>
  );
}

function RoomApp({
  initialSession,
  initialNotice,
  onLeaveComplete
}: {
  initialSession: JoinRoomResponse;
  initialNotice: string;
  onLeaveComplete: (message: string) => void;
}) {
  const [session, setSession] = useState<JoinRoomResponse | null>(initialSession);
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState(() => consumePendingRoomNotice() || initialNotice);
  const [activeFloatingPanel, setActiveFloatingPanel] = useState<"chat" | "control" | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [locallyMutedAudio, setLocallyMutedAudio] = useState<Record<string, boolean>>({});
  const [selectedStageParticipantId, setSelectedStageParticipantId] = useState<string | null>(null);
  const [selectedPrivateChatParticipantId, setSelectedPrivateChatParticipantId] = useState<string | null>(null);
  const [privateUnreadCounts, setPrivateUnreadCounts] = useState<Record<string, number>>({});
  const [manualFeedbackDirection, setManualFeedbackDirection] = useState<DirectionFeedbackSignal | null>(null);
  const recoveringSessionRef = useRef(false);
  const seenChatMessageCountRef = useRef(0);
  const seenPrivateMessageIdsRef = useRef(new Set<string>());
  const manualFeedbackTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const lastParticipantRecoveryErrorRef = useRef("");
  const lastLiveKitRecoveryErrorRef = useRef("");
  const pageLeaveSentRef = useRef(false);
  const [speakerClock, setSpeakerClock] = useState(() => Date.now());
  const handleForcedDisconnect = useCallback(
    (message: string) => {
      clearStoredSession();
      clearClientSessionId();
      setSession(null);
      onLeaveComplete(message);
    },
    [onLeaveComplete]
  );
  const roomSocket = useRoomSocket(session, handleForcedDisconnect);
  const liveKitRoom = useLiveKitRoom(session);
  const keyboardControlConfig = session?.keyboardControl ?? FALLBACK_KEYBOARD_CONTROL_CONFIG;
  const keyboardControl = useKeyboardDirectionControl({
    role: roomSocket.role ?? session?.role ?? null,
    robotOnline: roomSocket.robotOnline,
    connectionState: roomSocket.connectionState,
    config: keyboardControlConfig,
    status: roomSocket.keyboardStatus,
    onStart: roomSocket.sendKeyboardControlStart,
    onKeepalive: roomSocket.sendKeyboardControlKeepalive,
    onStop: roomSocket.sendKeyboardControlStop
  });

  const flashManualFeedback = useCallback((direction: DirectionFeedbackSignal) => {
    setManualFeedbackDirection(direction);
    if (manualFeedbackTimerRef.current) {
      window.clearTimeout(manualFeedbackTimerRef.current);
    }
    manualFeedbackTimerRef.current = window.setTimeout(() => {
      setManualFeedbackDirection(null);
      manualFeedbackTimerRef.current = null;
    }, 260);
  }, []);

  const handleManualControl = useCallback(
    (command: RobotCommand, parameters: ControlParameters = {}) => {
      roomSocket.sendControl(command, parameters);
      flashManualFeedback(getManualFeedbackDirection(command, parameters));
    },
    [flashManualFeedback, roomSocket]
  );

  useEffect(() => {
    return () => {
      if (manualFeedbackTimerRef.current) {
        window.clearTimeout(manualFeedbackTimerRef.current);
      }
    };
  }, []);

  const handleToggleLocalAudioMute = useCallback((participantId: string) => {
    setLocallyMutedAudio((current) => ({
      ...current,
      [participantId]: !current[participantId]
    }));
  }, []);

  const handleSelectPrivateChatParticipant = useCallback((participantId: string) => {
    setSelectedPrivateChatParticipantId(participantId);
    setPrivateUnreadCounts((current) => ({
      ...current,
      [participantId]: 0
    }));
  }, []);

  const recoverSession = useCallback(
    async (successMessage: string) => {
      if (!session || recoveringSessionRef.current) {
        return;
      }

      recoveringSessionRef.current = true;
      const clientSessionId = session.clientSessionId ?? getOrCreateClientSessionId();
      try {
        const response = await joinRoom({
          roomName: session.roomName,
          participantName: session.participantName,
          requestedRole: session.role,
          previousParticipantId: session.participantId,
          clientSessionId
        });
        setSession(response);
        saveStoredSession(response);
        setNotice(response.reusedParticipant ? successMessage : "Session recreated");
      } catch (error) {
        clearStoredSession();
        clearClientSessionId();
        setSession(null);
        onLeaveComplete(error instanceof Error ? error.message : "Session restore failed; please join again");
      } finally {
        recoveringSessionRef.current = false;
      }
    },
    [onLeaveComplete, session]
  );

  async function handleRequestControl() {
    if (!session) {
      return;
    }

    setNotice("");
    setActionPending(true);
    try {
      const response = await requestControl(session.roomName, session.participantId);
      const nextSession = {
        ...session,
        role: (response.role ?? "viewer") as WebRole,
        mediaPermissions: response.mediaPermissions ?? session.mediaPermissions,
        robotOnline: response.robotOnline ?? session.robotOnline,
        currentControllerId: response.controlRequests
          ? response.controlRequests.currentControllerId
          : response.currentControllerId ?? session.currentControllerId,
        currentControllerName: response.controlRequests
          ? response.controlRequests.currentControllerName
          : response.currentControllerName ?? session.currentControllerName,
        controlRequests: response.controlRequests ?? session.controlRequests
      };
      setSession(nextSession);
      saveStoredSession(nextSession);
      setNotice(response.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Control request failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleReleaseControl() {
    if (!session) {
      return;
    }

    setNotice("");
    setActionPending(true);
    try {
      const response = await releaseControl(session.roomName, session.participantId);
      const nextSession: JoinRoomResponse = {
        ...session,
        role: "viewer",
        mediaPermissions: response.mediaPermissions ?? session.mediaPermissions,
        robotOnline: response.robotOnline ?? session.robotOnline,
        currentControllerId: response.controlRequests
          ? response.controlRequests.currentControllerId
          : response.currentControllerId ?? session.currentControllerId,
        currentControllerName: response.controlRequests
          ? response.controlRequests.currentControllerName
          : response.currentControllerName ?? session.currentControllerName,
        controlRequests: response.controlRequests ?? session.controlRequests
      };
      setSession(nextSession);
      saveStoredSession(nextSession);
      setNotice(response.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Control release failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleTransferControl(targetParticipantId: string) {
    if (!session) {
      return;
    }

    setNotice("");
    setActionPending(true);
    try {
      const response = await transferControl(session.roomName, session.participantId, targetParticipantId);
      setNotice(response.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Control transfer failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleLeaveRoom() {
    if (!session) {
      return;
    }

    setNotice("");
    setActionPending(true);
    let leaveError = "";
    pageLeaveSentRef.current = true;
    try {
      if (session.clientSessionId) {
        await leaveRoom(session.roomName, session.participantId, session.clientSessionId);
      }
    } catch (error) {
      leaveError = error instanceof Error ? error.message : "Leave room failed";
    } finally {
      clearStoredSession();
      clearClientSessionId();
      setSession(null);
      onLeaveComplete(leaveError ? `Left locally; ${leaveError}` : "");
      setActionPending(false);
    }
  }

  useEffect(() => {
    if (!session || !roomSocket.role || roomSocket.role === session.role) {
      return;
    }

    const nextSession = { ...session, role: roomSocket.role };
    setSession(nextSession);
    saveStoredSession(nextSession);
  }, [roomSocket.role, session]);

  useEffect(() => {
    setLocallyMutedAudio({});
    setSelectedStageParticipantId(null);
    setSelectedPrivateChatParticipantId(null);
    setPrivateUnreadCounts({});
    setChatUnreadCount(0);
    setActiveFloatingPanel(null);
    seenChatMessageCountRef.current = 0;
    seenPrivateMessageIdsRef.current.clear();
    pageLeaveSentRef.current = false;
  }, [session?.participantId]);

  useEffect(() => {
    if (!session?.clientSessionId) {
      return;
    }

    const roomName = session.roomName;
    const participantId = session.participantId;
    const clientSessionId = session.clientSessionId;
    const leaveOnPageExit = () => {
      if (pageLeaveSentRef.current) {
        return;
      }

      pageLeaveSentRef.current = true;
      sendLeaveRoomBeacon(roomName, participantId, clientSessionId);
      clearStoredSession();
      clearClientSessionId();
      setActiveFloatingPanel(null);
      setSession(null);
    };

    window.addEventListener("pagehide", leaveOnPageExit);
    window.addEventListener("beforeunload", leaveOnPageExit);
    return () => {
      window.removeEventListener("pagehide", leaveOnPageExit);
      window.removeEventListener("beforeunload", leaveOnPageExit);
    };
  }, [session?.clientSessionId, session?.participantId, session?.roomName]);

  useEffect(() => {
    const nextRole = roomSocket.role ?? session?.role ?? null;
    if (nextRole !== "controller" && activeFloatingPanel === "control") {
      setActiveFloatingPanel(null);
    }
  }, [activeFloatingPanel, roomSocket.role, session?.role]);

  useEffect(() => {
    const isSpeaker =
      Boolean(session) &&
      roomSocket.speaker.currentSpeakerId === session?.participantId &&
      Boolean(roomSocket.speaker.currentSpeakerStartedAt);
    if (!isSpeaker) {
      return;
    }

    setSpeakerClock(Date.now());
    const intervalId = window.setInterval(() => setSpeakerClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [roomSocket.speaker.currentSpeakerId, roomSocket.speaker.currentSpeakerStartedAt, session?.participantId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const previousCount = seenChatMessageCountRef.current;
    const newMessages = roomSocket.chatMessages.slice(previousCount);
    seenChatMessageCountRef.current = roomSocket.chatMessages.length;

    if (activeFloatingPanel === "chat") {
      setChatUnreadCount(0);
      return;
    }

    const unreadMessages = newMessages.filter((message) => message.senderId !== session.participantId).length;
    if (unreadMessages > 0) {
      setChatUnreadCount((current) => current + unreadMessages);
    }
  }, [activeFloatingPanel, roomSocket.chatMessages, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    for (const message of roomSocket.privateMessages) {
      if (seenPrivateMessageIdsRef.current.has(message.messageId)) {
        continue;
      }

      seenPrivateMessageIdsRef.current.add(message.messageId);
      if (message.senderId === session.participantId) {
        continue;
      }

      const peerId = message.senderId;
      if (peerId === selectedPrivateChatParticipantId) {
        continue;
      }

      setPrivateUnreadCounts((current) => ({
        ...current,
        [peerId]: (current[peerId] ?? 0) + 1
      }));
    }
  }, [roomSocket.privateMessages, selectedPrivateChatParticipantId, session]);

  useEffect(() => {
    if (
      selectedPrivateChatParticipantId &&
      !roomSocket.participants.some(
        (participant) =>
          participant.id === selectedPrivateChatParticipantId &&
          (participant.role === "controller" || participant.role === "viewer") &&
          participant.connected
      )
    ) {
      setSelectedPrivateChatParticipantId(null);
    }
  }, [roomSocket.participants, selectedPrivateChatParticipantId]);

  useEffect(() => {
    if (!roomSocket.lastError.startsWith("PARTICIPANT_NOT_FOUND")) {
      lastParticipantRecoveryErrorRef.current = "";
      return;
    }

    if (lastParticipantRecoveryErrorRef.current === roomSocket.lastError) {
      return;
    }

    lastParticipantRecoveryErrorRef.current = roomSocket.lastError;
    void recoverSession("Session restored");
  }, [recoverSession, roomSocket.lastError]);

  useEffect(() => {
    if (!liveKitRoom.lastError || !shouldRefreshLiveKitToken(liveKitRoom.lastError)) {
      lastLiveKitRecoveryErrorRef.current = "";
      return;
    }

    if (lastLiveKitRecoveryErrorRef.current === liveKitRoom.lastError) {
      return;
    }

    lastLiveKitRecoveryErrorRef.current = liveKitRoom.lastError;
    void recoverSession("LiveKit token refreshed");
  }, [liveKitRoom.lastError, recoverSession]);

  const activeNotice = roomSocket.lastError || liveKitRoom.lastError || notice;
  const robotRoomParticipant = roomSocket.participants.find((participant) => participant.role === "robot");
  const robotParticipantId =
    liveKitRoom.robotVideoTrack?.participantIdentity ??
    liveKitRoom.robotAudioTrack?.participantIdentity ??
    robotRoomParticipant?.id;
  const privateChatErrors = roomSocket.privateChatErrors;
  const selectedStageId = selectedStageParticipantId ?? ROBOT_STAGE_PARTICIPANT_ID;
  const robotStageSelected =
    selectedStageId === ROBOT_STAGE_PARTICIPANT_ID || (robotParticipantId !== undefined && selectedStageId === robotParticipantId);
  const selectedMediaParticipant = robotStageSelected
    ? null
    : liveKitRoom.remoteParticipants.find((participant) => participant.identity === selectedStageId);
  const selectedRoomParticipant = robotStageSelected
    ? robotRoomParticipant
    : roomSocket.participants.find((participant) => participant.id === selectedStageId);
  const selectedRemoteVideoTrack = selectedMediaParticipant?.videoTrack
    ? {
        participantIdentity: selectedMediaParticipant.identity,
        participantName: selectedMediaParticipant.name ?? selectedMediaParticipant.identity,
        track: selectedMediaParticipant.videoTrack,
        hasAudioTrack: selectedMediaParticipant.hasAudioTrack,
        isSpeaking: selectedMediaParticipant.isSpeaking,
        audioLevel: selectedMediaParticipant.audioLevel
      }
    : null;
  const selectedStageVideoTrack = robotStageSelected ? liveKitRoom.robotVideoTrack : selectedRemoteVideoTrack;
  const selectedStageRole: Role | "unknown" = robotStageSelected
    ? "robot"
    : (selectedRoomParticipant?.role ??
      (selectedMediaParticipant?.role !== "unknown" && selectedMediaParticipant?.role ? selectedMediaParticipant.role : "unknown"));
  const selectedStageParticipantName = robotStageSelected
    ? (liveKitRoom.robotVideoTrack?.participantName ?? liveKitRoom.robotAudioTrack?.participantName ?? robotRoomParticipant?.name ?? "Robot")
    : (selectedRoomParticipant?.name ?? selectedMediaParticipant?.name ?? selectedStageId);
  const selectedStageParticipantIdentity = robotStageSelected ? (robotParticipantId ?? ROBOT_STAGE_PARTICIPANT_ID) : selectedStageId;

  useEffect(() => {
    if (
      selectedStageParticipantId &&
      selectedStageParticipantId !== ROBOT_STAGE_PARTICIPANT_ID &&
      selectedStageParticipantId === robotParticipantId
    ) {
      setSelectedStageParticipantId(ROBOT_STAGE_PARTICIPANT_ID);
    }
  }, [robotParticipantId, selectedStageParticipantId]);

  if (!session) {
    return null;
  }

  const effectiveRole = roomSocket.role ?? session.role;
  const isController = effectiveRole === "controller";
  const isActualSpeaker =
    roomSocket.speaker.currentSpeakerId === session.participantId && Boolean(roomSocket.speaker.currentSpeakerStartedAt);
  const controlRequestQueue = roomSocket.controlRequests.queue;
  const hasCurrentController = Boolean(roomSocket.controlRequests.currentControllerId);
  const controlRequestPending =
    hasCurrentController && controlRequestQueue.some((request) => request.id === session.participantId);
  const controlActionsDisabled = roomSocket.connectionState !== "connected";
  const privateUnreadTotal = Object.values(privateUnreadCounts).reduce((total, count) => total + count, 0);
  const chatNotificationCount = activeFloatingPanel === "chat" ? 0 : chatUnreadCount + privateUnreadTotal;
  const controlNotificationCount = isController ? controlRequestQueue.length : 0;
  const manualControlAvailable =
    isController && roomSocket.robotOnline && roomSocket.connectionState === "connected";
  const feedbackPadAvailable = manualControlAvailable && (keyboardControl.backendEnabled || manualFeedbackDirection !== null);
  const speakerPanel =
    isActualSpeaker && roomSocket.speaker.currentSpeakerStartedAt
      ? {
          speakerStartedAt: roomSocket.speaker.currentSpeakerStartedAt,
          queue: roomSocket.speaker.queue,
          now: speakerClock
        }
      : null;

  return (
    <main className="app-shell">
      <StatusBar
        roomName={session.roomName}
        participantName={session.participantName}
        role={effectiveRole}
        isSpeaker={isActualSpeaker}
        webSocketState={roomSocket.connectionState}
        robotOnline={roomSocket.robotOnline}
        currentControllerName={roomSocket.currentControllerName}
        controlRequestPending={controlRequestPending}
        controlActionsDisabled={controlActionsDisabled}
        onRequestControl={handleRequestControl}
        onReleaseControl={handleReleaseControl}
        onLeaveRoom={handleLeaveRoom}
        actionPending={actionPending}
      />
      <MobileRoomActions
        role={effectiveRole}
        robotOnline={roomSocket.robotOnline}
        webSocketState={roomSocket.connectionState}
        controlRequestPending={controlRequestPending}
        controlActionsDisabled={controlActionsDisabled}
        actionPending={actionPending}
        onRequestControl={handleRequestControl}
        onReleaseControl={handleReleaseControl}
        onLeaveRoom={handleLeaveRoom}
      />

      {activeNotice ? <p className="notice notice-toast">{activeNotice}</p> : null}

      <div className="workspace-grid">
        <div className="robot-area">
          <div className="main-stage">
            <RobotVideo
              liveKitState={liveKitRoom.connectionState}
              robotOnline={roomSocket.robotOnline}
              stageVideoTrack={selectedStageVideoTrack}
              stageParticipantRole={selectedStageRole}
              stageParticipantName={selectedStageParticipantName}
              stageParticipantIdentity={selectedStageParticipantIdentity}
              robotActionCount={roomSocket.robotEvents.length}
              keyboardEnabled={isController && (keyboardControl.enabled || manualFeedbackDirection !== null)}
              keyboardAvailable={feedbackPadAvailable}
              keyboardDirection={keyboardControl.activeDirection ?? manualFeedbackDirection}
              keyboardStateText={keyboardControl.keyboardStateText}
              showKeyboardFeedback={isController}
              speakerPanel={speakerPanel}
            />
            <MediaControls
              mediaPermissions={session.mediaPermissions}
              tokenMode={session.tokenMode}
              liveKitState={liveKitRoom.connectionState}
              localAudioState={liveKitRoom.localAudioState}
              localVideoState={liveKitRoom.localVideoState}
              onToggleMicrophone={liveKitRoom.toggleMicrophone}
              onToggleCamera={liveKitRoom.toggleCamera}
            />
            <div className="floating-dock" aria-label="Room tools">
              <button
                type="button"
                className={dockButtonClassName(activeFloatingPanel === "chat", chatNotificationCount > 0)}
                onClick={() => setActiveFloatingPanel((current) => (current === "chat" ? null : "chat"))}
              >
                Chat
                {chatNotificationCount > 0 ? (
                  <span className="dock-badge">{formatNotificationCount(chatNotificationCount)}</span>
                ) : null}
              </button>
              {isController ? (
                <button
                  type="button"
                  className={dockButtonClassName(activeFloatingPanel === "control", controlNotificationCount > 0)}
                  onClick={() => setActiveFloatingPanel((current) => (current === "control" ? null : "control"))}
                >
                  Control
                  {controlNotificationCount > 0 ? (
                    <span className="dock-badge">{formatNotificationCount(controlNotificationCount)}</span>
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="participants-sidebar" aria-label="Remote participants">
          <ParticipantsPanel
            participants={liveKitRoom.remoteParticipants}
            roomParticipants={roomSocket.participants}
            currentParticipantId={session.participantId}
            currentParticipantName={session.participantName}
            currentRole={effectiveRole}
            localAudioState={liveKitRoom.localAudioState}
            localSpeaking={liveKitRoom.localSpeaking}
            localVideoState={liveKitRoom.localVideoState}
            localVideoTrack={liveKitRoom.localVideoTrack}
            selectedStageParticipantId={selectedStageId}
            robotStageParticipantId={ROBOT_STAGE_PARTICIPANT_ID}
            robotOnline={roomSocket.robotOnline}
            robotVideoTrack={liveKitRoom.robotVideoTrack}
            robotAudioTrack={liveKitRoom.robotAudioTrack}
            canPlaybackAudio={liveKitRoom.canPlaybackAudio}
            speaker={roomSocket.speaker}
            speakerActionsDisabled={roomSocket.connectionState !== "connected"}
            locallyMutedAudio={locallyMutedAudio}
            privateUnreadCounts={privateUnreadCounts}
            onEnableAudio={liveKitRoom.enableAudioPlayback}
            onRequestSpeaker={roomSocket.sendSpeakerRequest}
            onEndSpeaker={roomSocket.sendSpeakerEnd}
            onSelectStageParticipant={setSelectedStageParticipantId}
            onToggleLocalAudioMute={handleToggleLocalAudioMute}
            onStartPrivateChat={handleSelectPrivateChatParticipant}
          />
        </aside>
      </div>

      {activeFloatingPanel === "chat" ? (
        <aside className="floating-panel-shell floating-panel-chat" role="dialog" aria-label="Chat panel">
          <div className="floating-panel-top">
            <h2>Chat</h2>
            <button type="button" className="panel-close-button" onClick={() => setActiveFloatingPanel(null)}>
              Close
            </button>
          </div>
          <div className="floating-panel-body chat-panel-stack">
          <ChatPanel
            messages={roomSocket.chatMessages}
            onSend={roomSocket.sendChat}
            disabled={roomSocket.connectionState !== "connected"}
          />
          <PrivateChatPanel
            currentParticipantId={session.participantId}
            currentRole={effectiveRole}
            participants={roomSocket.participants}
            selectedParticipantId={selectedPrivateChatParticipantId}
            messages={roomSocket.privateMessages}
            errors={privateChatErrors}
            unreadCounts={privateUnreadCounts}
            disabled={roomSocket.connectionState !== "connected"}
            onSelectParticipant={handleSelectPrivateChatParticipant}
            onSend={roomSocket.sendPrivateChat}
          />
          </div>
        </aside>
      ) : null}

      {activeFloatingPanel === "control" && isController ? (
        <aside className="floating-panel-shell floating-panel-control" role="dialog" aria-label="Robot control panel">
          <div className="floating-panel-top">
            <h2>Control</h2>
            <button type="button" className="panel-close-button" onClick={() => setActiveFloatingPanel(null)}>
              Close
            </button>
          </div>
          <div className="floating-panel-body">
          <ControlPanel
            role={effectiveRole}
            participantId={session.participantId}
            controlRequestQueue={controlRequestQueue}
            robotOnline={roomSocket.robotOnline}
            connectionState={roomSocket.connectionState}
            actionPending={actionPending}
            keyboardControlConfig={keyboardControlConfig}
            keyboardControl={keyboardControl}
            onControl={handleManualControl}
            onTransferControl={handleTransferControl}
          />
          </div>
        </aside>
      ) : null}
    </main>
  );
}
