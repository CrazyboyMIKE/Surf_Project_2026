import { useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, leaveRoom, releaseControl, requestControl, transferControl } from "./api";
import { AdminConsole } from "./components/AdminConsole";
import { ChatPanel } from "./components/ChatPanel";
import { ControlPanel } from "./components/ControlPanel";
import { JoinRoomForm } from "./components/JoinRoomForm";
import { MediaControls } from "./components/MediaControls";
import { ParticipantsPanel } from "./components/ParticipantsPanel";
import { PrivateChatPanel } from "./components/PrivateChatPanel";
import { RobotVideo } from "./components/RobotVideo";
import { StatusBar } from "./components/StatusBar";
import { useLiveKitRoom } from "./useLiveKitRoom";
import { useRoomSocket } from "./useRoomSocket";
import type { JoinRoomRequest, JoinRoomResponse, KeyboardControlConfig, Role, WebRole } from "./types";

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

const SESSION_STORAGE_KEY = "livekit-cloud-mvp.room-session";
const CLIENT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.client-session-id";
const ROBOT_STAGE_PARTICIPANT_ID = "__robot_stage__";

function readStoredSession(): JoinRoomResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<JoinRoomResponse>;
    if (
      typeof parsed.roomName !== "string" ||
      typeof parsed.participantName !== "string" ||
      typeof parsed.participantId !== "string" ||
      (parsed.role !== "controller" && parsed.role !== "viewer") ||
      typeof parsed.liveKitUrl !== "string" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }

    return parsed as JoinRoomResponse;
  } catch {
    return null;
  }
}

function saveStoredSession(session: JoinRoomResponse): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  if (session.clientSessionId) {
    sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, session.clientSessionId);
  }
}

function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function clearClientSessionId(): void {
  sessionStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
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

export function App() {
  if (window.location.pathname === "/admin") {
    return <AdminConsole />;
  }

  return <RoomApp />;
}

function RoomApp() {
  const [session, setSession] = useState<JoinRoomResponse | null>(() => readStoredSession());
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [locallyMutedAudio, setLocallyMutedAudio] = useState<Record<string, boolean>>({});
  const [selectedStageParticipantId, setSelectedStageParticipantId] = useState<string | null>(null);
  const [selectedPrivateChatParticipantId, setSelectedPrivateChatParticipantId] = useState<string | null>(null);
  const [privateUnreadCounts, setPrivateUnreadCounts] = useState<Record<string, number>>({});
  const recoveringSessionRef = useRef(false);
  const seenPrivateMessageIdsRef = useRef(new Set<string>());
  const handleForcedDisconnect = useCallback((message: string) => {
    clearStoredSession();
    setSession(null);
    setNotice(message);
  }, []);
  const roomSocket = useRoomSocket(session, handleForcedDisconnect);
  const liveKitRoom = useLiveKitRoom(session);

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
        setSession(null);
        setNotice(error instanceof Error ? error.message : "Session restore failed; please join again");
      } finally {
        recoveringSessionRef.current = false;
      }
    },
    [session]
  );

  async function handleJoin(payload: JoinRoomRequest) {
    const response = await joinRoom({
      ...payload,
      clientSessionId: getOrCreateClientSessionId()
    });
    setSession(response);
    saveStoredSession(response);
    setNotice(response.role === "controller" ? "Control granted" : "Joined as viewer");
  }

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
        liveKitUrl: response.liveKitUrl ?? session.liveKitUrl,
        token: response.token ?? session.token,
        tokenMode: response.tokenMode ?? session.tokenMode,
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
        liveKitUrl: response.liveKitUrl ?? session.liveKitUrl,
        token: response.token ?? session.token,
        tokenMode: response.tokenMode ?? session.tokenMode,
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
    try {
      if (session.clientSessionId) {
        await leaveRoom(session.roomName, session.participantId, session.clientSessionId);
      }
      clearStoredSession();
      clearClientSessionId();
      setSession(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Leave room failed");
    } finally {
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
    seenPrivateMessageIdsRef.current.clear();
  }, [session?.participantId]);

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
      return;
    }

    void recoverSession("Session restored");
  }, [recoverSession, roomSocket.lastError]);

  useEffect(() => {
    if (!liveKitRoom.lastError || !shouldRefreshLiveKitToken(liveKitRoom.lastError)) {
      return;
    }

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
    : selectedMediaParticipant?.role !== "unknown" && selectedMediaParticipant?.role
      ? selectedMediaParticipant.role
      : (selectedRoomParticipant?.role ?? "unknown");
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
    return <JoinRoomForm onJoin={handleJoin} notice={notice} />;
  }

  const effectiveRole = roomSocket.role ?? session.role;
  const controlRequestQueue = roomSocket.controlRequests.queue;
  const hasCurrentController = Boolean(roomSocket.controlRequests.currentControllerId);
  const controlRequestPending =
    hasCurrentController && controlRequestQueue.some((request) => request.id === session.participantId);
  const controlActionsDisabled = roomSocket.connectionState !== "connected";

  return (
    <main className="app-shell">
      <StatusBar
        roomName={session.roomName}
        participantName={session.participantName}
        role={effectiveRole}
        backendState="connected"
        webSocketState={roomSocket.connectionState}
        liveKitState={liveKitRoom.connectionState}
        robotOnline={roomSocket.robotOnline}
        currentControllerName={roomSocket.currentControllerName}
        participants={roomSocket.participants}
        controlRequestCount={controlRequestQueue.length}
        controlRequestPending={controlRequestPending}
        controlActionsDisabled={controlActionsDisabled}
        onRequestControl={handleRequestControl}
        onReleaseControl={handleReleaseControl}
        onLeaveRoom={handleLeaveRoom}
        actionPending={actionPending}
      />

      {activeNotice ? <p className="notice">{activeNotice}</p> : null}

      <div className="workspace-grid">
        <div className="robot-area">
          <RobotVideo
            liveKitState={liveKitRoom.connectionState}
            robotOnline={roomSocket.robotOnline}
            stageVideoTrack={selectedStageVideoTrack}
            stageParticipantRole={selectedStageRole}
            stageParticipantName={selectedStageParticipantName}
            stageParticipantIdentity={selectedStageParticipantIdentity}
            robotEvents={roomSocket.robotEvents}
          />
        </div>

        <aside className="participants-sidebar" aria-label="Remote participants">
          <ParticipantsPanel
            participants={liveKitRoom.remoteParticipants}
            roomParticipants={roomSocket.participants}
            currentParticipantId={session.participantId}
            currentRole={effectiveRole}
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

        <div className="chat-area">
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

        <div className="control-area">
          <ControlPanel
            role={effectiveRole}
            participantId={session.participantId}
            controlRequestQueue={controlRequestQueue}
            robotOnline={roomSocket.robotOnline}
            connectionState={roomSocket.connectionState}
            actionPending={actionPending}
            keyboardControlConfig={session.keyboardControl ?? FALLBACK_KEYBOARD_CONTROL_CONFIG}
            keyboardStatus={roomSocket.keyboardStatus}
            lastKeyboardResult={roomSocket.lastKeyboardResult}
            onControl={roomSocket.sendControl}
            onTransferControl={handleTransferControl}
            onKeyboardStart={roomSocket.sendKeyboardControlStart}
            onKeyboardKeepalive={roomSocket.sendKeyboardControlKeepalive}
            onKeyboardStop={roomSocket.sendKeyboardControlStop}
          />
        </div>

        <div className="media-area">
          <MediaControls
            mediaPermissions={session.mediaPermissions}
            tokenMode={session.tokenMode}
            liveKitState={liveKitRoom.connectionState}
            localAudioState={liveKitRoom.localAudioState}
            localSpeaking={liveKitRoom.localSpeaking}
            localVideoState={liveKitRoom.localVideoState}
            localVideoTrack={liveKitRoom.localVideoTrack}
            onToggleMicrophone={liveKitRoom.toggleMicrophone}
            onToggleCamera={liveKitRoom.toggleCamera}
          />
        </div>
      </div>
    </main>
  );
}
