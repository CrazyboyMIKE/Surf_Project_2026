import React, { FormEvent, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createLocalVideoTrack,
  LocalVideoTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant
} from "livekit-client";
import "./styles.css";

type Role = "robot" | "controller" | "viewer";

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
  participants: ParticipantPresence[];
};

type RoomSession = JoinRobotResponse & {
  robotName: string;
};

type RemoteVideoInfo = {
  identity: string;
  name: string;
  role: "controller" | "viewer";
  videoTrack: RemoteVideoTrack | null;
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveWebSocketUrl(apiBaseUrl: string): string {
  const configuredWsUrl = import.meta.env.VITE_WS_BASE_URL ?? import.meta.env.VITE_WS_URL;
  const baseUrl = stripTrailingSlash(configuredWsUrl ?? apiBaseUrl.replace(/^http/, "ws"));
  return baseUrl.endsWith("/ws") ? baseUrl : `${baseUrl}/ws`;
}

const API_BASE_URL = stripTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001");
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
        videoTrack: firstRemoteVideoTrack(participant)
      }
    ];
  });
}

function RemoteVideoTile({ participant }: { participant: RemoteVideoInfo }) {
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
    <article className="remote-video-tile">
      {participant.videoTrack ? <video ref={videoRef} autoPlay playsInline /> : <div className="video-empty">Waiting for video</div>}
      <span className="role-badge">{participant.role}</span>
      <span className="name-badge">{participant.name}</span>
    </article>
  );
}

function LocalPreview({ track }: { track: LocalVideoTrack | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!track || !videoElement) {
      return;
    }

    track.attach(videoElement);

    return () => {
      track.detach(videoElement);
    };
  }, [track]);

  return (
    <div className="local-preview">
      {track ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="preview-placeholder">Robot camera preview</div>}
    </div>
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

        <div className="config-note">
          <span>API</span>
          <strong>{API_BASE_URL}</strong>
        </div>

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
  onLeave: () => void;
}) {
  const controllerVideos = remoteVideos.filter((participant) => participant.role === "controller");
  const viewerVideos = remoteVideos.filter((participant) => participant.role === "viewer");

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
        </div>
      </section>

      <div className="publisher-layout">
        <section className="local-camera-card">
          <div className="panel-heading">
            <h2>Robot camera</h2>
            <span>{publishState}</span>
          </div>
          <LocalPreview track={localTrack} />
        </section>

        <section className="remote-section" aria-labelledby="controller-title">
          <div className="panel-heading">
            <h2 id="controller-title">Controller video</h2>
            <span>{controllerVideos.length}</span>
          </div>
          {controllerVideos.length === 0 ? (
            <div className="empty-video-state">No controller video yet</div>
          ) : (
            <div className="video-grid">
              {controllerVideos.map((participant) => (
                <RemoteVideoTile participant={participant} key={participant.identity} />
              ))}
            </div>
          )}
        </section>

        <section className="remote-section" aria-labelledby="viewer-title">
          <div className="panel-heading">
            <h2 id="viewer-title">Viewer videos</h2>
            <span>{viewerVideos.length}</span>
          </div>
          {viewerVideos.length === 0 ? (
            <div className="empty-video-state">No viewer video yet</div>
          ) : (
            <div className="video-grid">
              {viewerVideos.map((participant) => (
                <RemoteVideoTile participant={participant} key={participant.identity} />
              ))}
            </div>
          )}
        </section>
      </div>
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
      onLeave={leaveRoom}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
