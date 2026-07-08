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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const WS_URL = import.meta.env.VITE_WS_URL ?? API_BASE_URL.replace(/^http/, "ws") + "/ws";

async function joinRobot(roomName: string, robotId: string): Promise<JoinRobotResponse> {
  const response = await fetch(`${API_BASE_URL}/api/robots/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ roomName, robotId })
  });

  const data = (await response.json()) as JoinRobotResponse & { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "Robot join failed");
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
      socket.addEventListener("error", () => setWebSocketState("error"));

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
      await room.connect(joinResponse.liveKitUrl, joinResponse.token, { autoSubscribe: false });

      setPublishState("requesting camera");
      const videoTrack = await createLocalVideoTrack();
      localTrackRef.current = videoTrack;
      setLocalTrack(videoTrack);

      setPublishState("publishing camera");
      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.Camera,
        name: `${joinResponse.robotId}-camera`
      });
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
