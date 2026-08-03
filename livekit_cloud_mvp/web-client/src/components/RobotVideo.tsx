import { useEffect, useRef, type CSSProperties } from "react";
import type { KeyboardDirection, Role } from "../types";
import type { LiveKitConnectionState, RobotVideoTrackInfo } from "../useLiveKitRoom";

type RobotVideoProps = {
  liveKitState: LiveKitConnectionState;
  robotOnline: boolean;
  stageVideoTrack: RobotVideoTrackInfo | null;
  stageParticipantRole: Role | "unknown";
  stageParticipantName: string;
  stageParticipantIdentity: string;
  robotActionCount: number;
  keyboardEnabled: boolean;
  keyboardAvailable: boolean;
  keyboardDirection: DirectionFeedbackSignal;
  keyboardStateText: string;
};

function getPlaceholderText(
  liveKitState: LiveKitConnectionState,
  robotOnline: boolean,
  stageParticipantRole: Role | "unknown",
  stageParticipantName: string
): string {
  if (stageParticipantRole !== "robot") {
    if (liveKitState === "connecting" || liveKitState === "reconnecting") {
      return `Connecting to ${stageParticipantName} video`;
    }

    return `${stageParticipantName} camera unavailable`;
  }

  if (!robotOnline) {
    return "Robot camera unavailable";
  }

  if (liveKitState === "mock") {
    return "Robot video will appear here";
  }

  if (liveKitState === "connecting" || liveKitState === "reconnecting") {
    return "Connecting to LiveKit video";
  }

  if (liveKitState === "connected") {
    return "Waiting for robot video";
  }

  return "Robot video will appear here";
}

function getSpeakingStyle(audioLevel: number): CSSProperties & Record<"--speaking-level", string> {
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
      className={`speaking-badge video-speaking-badge${isSpeaking ? " active" : ""}`}
      style={getSpeakingStyle(audioLevel)}
      title={isSpeaking ? "Speaking" : "Audio track available"}
      aria-label={isSpeaking ? "Speaking" : "Audio track available"}
    >
      <span className="speaking-icon" aria-hidden="true" />
    </span>
  );
}

type DirectionFeedbackKey = "forward" | "left" | "stop" | "right" | "backward";
type DirectionFeedbackSignal = KeyboardDirection | "stop" | null;

function getActiveFeedbackKeys(direction: DirectionFeedbackSignal): DirectionFeedbackKey[] {
  if (!direction) {
    return [];
  }

  if (direction === "stop") return ["stop"];
  if (direction === "forward_left") return ["forward", "left"];
  if (direction === "forward_right") return ["forward", "right"];
  if (direction === "backward_left") return ["backward", "left"];
  if (direction === "backward_right") return ["backward", "right"];
  return [direction];
}

function DirectionFeedbackPad({
  enabled,
  available,
  direction
}: {
  enabled: boolean;
  available: boolean;
  direction: DirectionFeedbackSignal;
}) {
  const activeKeys = getActiveFeedbackKeys(direction);
  const className = ["direction-feedback-pad", enabled ? "enabled" : "", available ? "" : "unavailable"].filter(Boolean).join(" ");
  const keys: Array<{ id: DirectionFeedbackKey; label: string; symbol: string }> = [
    { id: "forward", label: "Forward", symbol: "↑" },
    { id: "left", label: "Left", symbol: "←" },
    { id: "stop", label: "Stop", symbol: "■" },
    { id: "right", label: "Right", symbol: "→" },
    { id: "backward", label: "Back", symbol: "↓" }
  ];

  return (
    <div className={className} aria-label="Direction key feedback">
      {keys.map((key) => (
        <span
          key={key.id}
          className={`direction-feedback-key ${key.id}${activeKeys.includes(key.id) ? " active" : ""}`}
          aria-label={key.label}
        >
          {key.symbol}
        </span>
      ))}
    </div>
  );
}

function attachStageVideoTrack(track: RobotVideoTrackInfo["track"], videoElement: HTMLVideoElement): () => void {
  let disposed = false;
  const retryTimers: Array<ReturnType<typeof window.setTimeout>> = [];

  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.defaultMuted = true;
  videoElement.playsInline = true;
  videoElement.preload = "auto";
  videoElement.setAttribute("muted", "");
  videoElement.setAttribute("playsinline", "");
  videoElement.setAttribute("webkit-playsinline", "true");
  track.attach(videoElement);

  const playVideo = () => {
    if (disposed) {
      return;
    }

    void videoElement.play().catch(() => {
      // Mobile browsers may defer playback around page visibility changes.
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

export function RobotVideo({
  liveKitState,
  robotOnline,
  stageVideoTrack,
  stageParticipantRole,
  stageParticipantName,
  stageParticipantIdentity,
  robotActionCount,
  keyboardEnabled,
  keyboardAvailable,
  keyboardDirection,
  keyboardStateText
}: RobotVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageTrack = stageVideoTrack?.track ?? null;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!stageTrack || !videoElement) {
      return;
    }

    return attachStageVideoTrack(stageTrack, videoElement);
  }, [stageTrack]);

  return (
    <section className="video-section" aria-label="Main video">
      {stageVideoTrack ? (
        <div className={`video-live${stageVideoTrack.hasAudioTrack && stageVideoTrack.isSpeaking ? " is-speaking" : ""}`}>
          <video ref={videoRef} autoPlay playsInline muted className="robot-video" />
          <div className="video-role-badge">{stageParticipantRole}</div>
          <SpeakingBadge
            hasAudioTrack={stageVideoTrack.hasAudioTrack}
            isSpeaking={stageVideoTrack.isSpeaking}
            audioLevel={stageVideoTrack.audioLevel}
          />
          <div className="video-badge">{stageVideoTrack.participantName ?? stageVideoTrack.participantIdentity}</div>
        </div>
      ) : (
        <div className="video-placeholder">
          <div className="video-copy">
            <p>{getPlaceholderText(liveKitState, robotOnline, stageParticipantRole, stageParticipantName)}</p>
            <span>
              {stageParticipantRole} · {stageParticipantIdentity}
            </span>
          </div>
        </div>
      )}

      <div className="robot-status-strip" aria-label="Robot status">
        <div className="robot-status-copy">
          <p>{robotOnline ? (robotActionCount > 0 ? "Last action sent" : "Robot ready") : "Robot offline"}</p>
          <span>{keyboardStateText}</span>
        </div>
        <DirectionFeedbackPad enabled={keyboardEnabled} available={keyboardAvailable} direction={keyboardDirection} />
      </div>
    </section>
  );
}
