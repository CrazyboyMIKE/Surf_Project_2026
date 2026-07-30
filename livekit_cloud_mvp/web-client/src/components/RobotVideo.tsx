import { useEffect, useRef, type CSSProperties } from "react";
import type { RobotControlEvent, Role } from "../types";
import type { LiveKitConnectionState, RobotVideoTrackInfo } from "../useLiveKitRoom";

type RobotVideoProps = {
  liveKitState: LiveKitConnectionState;
  robotOnline: boolean;
  stageVideoTrack: RobotVideoTrackInfo | null;
  stageParticipantRole: Role | "unknown";
  stageParticipantName: string;
  stageParticipantIdentity: string;
  robotEvents: RobotControlEvent[];
};

function describeEvent(event: RobotControlEvent): string {
  if (event.command === "1002") {
    return `1002 move ${event.parameters.distanceCm ?? 20}cm`;
  }

  if (event.command === "1003") {
    return `1003 rotate ${event.parameters.angleDeg ?? 15}deg`;
  }

  if (event.command === "1001") {
    return `1001 keyboard lv=${event.parameters.lv ?? 0} av=${event.parameters.av ?? 0}`;
  }

  return "1000 stop";
}

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

export function RobotVideo({
  liveKitState,
  robotOnline,
  stageVideoTrack,
  stageParticipantRole,
  stageParticipantName,
  stageParticipantIdentity,
  robotEvents
}: RobotVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!stageVideoTrack || !videoElement) {
      return;
    }

    stageVideoTrack.track.attach(videoElement);

    return () => {
      stageVideoTrack.track.detach(videoElement);
    };
  }, [stageVideoTrack]);

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

      <div className="event-strip" aria-label="Mock robot control log">
        {robotEvents.length === 0 ? (
          <p>No mock robot commands yet</p>
        ) : (
          robotEvents.map((event) => (
            <p key={`${event.timestamp}-${event.command}`}>
              {new Date(event.timestamp).toLocaleTimeString()} · {describeEvent(event)}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
