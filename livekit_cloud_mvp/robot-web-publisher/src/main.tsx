import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
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
type RobotCommand = "1000" | "1001" | "1002" | "1003";
type RobotMicrophoneState =
  | "idle"
  | "not-published"
  | "requesting"
  | "publishing"
  | "muted/off"
  | "permission-denied"
  | "device-not-found"
  | "unsupported"
  | "publish-failed";
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
  clientSessionId?: string;
  reusedParticipant?: boolean;
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

type SpeakerParticipant = {
  id: string;
  name: string;
  role: "controller" | "viewer";
  connected: boolean;
};

type SpeakerState = {
  currentSpeaker?: SpeakerParticipant;
  currentSpeakerId?: string;
  currentSpeakerName?: string;
  queue: SpeakerParticipant[];
};

type SpeakerUpdateMessage = {
  type: "speaker_update";
  roomName: string;
  currentSpeaker?: SpeakerParticipant;
  currentSpeakerId?: string;
  currentSpeakerName?: string;
  queue: SpeakerParticipant[];
  timestamp: number;
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
    d?: number;
    a?: number;
    lv?: number;
    av?: number;
  };
  from: string;
  timestamp: number;
};

type ServerErrorMessage = {
  type: "error";
  code: string;
  message: string;
};

type RoomSession = JoinRobotResponse & {
  robotName: string;
  publishMicrophone: boolean;
};

type RemoteVideoInfo = {
  identity: string;
  name: string;
  role: "controller" | "viewer";
  videoTrack: RemoteVideoTrack | null;
  audioTrack: RemoteAudioTrack | null;
  hasAudioTrack: boolean;
  isSpeaking: boolean;
  audioLevel: number;
};

type ParticipantSpeakingInfo = {
  hasAudioTrack: boolean;
  isSpeaking: boolean;
  audioLevel: number;
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
const ROBOT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.robot-session";
const ROBOT_CLIENT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.robot-client-session-id";
const EMPTY_SPEAKING: ParticipantSpeakingInfo = {
  hasAudioTrack: false,
  isSpeaking: false,
  audioLevel: 0
};
const EMPTY_SPEAKER_STATE: SpeakerState = {
  queue: []
};

function readPersistentValue(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

function writePersistentValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Session storage keeps the page refresh path working when localStorage is unavailable.
  }

  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in locked-down browsers; the room still works until refresh.
  }
}

function removePersistentValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }

  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function validateRuntimeConfig() {
  if (!/^https?:\/\//.test(API_BASE_URL)) {
    throw new Error("API address configuration error: VITE_API_BASE_URL must start with http:// or https://.");
  }

  if (!/^wss?:\/\//.test(WS_URL)) {
    throw new Error("WebSocket address configuration error: VITE_WS_BASE_URL must start with ws:// or wss://.");
  }
}

function readStoredRobotSession(): RoomSession | null {
  try {
    const raw = readPersistentValue(ROBOT_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RoomSession>;
    if (
      typeof parsed.roomName !== "string" ||
      typeof parsed.robotName !== "string" ||
      typeof parsed.robotId !== "string" ||
      typeof parsed.participantId !== "string" ||
      typeof parsed.liveKitUrl !== "string" ||
      typeof parsed.token !== "string" ||
      parsed.role !== "robot"
    ) {
      return null;
    }

    return {
      ...parsed,
      online: Boolean(parsed.online),
      tokenMode: parsed.tokenMode === "livekit" ? "livekit" : "mock",
      publishMicrophone: Boolean(parsed.publishMicrophone)
    } as RoomSession;
  } catch {
    return null;
  }
}

function saveStoredRobotSession(session: RoomSession): void {
  writePersistentValue(ROBOT_SESSION_STORAGE_KEY, JSON.stringify(session));
  if (session.clientSessionId) {
    writePersistentValue(ROBOT_CLIENT_SESSION_STORAGE_KEY, session.clientSessionId);
  }
}

function clearStoredRobotSession(): void {
  removePersistentValue(ROBOT_SESSION_STORAGE_KEY);
}

function clearRobotClientSessionId(): void {
  removePersistentValue(ROBOT_CLIENT_SESSION_STORAGE_KEY);
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

function getOrCreateRobotClientSessionId(): string {
  const existing = readPersistentValue(ROBOT_CLIENT_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createClientSessionId();
  writePersistentValue(ROBOT_CLIENT_SESSION_STORAGE_KEY, next);
  return next;
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

function classifyMicrophoneError(error: unknown): { state: RobotMicrophoneState; message: string } {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError" || error.name === "PermissionDeniedError") {
      return {
        state: "permission-denied",
        message: "Microphone permission denied. Allow microphone access in the browser site settings, then retry."
      };
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return {
        state: "device-not-found",
        message: "No microphone was detected. Connect a microphone or select another input device, then retry."
      };
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return {
        state: "publish-failed",
        message: "Microphone is busy or unavailable. Close other audio apps and retry."
      };
    }
  }

  return {
    state: "publish-failed",
    message: `Microphone publish failed: ${describeUnknownError(error)}`
  };
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

function isSpeakerUpdateMessage(message: unknown): message is SpeakerUpdateMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "speaker_update" &&
    "queue" in message &&
    Array.isArray(message.queue)
  );
}

function isRobotControlMessage(message: unknown): message is RobotControlMessage {
  return typeof message === "object" && message !== null && "type" in message && message.type === "robot_control";
}

function isServerErrorMessage(message: unknown): message is ServerErrorMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "error" &&
    "code" in message &&
    typeof message.code === "string" &&
    "message" in message &&
    typeof message.message === "string"
  );
}

async function joinRobot(
  roomName: string,
  robotId: string,
  options: { previousParticipantId?: string; clientSessionId?: string } = {}
): Promise<JoinRobotResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/robots/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roomName,
        robotId,
        previousParticipantId: options.previousParticipantId,
        clientSessionId: options.clientSessionId
      })
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

async function leaveRobot(roomName: string, participantId: string, clientSessionId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/rooms/leave`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ roomName, participantId, clientSessionId })
  });
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

function getSpeakingStyle(audioLevel: number): React.CSSProperties & Record<"--speaking-level", string> {
  const level = Math.min(1, Math.max(0.18, audioLevel));
  return {
    "--speaking-level": level.toFixed(2)
  };
}

function SpeakingBadge({
  hasAudioTrack,
  isSpeaking,
  audioLevel
}: {
  hasAudioTrack: boolean;
  isSpeaking: boolean;
  audioLevel: number;
}) {
  if (!hasAudioTrack) {
    return null;
  }

  return (
    <span
      className={`speaking-badge${isSpeaking ? " active" : ""}`}
      style={getSpeakingStyle(audioLevel)}
      title={isSpeaking ? "Speaking" : "Audio track available"}
      aria-label={isSpeaking ? "Speaking" : "Audio track available"}
    >
      <span className="speaking-icon" aria-hidden="true" />
    </span>
  );
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

    const audioTrack = firstRemoteAudioTrack(participant);
    return [
      {
        identity: participant.identity,
        name: presence?.name ?? participant.name ?? participant.identity,
        role,
        videoTrack: firstRemoteVideoTrack(participant),
        audioTrack,
        hasAudioTrack: Boolean(audioTrack),
        isSpeaking: Boolean(audioTrack) && participant.isSpeaking,
        audioLevel: audioTrack ? participant.audioLevel : 0
      }
    ];
  });
}

function collectLocalSpeaking(room: Room, audioTrack: LocalAudioTrack | null): ParticipantSpeakingInfo {
  const hasAudioTrack = Boolean(audioTrack);
  return {
    hasAudioTrack,
    isSpeaking: hasAudioTrack && room.localParticipant.isSpeaking,
    audioLevel: hasAudioTrack ? room.localParticipant.audioLevel : 0
  };
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

function readTrackAspectRatio(track: LocalVideoTrack, videoElement?: HTMLVideoElement | null): string {
  const videoWidth = videoElement?.videoWidth ?? 0;
  const videoHeight = videoElement?.videoHeight ?? 0;
  if (videoWidth > 0 && videoHeight > 0) {
    return `${videoWidth} / ${videoHeight}`;
  }

  const settings = track.mediaStreamTrack.getSettings();
  if (settings.width && settings.height) {
    return `${settings.width} / ${settings.height}`;
  }

  return "16 / 9";
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
    <article
      className={`${compact ? "remote-video-tile compact-video-tile" : "remote-video-tile"}${
        participant.hasAudioTrack && participant.isSpeaking ? " is-speaking" : ""
      }`}
      ref={tileRef}
    >
      {participant.videoTrack ? <video ref={videoRef} autoPlay playsInline /> : <div className="video-empty">Waiting for video</div>}
      <span className="role-badge">{participant.role}</span>
      <SpeakingBadge
        hasAudioTrack={participant.hasAudioTrack}
        isSpeaking={participant.isSpeaking}
        audioLevel={participant.audioLevel}
      />
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
  speaking,
  compact = false,
  onFullscreenError
}: {
  track: LocalVideoTrack | null;
  robotName: string;
  speaking: ParticipantSpeakingInfo;
  compact?: boolean;
  onFullscreenError: (message: string) => void;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [previewWarning, setPreviewWarning] = useState("");
  const [previewAspectRatio, setPreviewAspectRatio] = useState("16 / 9");

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!track || !videoElement) {
      return;
    }

    let disposed = false;
    const mediaStream = new MediaStream([track.mediaStreamTrack]);
    setPreviewWarning("");
    setPreviewAspectRatio(readTrackAspectRatio(track, videoElement));
    videoElement.muted = true;
    videoElement.defaultMuted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.setAttribute("muted", "");
    videoElement.setAttribute("playsinline", "");
    videoElement.setAttribute("webkit-playsinline", "true");
    videoElement.srcObject = mediaStream;

    const updatePreviewAspectRatio = () => {
      if (!disposed) {
        setPreviewAspectRatio(readTrackAspectRatio(track, videoElement));
      }
    };

    const playPreview = () => {
      if (disposed) {
        return;
      }

      updatePreviewAspectRatio();

      if (videoElement.srcObject !== mediaStream) {
        videoElement.srcObject = mediaStream;
      }

      void videoElement.play().then(
        () => {
          if (!disposed) {
            setPreviewWarning("");
          }
        },
        () => {
          if (!disposed) {
            setPreviewWarning("Preview paused by browser. Tap fullscreen or retry camera.");
          }
        }
      );
    };

    const nudgePreviewPaint = () => {
      if (disposed) {
        return;
      }

      videoElement.style.transform = "translateZ(0)";
      window.requestAnimationFrame(() => {
        videoElement.style.transform = "";
        playPreview();
      });
    };

    if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
      playPreview();
    } else {
      videoElement.addEventListener("loadedmetadata", playPreview);
    }

    videoElement.addEventListener("loadeddata", updatePreviewAspectRatio);
    videoElement.addEventListener("canplay", playPreview);
    videoElement.addEventListener("playing", nudgePreviewPaint);
    document.addEventListener("visibilitychange", playPreview);
    window.addEventListener("focus", playPreview);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => nudgePreviewPaint()) : undefined;
    resizeObserver?.observe(videoElement);
    if (tileRef.current) {
      resizeObserver?.observe(tileRef.current);
    }

    window.requestAnimationFrame(playPreview);
    const retryTimer = window.setTimeout(playPreview, 250);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      videoElement.removeEventListener("loadedmetadata", playPreview);
      videoElement.removeEventListener("loadeddata", updatePreviewAspectRatio);
      videoElement.removeEventListener("canplay", playPreview);
      videoElement.removeEventListener("playing", nudgePreviewPaint);
      document.removeEventListener("visibilitychange", playPreview);
      window.removeEventListener("focus", playPreview);
      resizeObserver?.disconnect();
      videoElement.pause();
      videoElement.srcObject = null;
    };
  }, [track]);

  const previewStyle = {
    "--preview-aspect-ratio": previewAspectRatio
  } as React.CSSProperties & Record<"--preview-aspect-ratio", string>;

  return (
    <div
      className={`${compact ? "local-preview compact-video-tile" : "local-preview"}${
        speaking.hasAudioTrack && speaking.isSpeaking ? " is-speaking" : ""
      }`}
      ref={tileRef}
      style={previewStyle}
    >
      {track ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="preview-placeholder">Robot camera preview</div>}
      {previewWarning ? <span className="preview-warning">{previewWarning}</span> : null}
      <span className="role-badge">robot</span>
      <SpeakingBadge hasAudioTrack={speaking.hasAudioTrack} isSpeaking={speaking.isSpeaking} audioLevel={speaking.audioLevel} />
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

function RemoteParticipantAudio({
  participant,
  playbackAttempt,
  onBlocked,
  onPlaying
}: {
  participant: RemoteVideoInfo;
  playbackAttempt: number;
  onBlocked: (participantId: string) => void;
  onPlaying: (participantId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !participant.audioTrack) {
      return;
    }

    participant.audioTrack.attach(audioElement);
    audioElement.muted = false;
    audioElement.volume = participant.role === "controller" ? 1 : 0.9;

    void audioElement.play().then(
      () => onPlaying(participant.identity),
      () => onBlocked(participant.identity)
    );

    return () => {
      participant.audioTrack?.detach(audioElement);
    };
  }, [onBlocked, onPlaying, participant, playbackAttempt]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

function RemoteAudioMixer({ participants }: { participants: RemoteVideoInfo[] }) {
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [blockedById, setBlockedById] = useState<Record<string, boolean>>({});
  const audioParticipants = [...participants]
    .filter((participant) => participant.audioTrack)
    .sort((left, right) => {
      if (left.role === "controller" && right.role !== "controller") {
        return -1;
      }

      if (left.role !== "controller" && right.role === "controller") {
        return 1;
      }

      return left.name.localeCompare(right.name);
    });

  const activeAudioIds = audioParticipants.map((participant) => participant.identity).join("|");
  const handleBlocked = useCallback((participantId: string) => {
    setBlockedById((current) => ({ ...current, [participantId]: true }));
  }, []);
  const handlePlaying = useCallback((participantId: string) => {
    setBlockedById((current) => ({ ...current, [participantId]: false }));
  }, []);

  useEffect(() => {
    const activeIds = new Set(audioParticipants.map((participant) => participant.identity));
    setBlockedById((current) =>
      Object.fromEntries(Object.entries(current).filter(([participantId]) => activeIds.has(participantId)))
    );
  }, [activeAudioIds]);

  const blockedParticipants = audioParticipants.filter((participant) => blockedById[participant.identity]);
  const controllerAudioCount = audioParticipants.filter((participant) => participant.role === "controller").length;
  const viewerAudioCount = audioParticipants.filter((participant) => participant.role === "viewer").length;
  const audioStatus =
    audioParticipants.length === 0
      ? "waiting for Web participant microphones"
      : blockedParticipants.length > 0
        ? `playback blocked for ${blockedParticipants.map((participant) => participant.name).join(", ")}`
        : `playing ${controllerAudioCount} controller and ${viewerAudioCount} viewer audio tracks`;

  return (
    <section className="remote-audio-panel" aria-label="Remote participant audio playback">
      {audioParticipants.map((participant) => (
        <RemoteParticipantAudio
          key={participant.identity}
          participant={participant}
          playbackAttempt={playbackAttempt}
          onBlocked={handleBlocked}
          onPlaying={handlePlaying}
        />
      ))}
      <span>
        Room audio <strong>{audioStatus}</strong>
      </span>
      {audioParticipants.length > 0 && blockedParticipants.length > 0 ? (
        <button type="button" className="audio-button" onClick={() => setPlaybackAttempt((current) => current + 1)}>
          Enable participant audio
        </button>
      ) : null}
    </section>
  );
}

function SpeakerQueueSummary({ speaker }: { speaker: SpeakerState }) {
  return (
    <div className="speaker-queue-panel" aria-label="Speaker queue">
      <div>
        <span>Current</span>
        <strong>{speaker.currentSpeaker ? `${speaker.currentSpeaker.name} · ${speaker.currentSpeaker.role}` : "none"}</strong>
      </div>
      <div className="speaker-queue-list">
        {speaker.queue.length === 0 ? (
          <span>Queue empty</span>
        ) : (
          speaker.queue.map((participant, index) => (
            <span key={participant.id}>
              {index + 1}. {participant.name}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function PrimarySpeakerStage({
  speaker,
  speakerVideo,
  onFullscreenError
}: {
  speaker: SpeakerState;
  speakerVideo: RemoteVideoInfo | null;
  onFullscreenError: (message: string) => void;
}) {
  const stageRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentSpeaker = speaker.currentSpeaker;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!speakerVideo?.videoTrack || !videoElement) {
      return;
    }

    speakerVideo.videoTrack.attach(videoElement);
    return () => {
      speakerVideo.videoTrack?.detach(videoElement);
    };
  }, [speakerVideo]);

  return (
    <section className="controller-stage" aria-labelledby="speaker-stage-title" ref={stageRef}>
      <div className="panel-heading">
        <div>
          <h2 id="speaker-stage-title">Speaker</h2>
          <p className="subtle">{currentSpeaker ? `Current speaker: ${currentSpeaker.name}` : "No Speaker video track is active"}</p>
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

      <div className={`controller-video-frame${speakerVideo?.hasAudioTrack && speakerVideo.isSpeaking ? " is-speaking" : ""}`}>
        {speakerVideo?.videoTrack ? (
          <video ref={videoRef} autoPlay playsInline />
        ) : (
          <div className="empty-video-state">Waiting for Speaker video</div>
        )}
        {currentSpeaker ? (
          <>
            <span className="role-badge">{currentSpeaker.role}</span>
            {speakerVideo ? (
              <SpeakingBadge
                hasAudioTrack={speakerVideo.hasAudioTrack}
                isSpeaking={speakerVideo.isSpeaking}
                audioLevel={speakerVideo.audioLevel}
              />
            ) : null}
            <span className="name-badge">{currentSpeaker.name}</span>
          </>
        ) : null}
      </div>

      <SpeakerQueueSummary speaker={speaker} />
    </section>
  );
}

function EntryView({
  robotName,
  roomName,
  publishMicrophone,
  error,
  pending,
  onRobotNameChange,
  onRoomNameChange,
  onPublishMicrophoneChange,
  onEnter
}: {
  robotName: string;
  roomName: string;
  publishMicrophone: boolean;
  error: string;
  pending: boolean;
  onRobotNameChange: (value: string) => void;
  onRoomNameChange: (value: string) => void;
  onPublishMicrophoneChange: (value: boolean) => void;
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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={publishMicrophone}
              onChange={(event) => onPublishMicrophoneChange(event.target.checked)}
            />
            Publish microphone audio
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
  microphoneState,
  tokenMode,
  localTrack,
  localSpeaking,
  speaker,
  remoteVideos,
  error,
  keyboardStatus,
  lastRobotControl,
  onStartMicrophone,
  onStopMicrophone,
  onLeave
}: {
  session: RoomSession;
  backendState: string;
  webSocketState: string;
  liveKitState: string;
  publishState: string;
  microphoneState: RobotMicrophoneState;
  tokenMode: "mock" | "livekit" | "none";
  localTrack: LocalVideoTrack | null;
  localSpeaking: ParticipantSpeakingInfo;
  speaker: SpeakerState;
  remoteVideos: RemoteVideoInfo[];
  error: string;
  keyboardStatus: KeyboardControlStatusMessage | null;
  lastRobotControl: RobotControlMessage | null;
  onStartMicrophone: () => void;
  onStopMicrophone: () => void;
  onLeave: () => void;
}) {
  const controllerVideos = remoteVideos.filter((participant) => participant.role === "controller");
  const viewerVideos = remoteVideos.filter((participant) => participant.role === "viewer");
  const currentController = controllerVideos[0] ?? null;
  const fallbackSpeaker =
    speaker.currentSpeaker ??
    (currentController
      ? {
          id: currentController.identity,
          name: currentController.name,
          role: currentController.role,
          connected: true
        }
      : undefined);
  const effectiveSpeaker = {
    ...speaker,
    currentSpeaker: fallbackSpeaker,
    currentSpeakerId: fallbackSpeaker?.id,
    currentSpeakerName: fallbackSpeaker?.name
  };
  const speakerVideo = fallbackSpeaker
    ? (remoteVideos.find((participant) => participant.identity === fallbackSpeaker.id) ?? null)
    : currentController;
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
            Microphone <strong>{microphoneState}</strong>
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
        <div className="microphone-actions" aria-label="Robot microphone controls">
          <button type="button" disabled={liveKitState !== "connected" || microphoneState === "publishing"} onClick={onStartMicrophone}>
            Publish microphone
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={microphoneState !== "publishing" && microphoneState !== "requesting"}
            onClick={onStopMicrophone}
          >
            Stop microphone
          </button>
        </div>
      </section>

      <section className="meeting-layout" aria-label="Robot meeting layout">
        <section className="thumbnail-strip" aria-labelledby="thumbnail-title">
          <div className="panel-heading">
            <h2 id="thumbnail-title">Robot and viewer videos</h2>
            <span>{viewerVideos.length} viewers</span>
          </div>
          <div className="video-card-grid" aria-label="Robot and viewer video cards">
            <article className="meeting-video-card robot-video-card">
              <div className="video-card-header">
                <strong>{session.robotName}</strong>
                <span>robot</span>
              </div>
              <LocalPreview
                track={localTrack}
                robotName={session.robotName}
                speaking={localSpeaking}
                compact
                onFullscreenError={setFullscreenError}
              />
            </article>

            {viewerVideos.length === 0 ? (
              <article className="meeting-video-card empty-meeting-card">
                <div className="video-card-header">
                  <strong>Viewers</strong>
                  <span>empty</span>
                </div>
                <div className="viewer-overflow-tile muted-overflow">
                  <span>No viewer video yet</span>
                </div>
              </article>
            ) : (
              viewerVideos.map((participant) => (
                <article className="meeting-video-card" key={participant.identity}>
                  <div className="video-card-header">
                    <strong>{participant.name}</strong>
                    <span>{participant.role}</span>
                  </div>
                  <RemoteVideoTile participant={participant} compact onFullscreenError={setFullscreenError} />
                </article>
              ))
            )}
          </div>
        </section>

        <PrimarySpeakerStage speaker={effectiveSpeaker} speakerVideo={speakerVideo} onFullscreenError={setFullscreenError} />
      </section>

      <RemoteAudioMixer participants={remoteVideos} />
    </main>
  );
}

function App() {
  const storedSession = readStoredRobotSession();
  const [view, setView] = useState<"entry" | "room">(() => (storedSession ? "room" : "entry"));
  const [roomName, setRoomName] = useState(() => storedSession?.roomName ?? "robot-room-001");
  const [robotName, setRobotName] = useState(() => storedSession?.robotName ?? "robot-001");
  const [session, setSession] = useState<RoomSession | null>(() => storedSession);
  const [backendState, setBackendState] = useState("idle");
  const [webSocketState, setWebSocketState] = useState("idle");
  const [liveKitState, setLiveKitState] = useState("idle");
  const [publishState, setPublishState] = useState("idle");
  const [publishMicrophone, setPublishMicrophone] = useState(() => Boolean(storedSession?.publishMicrophone));
  const [microphoneState, setMicrophoneState] = useState<RobotMicrophoneState>("idle");
  const [tokenMode, setTokenMode] = useState<"mock" | "livekit" | "none">("none");
  const [localTrack, setLocalTrack] = useState<LocalVideoTrack | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState<ParticipantSpeakingInfo>(EMPTY_SPEAKING);
  const [speaker, setSpeaker] = useState<SpeakerState>(EMPTY_SPEAKER_STATE);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideoInfo[]>([]);
  const [keyboardStatus, setKeyboardStatus] = useState<KeyboardControlStatusMessage | null>(null);
  const [lastRobotControl, setLastRobotControl] = useState<RobotControlMessage | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const localTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const participantsByIdRef = useRef<Map<string, ParticipantPresence>>(new Map());
  const sessionRef = useRef<RoomSession | null>(null);
  const restoringSessionRef = useRef(false);

  function updateRemoteVideos() {
    const room = roomRef.current;
    const currentSession = sessionRef.current;
    if (!room || !currentSession) {
      setRemoteVideos([]);
      setLocalSpeaking(EMPTY_SPEAKING);
      return;
    }

    setRemoteVideos(collectRemoteVideos(room, participantsByIdRef.current, currentSession.participantId));
    setLocalSpeaking(collectLocalSpeaking(room, localAudioTrackRef.current));
  }

  function resetConnections() {
    socketRef.current?.close();
    socketRef.current = null;

    const currentRoom = roomRef.current;
    if (localAudioTrackRef.current) {
      const audioTrack = localAudioTrackRef.current;
      localAudioTrackRef.current = null;
      void currentRoom?.localParticipant.unpublishTrack(audioTrack, true).catch(() => undefined);
      audioTrack.stop();
    }

    void roomRef.current?.disconnect();
    roomRef.current = null;

    localTrackRef.current?.stop();
    localTrackRef.current = null;
    participantsByIdRef.current = new Map();
    sessionRef.current = null;
    setLocalTrack(null);
    setLocalSpeaking(EMPTY_SPEAKING);
    setSpeaker(EMPTY_SPEAKER_STATE);
    setRemoteVideos([]);
    setKeyboardStatus(null);
    setLastRobotControl(null);
    setWebSocketState("closed");
    setLiveKitState("disconnected");
    setPublishState("stopped");
    setMicrophoneState("idle");
  }

  function updateStoredMicrophonePreference(nextPublishMicrophone: boolean) {
    setPublishMicrophone(nextPublishMicrophone);
    const currentSession = sessionRef.current ?? session;
    if (!currentSession) {
      return;
    }

    const nextSession = {
      ...currentSession,
      publishMicrophone: nextPublishMicrophone
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    saveStoredRobotSession(nextSession);
  }

  async function stopRobotMicrophone() {
    const audioTrack = localAudioTrackRef.current;
    localAudioTrackRef.current = null;
    if (audioTrack && roomRef.current) {
      await roomRef.current.localParticipant.unpublishTrack(audioTrack, true).catch(() => undefined);
    }
    audioTrack?.stop();
    setMicrophoneState("not-published");
    setLocalSpeaking(EMPTY_SPEAKING);
    updateStoredMicrophonePreference(false);
  }

  async function leaveRoom() {
    const currentSession = sessionRef.current ?? session;
    if (currentSession?.clientSessionId) {
      await leaveRobot(currentSession.roomName, currentSession.participantId, currentSession.clientSessionId).catch(() => undefined);
    }
    resetConnections();
    clearStoredRobotSession();
    clearRobotClientSessionId();
    setSession(null);
    setView("entry");
    setError("");
    setBackendState("idle");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");
    setTokenMode("none");
  }

  function forceExit(message: string) {
    resetConnections();
    clearStoredRobotSession();
    clearRobotClientSessionId();
    setSession(null);
    setView("entry");
    setBackendState("idle");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");
    setTokenMode("none");
    setError(message);
  }

  async function publishRobotMicrophone(room: Room, robotId: string, shouldPublishMicrophone: boolean) {
    if (!shouldPublishMicrophone) {
      setMicrophoneState("not-published");
      return;
    }

    if (localAudioTrackRef.current) {
      setMicrophoneState("publishing");
      updateStoredMicrophonePreference(true);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneState("unsupported");
      setError("Browser does not support microphone API. Use a modern browser and open the page through HTTPS or localhost.");
      return;
    }

    setMicrophoneState("requesting");
    let audioTrack: LocalAudioTrack | null = null;
    try {
      audioTrack = await createLocalAudioTrack();
      await room.localParticipant.publishTrack(audioTrack, {
        source: Track.Source.Microphone,
        name: `${robotId}-microphone`
      });
      localAudioTrackRef.current = audioTrack;
      setMicrophoneState("publishing");
      setLocalSpeaking(collectLocalSpeaking(room, audioTrack));
      updateStoredMicrophonePreference(true);
    } catch (error) {
      audioTrack?.stop();
      if (localAudioTrackRef.current === audioTrack) {
        localAudioTrackRef.current = null;
      }
      const microphoneError = classifyMicrophoneError(error);
      setMicrophoneState(microphoneError.state);
      setError(microphoneError.message);
    }
  }

  async function startRobotMicrophone() {
    const room = roomRef.current;
    const currentSession = sessionRef.current ?? session;
    if (!room || !currentSession || liveKitState !== "connected") {
      setError("LiveKit must be connected before publishing the robot microphone.");
      return;
    }

    setError("");
    await publishRobotMicrophone(room, currentSession.robotId, true);
  }

  async function enterRoom(_mode: "create" | "join", options: { restoreSession?: RoomSession } = {}) {
    const restoredSession = options.restoreSession;
    const trimmedRoomName = (restoredSession?.roomName ?? roomName).trim();
    const trimmedRobotName = (restoredSession?.robotName ?? robotName).trim();
    const savedPublishMicrophone = restoredSession?.publishMicrophone ?? publishMicrophone;
    const shouldPublishMicrophone = savedPublishMicrophone;
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
    setRoomName(trimmedRoomName);
    setRobotName(trimmedRobotName);
    setPublishMicrophone(savedPublishMicrophone);
    setBackendState("joining");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");
    setMicrophoneState(shouldPublishMicrophone ? "requesting" : "not-published");

    try {
      validateRuntimeConfig();
      const clientSessionId = restoredSession?.clientSessionId ?? getOrCreateRobotClientSessionId();
      const joinResponse = await joinRobot(trimmedRoomName, trimmedRobotName, {
        previousParticipantId: restoredSession?.participantId,
        clientSessionId
      });
      const nextSession = {
        ...joinResponse,
        robotName: trimmedRobotName,
        publishMicrophone: savedPublishMicrophone
      };
      setSession(nextSession);
      sessionRef.current = nextSession;
      saveStoredRobotSession(nextSession);
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

        if (isServerErrorMessage(message)) {
          if (message.code === "PARTICIPANT_KICKED" || message.code === "ROOM_CLOSED") {
            forceExit(`${message.code}: ${message.message}`);
            return;
          }

          setError(`${message.code}: ${message.message}`);
          return;
        }

        if (isKeyboardControlStatusMessage(message)) {
          setKeyboardStatus(message);
          return;
        }

        if (isSpeakerUpdateMessage(message)) {
          setSpeaker({
            currentSpeaker: message.currentSpeaker,
            currentSpeakerId: message.currentSpeakerId,
            currentSpeakerName: message.currentSpeakerName,
            queue: message.queue
          });
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
        setMicrophoneState("not-published");
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
        setLocalSpeaking(EMPTY_SPEAKING);
      });
      room.on(RoomEvent.ParticipantConnected, updateRemoteVideos);
      room.on(RoomEvent.ParticipantDisconnected, updateRemoteVideos);
      room.on(RoomEvent.TrackSubscribed, updateRemoteVideos);
      room.on(RoomEvent.TrackUnsubscribed, updateRemoteVideos);
      room.on(RoomEvent.TrackPublished, updateRemoteVideos);
      room.on(RoomEvent.TrackUnpublished, updateRemoteVideos);
      room.on(RoomEvent.TrackMuted, updateRemoteVideos);
      room.on(RoomEvent.TrackUnmuted, updateRemoteVideos);
      room.on(RoomEvent.ActiveSpeakersChanged, updateRemoteVideos);

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
      await publishRobotMicrophone(room, joinResponse.robotId, shouldPublishMicrophone);
      updateRemoteVideos();
    } catch (error) {
      if (restoredSession) {
        const fallbackSession = sessionRef.current ?? restoredSession;
        sessionRef.current = fallbackSession;
        setSession(fallbackSession);
        saveStoredRobotSession(fallbackSession);
        setView("room");
        setBackendState((current) => (current === "joining" ? "restore failed" : current));
        setWebSocketState((current) => (current === "idle" ? "closed" : current));
        setLiveKitState((current) => (current === "idle" ? "disconnected" : current));
      }
      setError(error instanceof Error ? error.message : "Robot publisher failed");
      setPublishState("error");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const stored = readStoredRobotSession();
    if (!stored || restoringSessionRef.current) {
      return;
    }

    restoringSessionRef.current = true;
    void enterRoom("join", { restoreSession: stored }).finally(() => {
      restoringSessionRef.current = false;
    });
  }, []);

  useEffect(() => resetConnections, []);

  if (view === "entry" || !session) {
    return (
      <EntryView
        robotName={robotName}
        roomName={roomName}
        publishMicrophone={publishMicrophone}
        error={error}
        pending={pending}
        onRobotNameChange={setRobotName}
        onRoomNameChange={setRoomName}
        onPublishMicrophoneChange={setPublishMicrophone}
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
      microphoneState={microphoneState}
      tokenMode={tokenMode}
      localTrack={localTrack}
      localSpeaking={localSpeaking}
      speaker={speaker}
      remoteVideos={remoteVideos}
      error={error}
      keyboardStatus={keyboardStatus}
      lastRobotControl={lastRobotControl}
      onStartMicrophone={startRobotMicrophone}
      onStopMicrophone={stopRobotMicrophone}
      onLeave={leaveRoom}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
