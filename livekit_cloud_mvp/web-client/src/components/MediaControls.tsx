import { useEffect, useRef } from "react";
import type { LocalVideoTrack } from "livekit-client";
import type { MediaPermissions } from "../types";
import type { LiveKitConnectionState, LocalMediaState } from "../useLiveKitRoom";

type MediaControlsProps = {
  mediaPermissions: MediaPermissions;
  tokenMode: "mock" | "livekit";
  liveKitState: LiveKitConnectionState;
  localAudioState: LocalMediaState;
  localVideoState: LocalMediaState;
  localVideoTrack: LocalVideoTrack | null;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
};

function describeState(state: LocalMediaState): string {
  if (state === "permission-denied") {
    return "permission denied";
  }
  if (state === "device-not-found") {
    return "device not found";
  }
  if (state === "not-allowed") {
    return "not allowed";
  }
  return state;
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
      {track ? <video ref={videoRef} autoPlay muted playsInline /> : <span>Local camera preview</span>}
    </div>
  );
}

export function MediaControls({
  mediaPermissions,
  tokenMode,
  liveKitState,
  localAudioState,
  localVideoState,
  localVideoTrack,
  onToggleMicrophone,
  onToggleCamera
}: MediaControlsProps) {
  const connected = liveKitState === "connected";
  const canUseMedia = tokenMode === "livekit" && connected && mediaPermissions.canPublish;

  return (
    <section className="tool-panel" aria-labelledby="media-title">
      <div className="panel-heading">
        <h2 id="media-title">Meeting Media</h2>
        <span>{mediaPermissions.canPublish ? "publish allowed" : "media locked"}</span>
      </div>

      <div className="media-status-grid">
        <span>
          Mic <strong>{describeState(localAudioState)}</strong>
        </span>
        <span>
          Camera <strong>{describeState(localVideoState)}</strong>
        </span>
      </div>

      <div className="media-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!canUseMedia || !mediaPermissions.canPublishAudio || localAudioState === "starting"}
          onClick={onToggleMicrophone}
        >
          {localAudioState === "on" ? "Turn mic off" : "Turn mic on"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!canUseMedia || !mediaPermissions.canPublishVideo || localVideoState === "starting"}
          onClick={onToggleCamera}
        >
          {localVideoState === "on" ? "Turn camera off" : "Turn camera on"}
        </button>
      </div>

      <LocalPreview track={localVideoTrack} />
    </section>
  );
}
