import { useState } from "react";
import { joinRoom, releaseControl, requestControl, transferControl } from "./api";
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

export function App() {
  if (window.location.pathname === "/admin") {
    return <AdminConsole />;
  }

  return <RoomApp />;
}

function RoomApp() {
  const [session, setSession] = useState<JoinRoomResponse | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState("");
  const roomSocket = useRoomSocket(session);
  const liveKitRoom = useLiveKitRoom(session);

  async function handleJoin(payload: JoinRoomRequest) {
    const response = await joinRoom(payload);
    setSession(response);
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
      setSession({
        ...session,
        role: (response.role ?? "viewer") as WebRole,
        liveKitUrl: response.liveKitUrl ?? session.liveKitUrl,
        token: response.token ?? session.token,
        tokenMode: response.tokenMode ?? session.tokenMode,
        mediaPermissions: response.mediaPermissions ?? session.mediaPermissions
      });
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
      setSession({
        ...session,
        role: "viewer",
        liveKitUrl: response.liveKitUrl ?? session.liveKitUrl,
        token: response.token ?? session.token,
        tokenMode: response.tokenMode ?? session.tokenMode,
        mediaPermissions: response.mediaPermissions ?? session.mediaPermissions
      });
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
