import React, { FormEvent, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createLocalVideoTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant
} from "livekit-client";
import "./styles.css";

type Role = "robot" | "controller" | "viewer";
type RobotCommand = "1002" | "1003" | "1000" | "1001";
type KeyboardDirection =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "forward_left"
  | "forward_right"
  | "backward_left"
  | "backward_right";

type JoinRobotResponse = {
  robotId: string;
  roomName: string;
  participantId: string;
  role: "robot";
  online: boolean;
  liveKitUrl: string;
  token: string;
  tokenMode: "mock" | "livekit";
};

type ParticipantPresence = {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
};

type RoleUpdateMessage = {
  type: "role_update";
  currentControllerId?: string;
  currentControllerName?: string;
  participants: ParticipantPresence[];
};

type KeyboardControlStatusMessage = {
  type: "keyboard_control_status";
  roomName: string;
  active: boolean;
  controllerId?: string;
  controllerName?: string;
  direction?: KeyboardDirection;
  linearSpeed?: number;
  angularSpeed?: number;
  stopReason?: string;
  updatedAt: number;
};

type RobotControlMessage = {
  type: "robot_control";
  command: RobotCommand;
  parameters?: {
    direction?: KeyboardDirection;
    stopReason?: string;
    lv?: number;
    av?: number;
  };
  from: string;
  timestamp: number;
};

type RoomSession = JoinRobotResponse & {
  robotName: string;
};

type RemoteVideoInfo = {
  identity: string;
  name: string;
  role: "controller" | "viewer";
  videoTrack: RemoteVideoTrack | null;
  audioTrack: RemoteAudioTrack | null;
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveWebSocketUrl(apiBaseUrl: string): string {
  const configuredWsUrl = import.meta.env.VITE_WS_BASE_URL ?? import.meta.env.VITE_WS_URL;
  const baseUrl = stripTrailingSlash(configuredWsUrl ?? apiBaseUrl.replace(/^http/, "ws"));
  return baseUrl.endsWith("/ws") ? baseUrl : `${baseUrl}/ws`;
}

function resolveApiBaseUrl(): string {
  const configuredApiUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredApiUrl?.trim()) {
    return stripTrailingSlash(configuredApiUrl.trim());
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  return `${protocol}://${window.location.hostname || "localhost"}:3001`;
}

const API_BASE_URL = resolveApiBaseUrl();
const WS_URL = resolveWebSocketUrl(API_BASE_URL);

function validateRuntimeConfig() {
  if (!/^https?:\/\//.test(API_BASE_URL)) {
    throw new Error("API address configuration error: VITE_API_BASE_URL must start with http:// or https://.");
  }

  if (!/^wss?:\/\//.test(WS_URL)) {
    throw new Error("WebSocket address configuration error: VITE_WS_BASE_URL must start with ws:// or wss://.");
  }
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function describeCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError" || error.name === "PermissionDeniedError") {
      return "Camera permission denied. Allow camera access in the browser site settings, then retry.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera was detected. Connect a camera or close broken virtual camera devices, then retry.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Camera is busy or unavailable. Close other camera apps and retry.";
    }
  }

  return `Camera failed to start: ${describeUnknownError(error)}`;
}

function describeLiveKitPublishError(error: unknown): string {
  return `LiveKit publish failed. Check robot token canPublish permission, LiveKit connection state, camera track, and server logs. Details: ${describeUnknownError(
    error
  )}`;
}

function isRoleUpdateMessage(message: unknown): message is RoleUpdateMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "role_update" &&
    "participants" in message &&
    Array.isArray(message.participants)
  );
}

function isKeyboardControlStatusMessage(message: unknown): message is KeyboardControlStatusMessage {
  return typeof message === "object" && message !== null && "type" in message && message.type === "keyboard_control_status";
}

function isRobotControlMessage(message: unknown): message is RobotControlMessage {
  return typeof message === "object" && message !== null && "type" in message && message.type === "robot_control";
}

async function joinRobot(roomName: string, robotId: string): Promise<JoinRobotResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/robots/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ roomName, robotId })
    });
  } catch (error) {
    throw new Error(
      `Backend token request failed. Check VITE_API_BASE_URL, backend /health, HTTPS certificate, and CORS. Details: ${describeUnknownError(
        error
      )}`
    );
  }

  let data: JoinRobotResponse & { message?: string };
  try {
    data = (await response.json()) as JoinRobotResponse & { message?: string };
  } catch {
    throw new Error(`Backend token request failed: expected JSON from ${API_BASE_URL}/api/robots/join. Check Nginx API proxy.`);
  }
  if (!response.ok) {
    throw new Error(`Backend token request failed: ${data.message ?? `HTTP ${response.status}`}`);
  }

  return data;
}

function parseParticipantRole(participant: RemoteParticipant): Role | undefined {
  if (!participant.metadata) {
    return undefined;
  }

  try {
    const metadata = JSON.parse(participant.metadata) as { role?: unknown };
    return metadata.role === "robot" || metadata.role === "controller" || metadata.role === "viewer" ? metadata.role : undefined;
  } catch {
    return undefined;
  }
}

function looksLikeRobot(participant: RemoteParticipant): boolean {
  return `${participant.identity} ${participant.name ?? ""}`.toLowerCase().includes("robot");
}

function firstRemoteVideoTrack(participant: RemoteParticipant): RemoteVideoTrack | null {
  const publication = Array.from(participant.videoTrackPublications.values()).find((item) => item.track);
  return publication?.track instanceof RemoteVideoTrack ? publication.track : null;
}

function firstRemoteAudioTrack(participant: RemoteParticipant): RemoteAudioTrack | null {
  const publication = Array.from(participant.audioTrackPublications.values()).find((item) => item.track);
  return publication?.track instanceof RemoteAudioTrack ? publication.track : null;
}

function collectRemoteVideos(
  room: Room,
  participantsById: Map<string, ParticipantPresence>,
  ownIdentity: string
): RemoteVideoInfo[] {
  return Array.from(room.remoteParticipants.values()).flatMap((participant) => {
    if (participant.identity === ownIdentity) {
      return [];
    }

    const presence = participantsById.get(participant.identity);
    const role = presence?.role ?? parseParticipantRole(participant) ?? (looksLikeRobot(participant) ? "robot" : "viewer");
    if (role === "robot") {
      return [];
    }

    return [
      {
        identity: participant.identity,
        name: presence?.name ?? participant.name ?? participant.identity,
        role,
        videoTrack: firstRemoteVideoTrack(participant),
        audioTrack: firstRemoteAudioTrack(participant)
      }
    ];
  });
}

function requestElementFullscreen(element: HTMLElement | null): string | null {
  if (!element) {
    return "Video tile is not ready for fullscreen.";
  }

  if (!document.fullscreenEnabled || !element.requestFullscreen) {
    return "Fullscreen is not supported by this browser.";
  }

  void element.requestFullscreen().catch(() => undefined);
  return null;
}

function RemoteVideoTile({
  participant,
  compact = false,
  onFullscreenError
}: {
  participant: RemoteVideoInfo;
  compact?: boolean;
  onFullscreenError: (message: string) => void;
}) {
  const tileRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!participant.videoTrack || !videoElement) {
      return;
    }

    participant.videoTrack.attach(videoElement);
    return () => {
      participant.videoTrack?.detach(videoElement);
    };
  }, [participant.videoTrack]);

  return (
    <article className={compact ? "remote-video-tile compact-video-tile" : "remote-video-tile"} ref={tileRef}>
      {participant.videoTrack ? <video ref={videoRef} autoPlay playsInline /> : <div className="video-empty">Waiting for video</div>}
      <span className="role-badge">{participant.role}</span>
      <span className="name-badge">{participant.name}</span>
      <button
        type="button"
        className="fullscreen-button"
        aria-label={`Fullscreen ${participant.name}`}
        onClick={() => {
          const message = requestElementFullscreen(tileRef.current);
          if (message) {
            onFullscreenError(message);
          }
        }}
      >
        Fullscreen
      </button>
    </article>
  );
}

function LocalPreview({
  track,
  robotName,
  compact = false,
  onFullscreenError
}: {
  track: LocalVideoTrack | null;
  robotName: string;
  compact?: boolean;
  onFullscreenError: (message: string) => void;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [previewWarning, setPreviewWarning] = useState("");

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!track || !videoElement) {
      return;
    }

    setPreviewWarning("");
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    track.attach(videoElement);
    void videoElement.play().catch(() => {
      setPreviewWarning("Preview paused by browser. Tap fullscreen or retry camera.");
    });

    return () => {
      track.detach(videoElement);
    };
  }, [track]);

  return (
    <div className={compact ? "local-preview compact-video-tile" : "local-preview"} ref={tileRef}>
      {track ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="preview-placeholder">Robot camera preview</div>}
      {previewWarning ? <span className="preview-warning">{previewWarning}</span> : null}
      <span className="role-badge">robot</span>
      <span className="name-badge">{robotName}</span>
      <button
        type="button"
        className="fullscreen-button"
        aria-label="Fullscreen robot preview"
        onClick={() => {
          const message = requestElementFullscreen(tileRef.current);
          if (message) {
            onFullscreenError(message);
          }
        }}
      >
        Fullscreen
      </button>
    </div>
  );
}

function ControllerAudioPlayer({ controller }: { controller: RemoteVideoInfo | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioState, setAudioState] = useState("waiting for controller audio");

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !controller?.audioTrack) {
      setAudioState(controller ? "controller microphone off" : "waiting for controller audio");
      return;
    }

    controller.audioTrack.attach(audioElement);
    audioElement.muted = false;
    audioElement.volume = 1;
    setAudioState("controller audio ready");

    void audioElement.play().then(
      () => setAudioState("controller audio playing"),
      () => setAudioState("click enable controller audio")
    );

    return () => {
      controller.audioTrack?.detach(audioElement);
    };
  }, [controller]);

  async function enableAudio() {
    const audioElement = audioRef.current;
    if (!audioElement || !controller?.audioTrack) {
      setAudioState("controller microphone off");
      return;
    }

    try {
      await audioElement.play();
      setAudioState("controller audio playing");
    } catch {
      setAudioState("browser blocked audio playback");
    }
  }

  return (
    <div className="controller-audio-panel">
      <audio ref={audioRef} autoPlay playsInline />
      <span>
        Controller audio <strong>{audioState}</strong>
      </span>
      {controller?.audioTrack && audioState !== "controller audio playing" ? (
        <button type="button" className="audio-button" onClick={enableAudio}>
          Enable controller audio
        </button>
      ) : null}
    </div>
  );
}

function PrimaryControllerStage({
  controller,
  onFullscreenError
}: {
  controller: RemoteVideoInfo | null;
  onFullscreenError: (message: string) => void;
}) {
  const stageRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!controller?.videoTrack || !videoElement) {
      return;
    }

    controller.videoTrack.attach(videoElement);
    return () => {
      controller.videoTrack?.detach(videoElement);
    };
  }, [controller]);

  return (
    <section className="controller-stage" aria-labelledby="controller-stage-title" ref={stageRef}>
      <div className="panel-heading">
        <div>
          <h2 id="controller-stage-title">Controller primary video</h2>
          <p className="subtle">{controller ? `Current controller: ${controller.name}` : "No controller video track is active"}</p>
        </div>
        <button
          type="button"
          className="stage-fullscreen-button"
          onClick={() => {
            const message = requestElementFullscreen(stageRef.current);
            if (message) {
              onFullscreenError(message);
            }
          }}
        >
          Fullscreen
        </button>
      </div>

      <div className="controller-video-frame">
        {controller?.videoTrack ? (
          <video ref={videoRef} autoPlay playsInline />
        ) : (
          <div className="empty-video-state">Waiting for controller video</div>
        )}
        {controller ? (
          <>
            <span className="role-badge">controller</span>
            <span className="name-badge">{controller.name}</span>
          </>
        ) : null}
      </div>

      <ControllerAudioPlayer controller={controller} />
    </section>
  );
}

function EntryView({
  robotName,
  roomName,
  error,
  pending,
  onRobotNameChange,
  onRoomNameChange,
  onEnter
}: {
  robotName: string;
  roomName: string;
  error: string;
  pending: boolean;
  onRobotNameChange: (value: string) => void;
  onRoomNameChange: (value: string) => void;
  onEnter: (mode: "create" | "join") => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onEnter("join");
  }

  return (
    <main className="entry-shell">
      <section className="entry-card">
        <div>
          <p className="eyebrow">Robot Web Publisher</p>
          <h1>Robot room entry</h1>
        </div>

        <form className="entry-form" onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              value={robotName}
              onChange={(event) => onRobotNameChange(event.target.value)}
              placeholder="请输入用户名"
              required
              maxLength={80}
            />
          </label>
          <label>
            Room name
            <input value={roomName} onChange={(event) => onRoomNameChange(event.target.value)} required maxLength={80} />
          </label>

          <div className="entry-actions">
            <button type="button" disabled={pending} onClick={() => onEnter("create")}>
              创建房间
            </button>
            <button type="submit" disabled={pending}>
              加入房间
            </button>
          </div>
        </form>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

function RobotRoomView({
  session,
  backendState,
  webSocketState,
  liveKitState,
  publishState,
  tokenMode,
  localTrack,
  remoteVideos,
  error,
  keyboardStatus,
  lastRobotControl,
  onLeave
}: {
  session: RoomSession;
  backendState: string;
  webSocketState: string;
  liveKitState: string;
  publishState: string;
  tokenMode: "mock" | "livekit" | "none";
  localTrack: LocalVideoTrack | null;
  remoteVideos: RemoteVideoInfo[];
  error: string;
  keyboardStatus: KeyboardControlStatusMessage | null;
  lastRobotControl: RobotControlMessage | null;
  onLeave: () => void;
}) {
  const controllerVideos = remoteVideos.filter((participant) => participant.role === "controller");
  const viewerVideos = remoteVideos.filter((participant) => participant.role === "viewer");
  const currentController = controllerVideos[0] ?? null;
  const visibleViewerVideos = viewerVideos.length <= 4 ? viewerVideos : viewerVideos.slice(0, 4);
  const hiddenViewerCount = Math.max(0, viewerVideos.length - visibleViewerVideos.length);
  const [fullscreenError, setFullscreenError] = useState("");

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <div>
          <p className="eyebrow">Robot Room</p>
          <h1>{session.roomName}</h1>
          <p className="subtle">Robot user: {session.robotName}</p>
        </div>
        <button type="button" className="ghost-button" onClick={onLeave}>
          Disconnect
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {fullscreenError ? <p className="error">{fullscreenError}</p> : null}

      <section className="status-panel">
        <div className="status-grid">
          <span>
            Backend <strong>{backendState}</strong>
          </span>
          <span>
            WebSocket <strong>{webSocketState}</strong>
          </span>
          <span>
            LiveKit <strong>{liveKitState}</strong>
          </span>
          <span>
            Publish <strong>{publishState}</strong>
          </span>
          <span>
            Token <strong>{tokenMode}</strong>
          </span>
          <span>
            Keyboard <strong>{keyboardStatus?.active ? "active" : "idle"}</strong>
          </span>
          <span>
            Controller <strong>{keyboardStatus?.controllerName ?? "-"}</strong>
          </span>
          <span>
            Direction <strong>{keyboardStatus?.direction?.replace("_", " ") ?? "-"}</strong>
          </span>
          <span>
            Last command <strong>{lastRobotControl?.command ?? "-"}</strong>
          </span>
          <span>
            Stop reason <strong>{keyboardStatus?.stopReason ?? lastRobotControl?.parameters?.stopReason ?? "-"}</strong>
          </span>
        </div>
      </section>

      <section className="meeting-layout" aria-label="Robot meeting layout">
        <section className="thumbnail-strip" aria-labelledby="thumbnail-title">
          <div className="panel-heading">
            <h2 id="thumbnail-title">Robot and viewer videos</h2>
            <span>{viewerVideos.length} viewers</span>
          </div>
          <div className="thumbnail-grid">
            <LocalPreview track={localTrack} robotName={session.robotName} compact onFullscreenError={setFullscreenError} />
            {visibleViewerVideos.map((participant) => (
              <RemoteVideoTile participant={participant} key={participant.identity} compact onFullscreenError={setFullscreenError} />
            ))}
            {hiddenViewerCount > 0 ? (
              <div className="viewer-overflow-tile">
                <strong>+{hiddenViewerCount}</strong>
                <span>more viewers</span>
              </div>
            ) : null}
            {viewerVideos.length === 0 ? (
              <div className="viewer-overflow-tile muted-overflow">
                <span>No viewer video yet</span>
              </div>
            ) : null}
          </div>
        </section>

        <PrimaryControllerStage controller={currentController} onFullscreenError={setFullscreenError} />
      </section>
    </main>
  );
}

function App() {
  const [view, setView] = useState<"entry" | "room">("entry");
  const [roomName, setRoomName] = useState("robot-room-001");
  const [robotName, setRobotName] = useState("robot-001");
  const [session, setSession] = useState<RoomSession | null>(null);
  const [backendState, setBackendState] = useState("idle");
  const [webSocketState, setWebSocketState] = useState("idle");
  const [liveKitState, setLiveKitState] = useState("idle");
  const [publishState, setPublishState] = useState("idle");
  const [tokenMode, setTokenMode] = useState<"mock" | "livekit" | "none">("none");
  const [localTrack, setLocalTrack] = useState<LocalVideoTrack | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideoInfo[]>([]);
  const [keyboardStatus, setKeyboardStatus] = useState<KeyboardControlStatusMessage | null>(null);
  const [lastRobotControl, setLastRobotControl] = useState<RobotControlMessage | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const localTrackRef = useRef<LocalVideoTrack | null>(null);
  const participantsByIdRef = useRef<Map<string, ParticipantPresence>>(new Map());
  const sessionRef = useRef<RoomSession | null>(null);

  function updateRemoteVideos() {
    const room = roomRef.current;
    const currentSession = sessionRef.current;
    if (!room || !currentSession) {
      setRemoteVideos([]);
      return;
    }

    setRemoteVideos(collectRemoteVideos(room, participantsByIdRef.current, currentSession.participantId));
  }

  function resetConnections() {
    socketRef.current?.close();
    socketRef.current = null;

    void roomRef.current?.disconnect();
    roomRef.current = null;

    localTrackRef.current?.stop();
    localTrackRef.current = null;
    participantsByIdRef.current = new Map();
    sessionRef.current = null;
    setLocalTrack(null);
    setRemoteVideos([]);
    setKeyboardStatus(null);
    setLastRobotControl(null);
    setWebSocketState("closed");
    setLiveKitState("disconnected");
    setPublishState("stopped");
  }

  function leaveRoom() {
    resetConnections();
    setSession(null);
    setView("entry");
    setError("");
    setBackendState("idle");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");
    setTokenMode("none");
  }

  async function enterRoom(_mode: "create" | "join") {
    const trimmedRoomName = roomName.trim();
    const trimmedRobotName = robotName.trim();
    if (!trimmedRobotName) {
      setError("用户名不能为空");
      return;
    }
    if (!trimmedRoomName) {
      setError("Room name is required");
      return;
    }

    resetConnections();
    setError("");
    setPending(true);
    setBackendState("joining");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");

    try {
      validateRuntimeConfig();
      const joinResponse = await joinRobot(trimmedRoomName, trimmedRobotName);
      const nextSession = { ...joinResponse, robotName: trimmedRobotName };
      setSession(nextSession);
      sessionRef.current = nextSession;
      setView("room");
      setBackendState(joinResponse.online ? "robot online" : "joined");
      setTokenMode(joinResponse.tokenMode);

      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;
      setWebSocketState("connecting");
      socket.addEventListener("open", () => {
        setWebSocketState("connected");
        socket.send(
          JSON.stringify({
            type: "hello",
            roomName: joinResponse.roomName,
            participantId: joinResponse.participantId
          })
        );
      });
      socket.addEventListener("message", (event) => {
        let message: unknown;
        try {
          message = JSON.parse(event.data as string) as unknown;
        } catch {
          setError("WebSocket received an invalid message");
          return;
        }

        if (isRoleUpdateMessage(message)) {
          participantsByIdRef.current = new Map(message.participants.map((participant) => [participant.id, participant]));
          updateRemoteVideos();
          return;
        }

        if (isKeyboardControlStatusMessage(message)) {
          setKeyboardStatus(message);
          return;
        }

        if (isRobotControlMessage(message)) {
          setLastRobotControl(message);
        }
      });
      socket.addEventListener("close", () => setWebSocketState("closed"));
      socket.addEventListener("error", () => {
        setWebSocketState("error");
        setError(`WebSocket connection failed. Check VITE_WS_BASE_URL, backend WSS /ws proxy, and HTTPS certificate: ${WS_URL}`);
      });

      if (joinResponse.tokenMode === "mock" || joinResponse.liveKitUrl.startsWith("mock://")) {
        setLiveKitState("mock token");
        setPublishState("configure LiveKit to publish video");
        return;
      }

      const room = new Room({
        dynacast: true
      });
      roomRef.current = room;
      room.on(RoomEvent.ConnectionStateChanged, (state) => setLiveKitState(String(state)));
      room.on(RoomEvent.Connected, () => {
        setLiveKitState("connected");
        updateRemoteVideos();
      });
      room.on(RoomEvent.Disconnected, () => {
        setLiveKitState("disconnected");
        setRemoteVideos([]);
      });
      room.on(RoomEvent.ParticipantConnected, updateRemoteVideos);
      room.on(RoomEvent.ParticipantDisconnected, updateRemoteVideos);
      room.on(RoomEvent.TrackSubscribed, updateRemoteVideos);
      room.on(RoomEvent.TrackUnsubscribed, updateRemoteVideos);
      room.on(RoomEvent.TrackPublished, updateRemoteVideos);
      room.on(RoomEvent.TrackUnpublished, updateRemoteVideos);
      room.on(RoomEvent.TrackMuted, updateRemoteVideos);
      room.on(RoomEvent.TrackUnmuted, updateRemoteVideos);

      setLiveKitState("connecting");
      try {
        await room.connect(joinResponse.liveKitUrl, joinResponse.token, { autoSubscribe: true });
      } catch (error) {
        throw new Error(
          `LiveKit Cloud connection failed. Check LIVEKIT_URL is your LiveKit Cloud wss:// URL, backend token mode is livekit, and the token is not expired. Details: ${describeUnknownError(
            error
          )}`
        );
      }

      setPublishState("requesting camera");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser does not support camera API. Use a modern browser and open the page through HTTPS or localhost.");
      }

      let videoTrack: LocalVideoTrack;
      try {
        videoTrack = await createLocalVideoTrack();
      } catch (error) {
        throw new Error(describeCameraError(error));
      }
      localTrackRef.current = videoTrack;
      setLocalTrack(videoTrack);

      setPublishState("publishing camera");
      try {
        await room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.Camera,
          name: `${joinResponse.robotId}-camera`
        });
      } catch (error) {
        throw new Error(describeLiveKitPublishError(error));
      }
      setPublishState("publishing");
      updateRemoteVideos();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Robot publisher failed");
      setPublishState("error");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => resetConnections, []);

  if (view === "entry" || !session) {
    return (
      <EntryView
        robotName={robotName}
        roomName={roomName}
        error={error}
        pending={pending}
        onRobotNameChange={setRobotName}
        onRoomNameChange={setRoomName}
        onEnter={enterRoom}
      />
    );
  }

  return (
    <RobotRoomView
      session={session}
      backendState={backendState}
      webSocketState={webSocketState}
      liveKitState={liveKitState}
      publishState={publishState}
      tokenMode={tokenMode}
      localTrack={localTrack}
      remoteVideos={remoteVideos}
      error={error}
      keyboardStatus={keyboardStatus}
      lastRobotControl={lastRobotControl}
      onLeave={leaveRoom}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
