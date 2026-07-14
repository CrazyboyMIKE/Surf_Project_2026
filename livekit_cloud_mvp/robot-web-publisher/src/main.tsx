import React, { FormEvent, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { createLocalVideoTrack, LocalVideoTrack, Room, RoomEvent, Track } from "livekit-client";
import "./styles.css";

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
    <div className="preview">
      {track ? (
        <video ref={videoRef} autoPlay muted playsInline />
      ) : (
        <div className="preview-placeholder">Camera preview will appear here</div>
      )}
    </div>
  );
}

function App() {
  const [roomName, setRoomName] = useState("robot-room-001");
  const [robotId, setRobotId] = useState("robot-001");
  const [backendState, setBackendState] = useState("idle");
  const [webSocketState, setWebSocketState] = useState("idle");
  const [liveKitState, setLiveKitState] = useState("idle");
  const [publishState, setPublishState] = useState("idle");
  const [tokenMode, setTokenMode] = useState<"mock" | "livekit" | "none">("none");
  const [localTrack, setLocalTrack] = useState<LocalVideoTrack | null>(null);
  const [error, setError] = useState("");

  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const localTrackRef = useRef<LocalVideoTrack | null>(null);

  function cleanup() {
    socketRef.current?.close();
    socketRef.current = null;

    void roomRef.current?.disconnect();
    roomRef.current = null;

    localTrackRef.current?.stop();
    localTrackRef.current = null;
    setLocalTrack(null);
    setWebSocketState("closed");
    setLiveKitState("disconnected");
    setPublishState("stopped");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cleanup();
    setError("");
    setBackendState("joining");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");

    try {
      validateRuntimeConfig();
      const joinResponse = await joinRobot(roomName.trim(), robotId.trim());
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
      room.on(RoomEvent.Connected, () => setLiveKitState("connected"));
      room.on(RoomEvent.Disconnected, () => setLiveKitState("disconnected"));

      setLiveKitState("connecting");
      try {
        await room.connect(joinResponse.liveKitUrl, joinResponse.token, { autoSubscribe: false });
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Robot publisher failed");
      setPublishState("error");
    }
  }

  useEffect(() => cleanup, []);

  return (
    <main className="publisher-shell">
      <section className="publisher-panel">
        <div>
          <p className="eyebrow">Mock Robot Publisher</p>
          <h1>LiveKit Camera Publisher</h1>
        </div>

        <form onSubmit={handleSubmit} className="publisher-form">
          <label>
            Room name
            <input value={roomName} onChange={(event) => setRoomName(event.target.value)} required maxLength={80} />
          </label>
          <label>
            Robot ID
            <input value={robotId} onChange={(event) => setRobotId(event.target.value)} required maxLength={80} />
          </label>
          <div className="actions">
            <button type="submit">Join and publish</button>
            <button type="button" className="ghost-button" onClick={cleanup}>
              Stop
            </button>
          </div>
        </form>

        {error ? <p className="error">{error}</p> : null}
      </section>

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

      <LocalPreview track={localTrack} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
