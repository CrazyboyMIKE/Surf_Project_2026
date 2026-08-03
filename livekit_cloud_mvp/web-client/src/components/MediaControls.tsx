import type { MediaPermissions } from "../types";
import type { LiveKitConnectionState, LocalMediaState } from "../useLiveKitRoom";

type MediaControlsProps = {
  mediaPermissions: MediaPermissions;
  tokenMode: "mock" | "livekit";
  liveKitState: LiveKitConnectionState;
  localAudioState: LocalMediaState;
  localVideoState: LocalMediaState;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
};

function describeProblem(state: LocalMediaState, kind: "Mic" | "Camera"): string {
  if (state === "permission-denied") {
    return `${kind} permission denied`;
  }
  if (state === "device-not-found") {
    return `${kind} not found`;
  }
  if (state === "not-allowed") {
    return `${kind} unavailable`;
  }
  if (state === "error") {
    return `${kind} could not start`;
  }
  return "";
}

export function MediaControls({
  mediaPermissions,
  tokenMode,
  liveKitState,
  localAudioState,
  localVideoState,
  onToggleMicrophone,
  onToggleCamera
}: MediaControlsProps) {
  const connected = liveKitState === "connected";
  const canUseMedia = tokenMode === "livekit" && connected && mediaPermissions.canPublish;
  const micProblem = describeProblem(localAudioState, "Mic");
  const cameraProblem = describeProblem(localVideoState, "Camera");

  return (
    <section className="media-overlay-controls" aria-label="Meeting media controls">
      <button
        type="button"
        className="media-overlay-button"
        disabled={!canUseMedia || !mediaPermissions.canPublishAudio || localAudioState === "starting"}
        onClick={onToggleMicrophone}
      >
        {localAudioState === "on" ? "Turn mic off" : localAudioState === "starting" ? "Starting mic" : "Turn mic on"}
      </button>
      <button
        type="button"
        className="media-overlay-button"
        disabled={!canUseMedia || !mediaPermissions.canPublishVideo || localVideoState === "starting"}
        onClick={onToggleCamera}
      >
        {localVideoState === "on" ? "Turn camera off" : localVideoState === "starting" ? "Starting camera" : "Turn camera on"}
      </button>
      {micProblem || cameraProblem ? <span className="media-overlay-alert">{micProblem || cameraProblem}</span> : null}
    </section>
  );
}
