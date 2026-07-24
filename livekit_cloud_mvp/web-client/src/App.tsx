import { useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, leaveRoom, releaseControl, requestControl, transferControl } from "./api";
import { AdminConsole } from "./components/AdminConsole";
import { ChatPanel } from "./components/ChatPanel";
import { ControlPanel } from "./components/ControlPanel";
import { JoinRoomForm } from "./components/JoinRoomForm";
import { MediaControls } from "./components/MediaControls";
import { ParticipantsPanel } from "./components/ParticipantsPanel";
import { RobotVideo } from "./components/RobotVideo";
import { StatusBar } from "./components/StatusBar";
import { useLiveKitRoom } from "./useLiveKitRoom";
import { useRoomSocket } from "./useRoomSocket";
import type { JoinRoomRequest, JoinRoomResponse, KeyboardControlConfig, WebRole } from "./types";

const FALLBACK_KEYBOARD_CONTROL_CONFIG: KeyboardControlConfig = {
  enabled: false,
  continuous1001Enabled: false,
  mode: "1001",
  sendIntervalMs: 300,
  deadmanTimeoutMs: 900,
  maxSessionMs: 10000,
  maxLinearSpeed: 120,
  maxAngularSpeed: 20,
  defaultLinearSpeed: 80,
  defaultAngularSpeed: 15,
  requireFocus: true
};

const SESSION_STORAGE_KEY = "livekit-cloud-mvp.room-session";
const CLIENT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.client-session-id";

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

function getOrCreateClientSessionId(): string {
  const existing = sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
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
  const recoveringSessionRef = useRef(false);
  const roomSocket = useRoomSocket(session);
  const liveKitRoom = useLiveKitRoom(session);

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
        mediaPermissions: response.mediaPermissions ?? session.mediaPermissions
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
        mediaPermissions: response.mediaPermissions ?? session.mediaPermissions
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

  if (!session) {
    return <JoinRoomForm onJoin={handleJoin} />;
  }

  const effectiveRole = roomSocket.role ?? session.role;
  const activeNotice = roomSocket.lastError || liveKitRoom.lastError || notice;

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
            robotVideoTrack={liveKitRoom.robotVideoTrack}
            robotEvents={roomSocket.robotEvents}
          />
        </div>

        <aside className="participants-sidebar" aria-label="Remote participants">
          <ParticipantsPanel
            participants={liveKitRoom.remoteParticipants}
            canPlaybackAudio={liveKitRoom.canPlaybackAudio}
            onEnableAudio={liveKitRoom.enableAudioPlayback}
          />
        </aside>

        <div className="chat-area">
          <ChatPanel
            messages={roomSocket.chatMessages}
            onSend={roomSocket.sendChat}
            disabled={roomSocket.connectionState !== "connected"}
          />
        </div>

        <div className="control-area">
          <ControlPanel
            role={effectiveRole}
            participantId={session.participantId}
            participants={roomSocket.participants}
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
