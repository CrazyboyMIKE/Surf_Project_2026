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
type MicrophoneDeviceListState = "idle" | "checking" | "ready" | "permission-denied" | "not-found" | "unsupported" | "error";
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
  requestedAt?: number;
};

type SpeakerState = {
  currentSpeaker?: SpeakerParticipant;
  currentSpeakerId?: string;
  currentSpeakerName?: string;
  currentSpeakerStartedAt?: number;
  queue: SpeakerParticipant[];
};

type SpeakerUpdateMessage = {
  type: "speaker_update";
  roomName: string;
  currentSpeaker?: SpeakerParticipant;
  currentSpeakerId?: string;
  currentSpeakerName?: string;
  currentSpeakerStartedAt?: number;
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
  publishAudio: boolean;
  microphoneDeviceId: string;
  selectedMicrophoneDeviceId: string;
};

type MicrophoneDeviceInfo = {
  deviceId: string;
  label: string;
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
const ROBOT_SESSION_STORAGE_KEY = "livekitCloudRobotSession";
const ROBOT_CLIENT_SESSION_STORAGE_KEY = "livekitCloudRobotClientSessionId";
const LEGACY_ROBOT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.robot-session";
const LEGACY_ROBOT_CLIENT_SESSION_STORAGE_KEY = "livekit-cloud-mvp.robot-client-session-id";
const ROBOT_STORED_SESSION_VERSION = 2;
const ROBOT_STORED_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const EMPTY_SPEAKING: ParticipantSpeakingInfo = {
  hasAudioTrack: false,
  isSpeaking: false,
  audioLevel: 0
};
const EMPTY_SPEAKER_STATE: SpeakerState = {
  queue: []
};
const REMOTE_VIDEO_SYNC_DELAY_MS = 160;
const MIN_ROBOT_VIEWPORT_HEIGHT = 280;
const MIN_ROBOT_TOP_STRIP_HEIGHT = 88;
const MAX_ROBOT_TOP_STRIP_HEIGHT = 230;
const ROBOT_CAMERA_LOW_POWER_PROFILE = {
  capture: {
    resolution: {
      width: 640,
      height: 480,
      frameRate: 15,
      aspectRatio: 4 / 3
    }
  },
  encoding: {
    maxBitrate: 500_000,
    maxFramerate: 15
  }
};
const ROBOT_CAMERA_DEFAULT_PROFILE = {
  capture: {
    resolution: {
      width: 960,
      height: 540,
      frameRate: 20,
      aspectRatio: 16 / 9
    }
  },
  encoding: {
    maxBitrate: 800_000,
    maxFramerate: 20
  }
};

type StoredRobotSessionEnvelope = {
  version: number;
  savedAt: number;
  session: RoomSession;
};

type RobotRoute = "/" | "/login" | "/room";

function isAndroidFirefoxBrowser(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("android") && (userAgent.includes("firefox") || userAgent.includes("fennec"));
}

function getRobotCameraProfile() {
  return isAndroidFirefoxBrowser() ? ROBOT_CAMERA_LOW_POWER_PROFILE : ROBOT_CAMERA_DEFAULT_PROFILE;
}

function readPersistentValue(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePersistentValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in locked-down browsers; the room still works until refresh.
  }
}

function removePersistentValue(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore legacy storage cleanup failures.
  }
}

function setRobotViewportCssVariables(): void {
  const measuredHeight = window.visualViewport?.height ?? window.innerHeight;
  const appHeight = Math.max(MIN_ROBOT_VIEWPORT_HEIGHT, Math.round(measuredHeight || window.innerHeight || MIN_ROBOT_VIEWPORT_HEIGHT));
  const topStripHeight = Math.max(
    MIN_ROBOT_TOP_STRIP_HEIGHT,
    Math.min(MAX_ROBOT_TOP_STRIP_HEIGHT, Math.round(appHeight * 0.22))
  );

  document.documentElement.style.setProperty("--robot-app-height", `${appHeight}px`);
  document.documentElement.style.setProperty("--robot-strip-height", `${topStripHeight}px`);
}

function useRobotViewportCssVariables(): void {
  useEffect(() => {
    let animationFrame = 0;
    const visualViewport = window.visualViewport;

    const scheduleUpdate = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        setRobotViewportCssVariables();
      });
    };

    setRobotViewportCssVariables();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);
    document.addEventListener("visibilitychange", scheduleUpdate);
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.removeEventListener("pageshow", scheduleUpdate);
      document.removeEventListener("visibilitychange", scheduleUpdate);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, []);
}

function validateRuntimeConfig() {
  if (!/^https?:\/\//.test(API_BASE_URL)) {
    throw new Error("API address configuration error: VITE_API_BASE_URL must start with http:// or https://.");
  }

  if (!/^wss?:\/\//.test(WS_URL)) {
    throw new Error("WebSocket address configuration error: VITE_WS_BASE_URL must start with ws:// or wss://.");
  }
}

function isFreshStoredRobotSession(savedAt: number): boolean {
  const now = Date.now();
  return Number.isFinite(savedAt) && savedAt <= now + 60_000 && now - savedAt <= ROBOT_STORED_SESSION_TTL_MS;
}

function normalizeStoredRobotSession(value: unknown): RoomSession | null {
  const parsed = value as Partial<RoomSession>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
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

  const publishAudio =
    typeof parsed.publishAudio === "boolean"
      ? parsed.publishAudio
      : typeof parsed.publishMicrophone === "boolean"
        ? parsed.publishMicrophone
        : true;
  const selectedMicrophoneDeviceId =
    typeof parsed.selectedMicrophoneDeviceId === "string"
      ? parsed.selectedMicrophoneDeviceId
      : typeof parsed.microphoneDeviceId === "string"
        ? parsed.microphoneDeviceId
        : "";

  return {
    ...parsed,
    online: Boolean(parsed.online),
    tokenMode: parsed.tokenMode === "livekit" ? "livekit" : "mock",
    publishMicrophone: publishAudio,
    publishAudio,
    microphoneDeviceId: selectedMicrophoneDeviceId,
    selectedMicrophoneDeviceId
  } as RoomSession;
}

function readStoredRobotSession(): RoomSession | null {
  try {
    const raw = readPersistentValue(ROBOT_SESSION_STORAGE_KEY);
    if (!raw) {
      removePersistentValue(LEGACY_ROBOT_SESSION_STORAGE_KEY);
      removePersistentValue(LEGACY_ROBOT_CLIENT_SESSION_STORAGE_KEY);
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    const envelope = parsed as Partial<StoredRobotSessionEnvelope>;
    if (
      typeof envelope === "object" &&
      envelope !== null &&
      envelope.version === ROBOT_STORED_SESSION_VERSION &&
      typeof envelope.savedAt === "number"
    ) {
      const storedSession = normalizeStoredRobotSession(envelope.session);
      if (storedSession && isFreshStoredRobotSession(envelope.savedAt)) {
        return storedSession;
      }

      clearStoredRobotSession();
      clearRobotClientSessionId();
      return null;
    }

    if (normalizeStoredRobotSession(parsed)) {
      clearStoredRobotSession();
      clearRobotClientSessionId();
    }

    return null;
  } catch {
    clearStoredRobotSession();
    clearRobotClientSessionId();
    return null;
  }
}

function saveStoredRobotSession(session: RoomSession): void {
  writePersistentValue(
    ROBOT_SESSION_STORAGE_KEY,
    JSON.stringify({
      version: ROBOT_STORED_SESSION_VERSION,
      savedAt: Date.now(),
      session
    } satisfies StoredRobotSessionEnvelope)
  );
  if (session.clientSessionId) {
    writePersistentValue(ROBOT_CLIENT_SESSION_STORAGE_KEY, session.clientSessionId);
  }
}

function clearStoredRobotSession(): void {
  removePersistentValue(ROBOT_SESSION_STORAGE_KEY);
  removePersistentValue(LEGACY_ROBOT_SESSION_STORAGE_KEY);
}

function clearRobotClientSessionId(): void {
  removePersistentValue(ROBOT_CLIENT_SESSION_STORAGE_KEY);
  removePersistentValue(LEGACY_ROBOT_CLIENT_SESSION_STORAGE_KEY);
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

function getCurrentRobotRoute(): RobotRoute {
  const pathname = window.location.pathname;
  if (pathname === "/login" || pathname === "/room") {
    return pathname;
  }

  return "/";
}

function navigateToRobotRoute(route: Exclude<RobotRoute, "/">, options: { replace?: boolean } = {}): void {
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

function useRobotRoute(): RobotRoute {
  const [route, setRoute] = useState<RobotRoute>(() => getCurrentRobotRoute());

  useEffect(() => {
    const syncRoute = () => setRoute(getCurrentRobotRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  return route;
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

function collectMicrophoneDevices(devices: MediaDeviceInfo[]): MicrophoneDeviceInfo[] {
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label.trim() || (device.deviceId === "default" ? "Default microphone" : `Microphone ${index + 1}`)
    }));
}

function describeMicrophoneState(state: RobotMicrophoneState): string {
  switch (state) {
    case "idle":
      return "Microphone idle";
    case "not-published":
      return "Microphone off";
    case "requesting":
      return "Requesting microphone";
    case "publishing":
      return "Microphone publishing";
    case "muted/off":
      return "Microphone muted";
    case "permission-denied":
      return "Microphone permission denied";
    case "device-not-found":
      return "No microphone found";
    case "unsupported":
      return "Microphone unsupported";
    case "publish-failed":
      return "Microphone failed";
  }
}

function describeMicrophoneDeviceState(state: MicrophoneDeviceListState, deviceCount: number): string {
  switch (state) {
    case "idle":
      return "Click Refresh devices to choose a microphone.";
    case "checking":
      return "Checking microphone devices...";
    case "ready":
      return deviceCount === 1 ? "1 microphone available." : `${deviceCount} microphones available.`;
    case "permission-denied":
      return "Microphone permission denied.";
    case "not-found":
      return "No microphone devices found.";
    case "unsupported":
      return "Microphone device selection is not supported by this browser.";
    case "error":
      return "Could not refresh microphone devices.";
  }
}

function createMicrophoneAudioOptions(deviceId: string) {
  return deviceId ? { deviceId } : undefined;
}

function createRobotCameraOptions(cameraProfile: ReturnType<typeof getRobotCameraProfile>) {
  return cameraProfile.capture;
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

function normalizeAudioLevel(audioLevel: number): number {
  return Math.round(Math.min(1, Math.max(0, audioLevel)) * 20) / 20;
}

function getVideoTrackStableId(track: RemoteVideoTrack | LocalVideoTrack | null): string {
  if (!track) {
    return "no-video";
  }

  return ("sid" in track && typeof track.sid === "string" && track.sid) || track.mediaStreamTrack.id;
}

function getRemoteVideoTileKey(participant: RemoteVideoInfo): string {
  return `${participant.identity}:${getVideoTrackStableId(participant.videoTrack)}`;
}

function areSpeakingInfosEqual(left: ParticipantSpeakingInfo, right: ParticipantSpeakingInfo): boolean {
  return left.hasAudioTrack === right.hasAudioTrack && left.isSpeaking === right.isSpeaking && left.audioLevel === right.audioLevel;
}

function areRemoteVideoInfosEqual(left: RemoteVideoInfo, right: RemoteVideoInfo): boolean {
  return (
    left.identity === right.identity &&
    left.name === right.name &&
    left.role === right.role &&
    left.videoTrack === right.videoTrack &&
    left.audioTrack === right.audioTrack &&
    left.hasAudioTrack === right.hasAudioTrack &&
    left.isSpeaking === right.isSpeaking &&
    left.audioLevel === right.audioLevel
  );
}

function areRemoteVideoListsEqual(left: RemoteVideoInfo[], right: RemoteVideoInfo[]): boolean {
  return left.length === right.length && left.every((item, index) => areRemoteVideoInfosEqual(item, right[index]));
}

function areSpeakerParticipantsEqual(left?: SpeakerParticipant, right?: SpeakerParticipant): boolean {
  return (
    left?.id === right?.id &&
    left?.name === right?.name &&
    left?.role === right?.role &&
    left?.connected === right?.connected &&
    left?.requestedAt === right?.requestedAt
  );
}

function areSpeakerStatesEqual(left: SpeakerState, right: SpeakerState): boolean {
  return (
    left.currentSpeakerId === right.currentSpeakerId &&
    left.currentSpeakerName === right.currentSpeakerName &&
    left.currentSpeakerStartedAt === right.currentSpeakerStartedAt &&
    areSpeakerParticipantsEqual(left.currentSpeaker, right.currentSpeaker) &&
    left.queue.length === right.queue.length &&
    left.queue.every((item, index) => areSpeakerParticipantsEqual(item, right.queue[index]))
  );
}

function configureVideoElement(videoElement: HTMLVideoElement, muted: boolean): void {
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.muted = muted;
  videoElement.defaultMuted = muted;
  videoElement.preload = "auto";
  videoElement.setAttribute("playsinline", "");
  videoElement.setAttribute("webkit-playsinline", "true");
  if (muted) {
    videoElement.setAttribute("muted", "");
  } else {
    videoElement.removeAttribute("muted");
  }
}

function attachLiveKitVideoTrack(track: RemoteVideoTrack, videoElement: HTMLVideoElement, muted: boolean): () => void {
  let disposed = false;
  const retryTimers: Array<ReturnType<typeof window.setTimeout>> = [];

  configureVideoElement(videoElement, muted);
  track.attach(videoElement);

  const playVideo = () => {
    if (disposed) {
      return;
    }

    void videoElement.play().catch(() => {
      // Firefox Android can delay media playback around focus or visibility changes.
    });
  };

  const playWhenVisible = () => {
    if (document.visibilityState !== "hidden") {
      playVideo();
    }
  };

  videoElement.addEventListener("loadedmetadata", playVideo);
  videoElement.addEventListener("loadeddata", playVideo);
  videoElement.addEventListener("canplay", playVideo);
  document.addEventListener("visibilitychange", playWhenVisible);
  window.addEventListener("focus", playVideo);
  window.addEventListener("pageshow", playVideo);

  window.requestAnimationFrame(playVideo);
  retryTimers.push(window.setTimeout(playVideo, 250), window.setTimeout(playVideo, 1000));

  return () => {
    disposed = true;
    retryTimers.forEach((timer) => window.clearTimeout(timer));
    videoElement.removeEventListener("loadedmetadata", playVideo);
    videoElement.removeEventListener("loadeddata", playVideo);
    videoElement.removeEventListener("canplay", playVideo);
    document.removeEventListener("visibilitychange", playWhenVisible);
    window.removeEventListener("focus", playVideo);
    window.removeEventListener("pageshow", playVideo);
    videoElement.pause();
    track.detach(videoElement);
  };
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
        audioLevel: audioTrack ? normalizeAudioLevel(participant.audioLevel) : 0
      }
    ];
  });
}

function collectLocalSpeaking(room: Room, audioTrack: LocalAudioTrack | null): ParticipantSpeakingInfo {
  const hasAudioTrack = Boolean(audioTrack);
  return {
    hasAudioTrack,
    isSpeaking: hasAudioTrack && room.localParticipant.isSpeaking,
    audioLevel: hasAudioTrack ? normalizeAudioLevel(room.localParticipant.audioLevel) : 0
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
  const videoTrack = participant.videoTrack;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoTrack || !videoElement) {
      return;
    }

    return attachLiveKitVideoTrack(videoTrack, videoElement, true);
  }, [videoTrack]);

  return (
    <article
      className={`${compact ? "remote-video-tile compact-video-tile" : "remote-video-tile"}${
        participant.hasAudioTrack && participant.isSpeaking ? " is-speaking" : ""
      }`}
      ref={tileRef}
    >
      {participant.videoTrack ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="video-empty">Waiting for video</div>}
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
    const retryTimers: Array<ReturnType<typeof window.setTimeout>> = [];
    const mediaStream = new MediaStream([track.mediaStreamTrack]);
    setPreviewWarning("");
    configureVideoElement(videoElement, true);
    videoElement.srcObject = mediaStream;

    const updatePreviewAspectRatio = () => {
      if (disposed) {
        return;
      }

      const nextAspectRatio = readTrackAspectRatio(track, videoElement);
      setPreviewAspectRatio((current) => (current === nextAspectRatio ? current : nextAspectRatio));
    };

    const playPreview = () => {
      if (disposed) {
        return;
      }

      updatePreviewAspectRatio();
      void videoElement.play().then(
        () => {
          if (!disposed) {
            setPreviewWarning((current) => (current ? "" : current));
          }
        },
        () => {
          if (!disposed) {
            setPreviewWarning((current) => current || "Preview paused by browser. Tap fullscreen or retry camera.");
          }
        }
      );
    };

    const playWhenVisible = () => {
      if (document.visibilityState !== "hidden") {
        playPreview();
      }
    };

    if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
      playPreview();
    } else {
      videoElement.addEventListener("loadedmetadata", playPreview);
    }

    videoElement.addEventListener("loadeddata", updatePreviewAspectRatio);
    videoElement.addEventListener("canplay", playPreview);
    document.addEventListener("visibilitychange", playWhenVisible);
    window.addEventListener("focus", playPreview);
    window.addEventListener("pageshow", playPreview);

    window.requestAnimationFrame(playPreview);
    retryTimers.push(window.setTimeout(playPreview, 250), window.setTimeout(playPreview, 1000));

    return () => {
      disposed = true;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      videoElement.removeEventListener("loadedmetadata", playPreview);
      videoElement.removeEventListener("loadeddata", updatePreviewAspectRatio);
      videoElement.removeEventListener("canplay", playPreview);
      document.removeEventListener("visibilitychange", playWhenVisible);
      window.removeEventListener("focus", playPreview);
      window.removeEventListener("pageshow", playPreview);
      videoElement.pause();
      if (videoElement.srcObject === mediaStream) {
        videoElement.srcObject = null;
      }
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
  const audioTrack = participant.audioTrack;
  const participantId = participant.identity;
  const volume = participant.role === "controller" ? 1 : 0.9;

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !audioTrack) {
      return;
    }

    let disposed = false;
    const retryTimers: Array<ReturnType<typeof window.setTimeout>> = [];

    audioTrack.attach(audioElement);
    audioElement.autoplay = true;
    audioElement.preload = "auto";
    audioElement.muted = false;
    audioElement.volume = volume;

    const playAudio = () => {
      if (disposed) {
        return;
      }

      void audioElement.play().then(
        () => onPlaying(participantId),
        () => onBlocked(participantId)
      );
    };

    const playWhenVisible = () => {
      if (document.visibilityState !== "hidden") {
        playAudio();
      }
    };

    audioElement.addEventListener("canplay", playAudio);
    document.addEventListener("visibilitychange", playWhenVisible);
    window.addEventListener("focus", playAudio);
    window.addEventListener("pageshow", playAudio);
    playAudio();
    retryTimers.push(window.setTimeout(playAudio, 250), window.setTimeout(playAudio, 1000));

    return () => {
      disposed = true;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      audioElement.removeEventListener("canplay", playAudio);
      document.removeEventListener("visibilitychange", playWhenVisible);
      window.removeEventListener("focus", playAudio);
      window.removeEventListener("pageshow", playAudio);
      audioTrack.detach(audioElement);
    };
  }, [audioTrack, onBlocked, onPlaying, participantId, playbackAttempt, volume]);

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
  const speakerVideoTrack = speakerVideo?.videoTrack ?? null;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!speakerVideoTrack || !videoElement) {
      return;
    }

    return attachLiveKitVideoTrack(speakerVideoTrack, videoElement, true);
  }, [speakerVideoTrack]);

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
          <video ref={videoRef} autoPlay muted playsInline />
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

function MicrophoneDevicePanel({
  devices,
  selectedDeviceId,
  deviceListState,
  microphoneState,
  pending,
  onRefresh,
  onDeviceChange
}: {
  devices: MicrophoneDeviceInfo[];
  selectedDeviceId: string;
  deviceListState: MicrophoneDeviceListState;
  microphoneState: RobotMicrophoneState;
  pending: boolean;
  onRefresh: () => void;
  onDeviceChange: (deviceId: string) => void;
}) {
  return (
    <div className="microphone-device-panel" aria-label="Microphone device selection">
      <div className="microphone-device-header">
        <strong>Select microphone</strong>
        <span>{describeMicrophoneState(microphoneState)}</span>
      </div>
      <div className="microphone-device-controls">
        <label>
          Microphone
          <select value={selectedDeviceId} disabled={pending || devices.length === 0} onChange={(event) => onDeviceChange(event.target.value)}>
            <option value="">Default microphone</option>
            {devices.map((device, index) => (
              <option key={`${device.deviceId}-${index}`} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost-button" disabled={pending || deviceListState === "checking"} onClick={onRefresh}>
          {deviceListState === "checking" ? "Refreshing..." : "Refresh devices"}
        </button>
      </div>
      <p className="microphone-device-status">{describeMicrophoneDeviceState(deviceListState, devices.length)}</p>
    </div>
  );
}

function EntryView({
  robotName,
  roomName,
  publishMicrophone,
  microphoneDevices,
  selectedMicrophoneDeviceId,
  microphoneDeviceState,
  microphoneState,
  error,
  pending,
  onRobotNameChange,
  onRoomNameChange,
  onPublishMicrophoneChange,
  onRefreshMicrophones,
  onMicrophoneDeviceChange,
  onEnter
}: {
  robotName: string;
  roomName: string;
  publishMicrophone: boolean;
  microphoneDevices: MicrophoneDeviceInfo[];
  selectedMicrophoneDeviceId: string;
  microphoneDeviceState: MicrophoneDeviceListState;
  microphoneState: RobotMicrophoneState;
  error: string;
  pending: boolean;
  onRobotNameChange: (value: string) => void;
  onRoomNameChange: (value: string) => void;
  onPublishMicrophoneChange: (value: boolean) => void;
  onRefreshMicrophones: () => void;
  onMicrophoneDeviceChange: (deviceId: string) => void;
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
            Robot name
            <input
              value={robotName}
              onChange={(event) => onRobotNameChange(event.target.value)}
              placeholder="Enter robot name"
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

          <MicrophoneDevicePanel
            devices={microphoneDevices}
            selectedDeviceId={selectedMicrophoneDeviceId}
            deviceListState={microphoneDeviceState}
            microphoneState={microphoneState}
            pending={pending}
            onRefresh={onRefreshMicrophones}
            onDeviceChange={onMicrophoneDeviceChange}
          />

          <div className="entry-actions">
            <button type="button" disabled={pending} onClick={() => onEnter("create")}>
              Create room
            </button>
            <button type="submit" disabled={pending}>
              Join room
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
  localTrack,
  localSpeaking,
  speaker,
  remoteVideos,
  error
}: {
  session: RoomSession;
  localTrack: LocalVideoTrack | null;
  localSpeaking: ParticipantSpeakingInfo;
  speaker: SpeakerState;
  remoteVideos: RemoteVideoInfo[];
  error: string;
}) {
  const controllerVideos = remoteVideos.filter((participant) => participant.role === "controller");
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
  const topStripVideos = fallbackSpeaker
    ? remoteVideos.filter((participant) => participant.identity !== fallbackSpeaker.id)
    : remoteVideos;
  const [fullscreenError, setFullscreenError] = useState("");

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <div>
          <p className="eyebrow">Robot Room</p>
          <h1>{session.roomName}</h1>
          <p className="subtle">Robot user: {session.robotName}</p>
        </div>
      </header>

      <div className="room-alerts" aria-live="polite">
        {error ? <p className="error">{error}</p> : null}
        {fullscreenError ? <p className="error">{fullscreenError}</p> : null}
      </div>

      <section className="meeting-layout" aria-label="Robot meeting layout">
        <section className="thumbnail-strip" aria-labelledby="thumbnail-title">
          <div className="panel-heading">
            <h2 id="thumbnail-title">Other videos</h2>
            <span>{topStripVideos.length} remote</span>
          </div>
          <div className="video-card-grid" aria-label="Robot and other participant video cards">
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

            {topStripVideos.length === 0 ? (
              <article className="meeting-video-card empty-meeting-card">
                <div className="video-card-header">
                  <strong>Participants</strong>
                  <span>empty</span>
                </div>
                <div className="viewer-overflow-tile muted-overflow">
                  <span>No other video yet</span>
                </div>
              </article>
            ) : (
              topStripVideos.map((participant) => (
                <article className="meeting-video-card" key={participant.identity}>
                  <div className="video-card-header">
                    <strong>{participant.name}</strong>
                    <span>{participant.role}</span>
                  </div>
                  <RemoteVideoTile
                    key={getRemoteVideoTileKey(participant)}
                    participant={participant}
                    compact
                    onFullscreenError={setFullscreenError}
                  />
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
  useRobotViewportCssVariables();

  const route = useRobotRoute();
  const [initialStoredSession] = useState<RoomSession | null>(() =>
    getCurrentRobotRoute() === "/room" ? readStoredRobotSession() : null
  );
  const [roomName, setRoomName] = useState(() => initialStoredSession?.roomName ?? "robot-room-001");
  const [robotName, setRobotName] = useState(() => initialStoredSession?.robotName ?? "robot-001");
  const [session, setSession] = useState<RoomSession | null>(null);
  const [backendState, setBackendState] = useState("idle");
  const [webSocketState, setWebSocketState] = useState("idle");
  const [liveKitState, setLiveKitState] = useState("idle");
  const [publishState, setPublishState] = useState("idle");
  const [publishMicrophone, setPublishMicrophone] = useState(() => initialStoredSession?.publishAudio ?? true);
  const [microphoneState, setMicrophoneState] = useState<RobotMicrophoneState>("idle");
  const [microphoneDevices, setMicrophoneDevices] = useState<MicrophoneDeviceInfo[]>([]);
  const [selectedMicrophoneDeviceId, setSelectedMicrophoneDeviceId] = useState(() => initialStoredSession?.microphoneDeviceId ?? "");
  const [microphoneDeviceState, setMicrophoneDeviceState] = useState<MicrophoneDeviceListState>("idle");
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
  const remoteVideosRef = useRef<RemoteVideoInfo[]>([]);
  const localSpeakingRef = useRef<ParticipantSpeakingInfo>(EMPTY_SPEAKING);
  const remoteVideoSyncTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  function clearRemoteVideoSyncTimer() {
    if (remoteVideoSyncTimerRef.current) {
      window.clearTimeout(remoteVideoSyncTimerRef.current);
      remoteVideoSyncTimerRef.current = null;
    }
  }

  function applyRemoteVideos(nextRemoteVideos: RemoteVideoInfo[]) {
    if (areRemoteVideoListsEqual(remoteVideosRef.current, nextRemoteVideos)) {
      return;
    }

    remoteVideosRef.current = nextRemoteVideos;
    setRemoteVideos(nextRemoteVideos);
  }

  function applyLocalSpeaking(nextLocalSpeaking: ParticipantSpeakingInfo) {
    if (areSpeakingInfosEqual(localSpeakingRef.current, nextLocalSpeaking)) {
      return;
    }

    localSpeakingRef.current = nextLocalSpeaking;
    setLocalSpeaking(nextLocalSpeaking);
  }

  function updateRemoteVideos() {
    const room = roomRef.current;
    const currentSession = sessionRef.current;
    if (!room || !currentSession) {
      applyRemoteVideos([]);
      applyLocalSpeaking(EMPTY_SPEAKING);
      return;
    }

    applyRemoteVideos(collectRemoteVideos(room, participantsByIdRef.current, currentSession.participantId));
    applyLocalSpeaking(collectLocalSpeaking(room, localAudioTrackRef.current));
  }

  function scheduleRemoteVideosSync() {
    if (remoteVideoSyncTimerRef.current) {
      return;
    }

    remoteVideoSyncTimerRef.current = window.setTimeout(() => {
      remoteVideoSyncTimerRef.current = null;
      updateRemoteVideos();
    }, REMOTE_VIDEO_SYNC_DELAY_MS);
  }

  function resetConnections() {
    clearRemoteVideoSyncTimer();
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
    applyLocalSpeaking(EMPTY_SPEAKING);
    setSpeaker(EMPTY_SPEAKER_STATE);
    applyRemoteVideos([]);
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
      publishMicrophone: nextPublishMicrophone,
      publishAudio: nextPublishMicrophone
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    saveStoredRobotSession(nextSession);
  }

  function updateStoredMicrophoneDevice(nextDeviceId: string) {
    setSelectedMicrophoneDeviceId(nextDeviceId);
    const currentSession = sessionRef.current ?? session;
    if (!currentSession) {
      return;
    }

    const nextSession = {
      ...currentSession,
      microphoneDeviceId: nextDeviceId,
      selectedMicrophoneDeviceId: nextDeviceId
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    saveStoredRobotSession(nextSession);
  }

  async function refreshMicrophoneDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicrophoneDevices([]);
      setMicrophoneDeviceState("unsupported");
      setError("Microphone device selection is not supported by this browser.");
      return;
    }

    setMicrophoneDeviceState("checking");
    setError("");
    let permissionStream: MediaStream | null = null;

    try {
      if (navigator.mediaDevices.getUserMedia) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      const nextDevices = collectMicrophoneDevices(await navigator.mediaDevices.enumerateDevices());
      setMicrophoneDevices(nextDevices);
      setMicrophoneDeviceState(nextDevices.length > 0 ? "ready" : "not-found");
      if (selectedMicrophoneDeviceId && !nextDevices.some((device) => device.deviceId === selectedMicrophoneDeviceId)) {
        updateStoredMicrophoneDevice("");
      }
    } catch (error) {
      const microphoneError = classifyMicrophoneError(error);
      setMicrophoneDevices([]);
      setMicrophoneDeviceState(
        microphoneError.state === "permission-denied"
          ? "permission-denied"
          : microphoneError.state === "device-not-found"
            ? "not-found"
            : "error"
      );
      setError(microphoneError.message);
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }

  async function releaseRobotMicrophoneTrack(room: Room | null) {
    const audioTrack = localAudioTrackRef.current;
    localAudioTrackRef.current = null;
    if (audioTrack && room) {
      await room.localParticipant.unpublishTrack(audioTrack, true).catch(() => undefined);
    }
    audioTrack?.stop();
    applyLocalSpeaking(EMPTY_SPEAKING);
  }

  async function stopRobotMicrophone() {
    await releaseRobotMicrophoneTrack(roomRef.current);
    setMicrophoneState("not-published");
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
    navigateToRobotRoute("/login", { replace: true });
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
    navigateToRobotRoute("/login", { replace: true });
    setBackendState("idle");
    setWebSocketState("idle");
    setLiveKitState("idle");
    setPublishState("idle");
    setTokenMode("none");
    setError(message);
  }

  async function publishRobotMicrophone(
    room: Room,
    robotId: string,
    shouldPublishMicrophone: boolean,
    microphoneDeviceId = selectedMicrophoneDeviceId
  ) {
    if (!shouldPublishMicrophone) {
      setMicrophoneState("not-published");
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
      await releaseRobotMicrophoneTrack(room);
      audioTrack = await createLocalAudioTrack(createMicrophoneAudioOptions(microphoneDeviceId));
      await room.localParticipant.publishTrack(audioTrack, {
        source: Track.Source.Microphone,
        name: `${robotId}-microphone`
      });
      localAudioTrackRef.current = audioTrack;
      setMicrophoneState("publishing");
      applyLocalSpeaking(collectLocalSpeaking(room, audioTrack));
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

  async function handleMicrophoneDeviceChange(deviceId: string) {
    updateStoredMicrophoneDevice(deviceId);
    const room = roomRef.current;
    const currentSession = sessionRef.current ?? session;
    if (!room || !currentSession || microphoneState !== "publishing") {
      return;
    }

    setError("");
    await publishRobotMicrophone(room, currentSession.robotId, true, deviceId);
  }

  async function startRobotMicrophone() {
    const room = roomRef.current;
    const currentSession = sessionRef.current ?? session;
    if (!room || !currentSession || liveKitState !== "connected") {
      setError("LiveKit must be connected before publishing the robot microphone.");
      return;
    }

    setError("");
    await publishRobotMicrophone(room, currentSession.robotId, true, selectedMicrophoneDeviceId);
  }

  async function enterRoom(_mode: "create" | "join", options: { restoreSession?: RoomSession } = {}) {
    const restoredSession = options.restoreSession;
    const trimmedRoomName = (restoredSession?.roomName ?? roomName).trim();
    const trimmedRobotName = (restoredSession?.robotName ?? robotName).trim();
    const savedPublishMicrophone = restoredSession?.publishAudio ?? restoredSession?.publishMicrophone ?? publishMicrophone;
    const savedMicrophoneDeviceId =
      restoredSession?.selectedMicrophoneDeviceId ?? restoredSession?.microphoneDeviceId ?? selectedMicrophoneDeviceId;
    const shouldPublishMicrophone = savedPublishMicrophone;
    if (!trimmedRobotName) {
      setError("Robot name is required");
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
    setSelectedMicrophoneDeviceId(savedMicrophoneDeviceId);
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
        publishMicrophone: shouldPublishMicrophone,
        publishAudio: shouldPublishMicrophone,
        microphoneDeviceId: savedMicrophoneDeviceId,
        selectedMicrophoneDeviceId: savedMicrophoneDeviceId
      };
      setSession(nextSession);
      sessionRef.current = nextSession;
      saveStoredRobotSession(nextSession);
      navigateToRobotRoute("/room");
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
          scheduleRemoteVideosSync();
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
          const nextSpeaker = {
            currentSpeaker: message.currentSpeaker,
            currentSpeakerId: message.currentSpeakerId,
            currentSpeakerName: message.currentSpeakerName,
            currentSpeakerStartedAt: message.currentSpeakerStartedAt,
            queue: message.queue
          };
          setSpeaker((current) => (areSpeakerStatesEqual(current, nextSpeaker) ? current : nextSpeaker));
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
        adaptiveStream: true,
        dynacast: true
      });
      roomRef.current = room;
      room.on(RoomEvent.ConnectionStateChanged, (state) => setLiveKitState(String(state)));
      room.on(RoomEvent.Connected, () => {
        setLiveKitState("connected");
        updateRemoteVideos();
      });
      room.on(RoomEvent.Disconnected, () => {
        clearRemoteVideoSyncTimer();
        setLiveKitState("disconnected");
        applyRemoteVideos([]);
        applyLocalSpeaking(EMPTY_SPEAKING);
      });
      room.on(RoomEvent.ParticipantConnected, scheduleRemoteVideosSync);
      room.on(RoomEvent.ParticipantDisconnected, scheduleRemoteVideosSync);
      room.on(RoomEvent.TrackSubscribed, scheduleRemoteVideosSync);
      room.on(RoomEvent.TrackUnsubscribed, scheduleRemoteVideosSync);
      room.on(RoomEvent.TrackPublished, scheduleRemoteVideosSync);
      room.on(RoomEvent.TrackUnpublished, scheduleRemoteVideosSync);
      room.on(RoomEvent.TrackMuted, scheduleRemoteVideosSync);
      room.on(RoomEvent.TrackUnmuted, scheduleRemoteVideosSync);
      room.on(RoomEvent.ActiveSpeakersChanged, scheduleRemoteVideosSync);

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
      const cameraProfile = getRobotCameraProfile();
      try {
        videoTrack = await createLocalVideoTrack(createRobotCameraOptions(cameraProfile));
      } catch (error) {
        throw new Error(describeCameraError(error));
      }
      localTrackRef.current = videoTrack;
      setLocalTrack(videoTrack);

      setPublishState("publishing camera");
      try {
        await room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.Camera,
          name: `${joinResponse.robotId}-camera`,
          simulcast: false,
          videoEncoding: cameraProfile.encoding
        });
      } catch (error) {
        throw new Error(describeLiveKitPublishError(error));
      }
      setPublishState("publishing");
      await publishRobotMicrophone(room, joinResponse.robotId, shouldPublishMicrophone, savedMicrophoneDeviceId);
      updateRemoteVideos();
    } catch (error) {
      if (restoredSession) {
        const failedSession = sessionRef.current ?? restoredSession;
        if (failedSession.clientSessionId) {
          await leaveRobot(failedSession.roomName, failedSession.participantId, failedSession.clientSessionId).catch(() => undefined);
        }
        resetConnections();
        clearStoredRobotSession();
        clearRobotClientSessionId();
        setSession(null);
        navigateToRobotRoute("/login", { replace: true });
        setBackendState("idle");
        setWebSocketState("idle");
        setLiveKitState("idle");
        setTokenMode("none");
      }
      setError(
        restoredSession
          ? `Saved room could not be restored. Please join again. ${error instanceof Error ? error.message : ""}`.trim()
          : error instanceof Error
            ? error.message
            : "Robot publisher failed"
      );
      setPublishState(restoredSession ? "idle" : "error");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (route === "/") {
      navigateToRobotRoute(readStoredRobotSession() ? "/room" : "/login", { replace: true });
      return;
    }

    if (route === "/room" && !sessionRef.current && !readStoredRobotSession()) {
      setError("Please join a room first.");
      navigateToRobotRoute("/login", { replace: true });
      return;
    }

    if (route === "/login" && !sessionRef.current && readStoredRobotSession()) {
      navigateToRobotRoute("/room", { replace: true });
    }
  }, [route]);

  useEffect(() => {
    if (route !== "/room" || pending || roomRef.current || socketRef.current) {
      return;
    }

    const stored = readStoredRobotSession();
    if (!stored || restoringSessionRef.current) {
      return;
    }

    restoringSessionRef.current = true;
    void enterRoom("join", { restoreSession: stored }).finally(() => {
      restoringSessionRef.current = false;
    });
  }, [pending, route]);

  useEffect(() => {
    if (route === "/room" || !sessionRef.current) {
      return;
    }

    void leaveRoom();
  }, [route]);

  useEffect(() => resetConnections, []);

  if (route === "/" || (route === "/room" && !session)) {
    return null;
  }

  if (route === "/login") {
    return (
      <EntryView
        robotName={robotName}
        roomName={roomName}
        publishMicrophone={publishMicrophone}
        microphoneDevices={microphoneDevices}
        selectedMicrophoneDeviceId={selectedMicrophoneDeviceId}
        microphoneDeviceState={microphoneDeviceState}
        microphoneState={microphoneState}
        error={error}
        pending={pending}
        onRobotNameChange={setRobotName}
        onRoomNameChange={setRoomName}
        onPublishMicrophoneChange={setPublishMicrophone}
        onRefreshMicrophones={refreshMicrophoneDevices}
        onMicrophoneDeviceChange={(deviceId) => void handleMicrophoneDeviceChange(deviceId)}
        onEnter={enterRoom}
      />
    );
  }

  if (route !== "/room" || !session) {
    return null;
  }

  return (
    <RobotRoomView
      session={session}
      localTrack={localTrack}
      localSpeaking={localSpeaking}
      speaker={speaker}
      remoteVideos={remoteVideos}
      error={error}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
