import { useEffect, useRef } from "react";
import type { RobotControlEvent } from "../types";
import type { LiveKitConnectionState, RobotVideoTrackInfo } from "../useLiveKitRoom";

type RobotVideoProps = {
  liveKitState: LiveKitConnectionState;
  robotOnline: boolean;
  robotVideoTrack: RobotVideoTrackInfo | null;
  robotEvents: RobotControlEvent[];
};

function describeEvent(event: RobotControlEvent): string {
  if (event.command === "1002") {
    return `1002 move ${event.parameters.distanceCm ?? 20}cm`;
  }

  if (event.command === "1003") {
    return `1003 rotate ${event.parameters.angleDeg ?? 15}deg`;
  }

  return "1000 stop";
}

function getPlaceholderText(liveKitState: LiveKitConnectionState, robotOnline: boolean): string {
  if (!robotOnline) {
    return "Robot offline";
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

export function RobotVideo({ liveKitState, robotOnline, robotVideoTrack, robotEvents }: RobotVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!robotVideoTrack || !videoElement) {
      return;
    }

    robotVideoTrack.track.attach(videoElement);

    return () => {
      robotVideoTrack.track.detach(videoElement);
    };
  }, [robotVideoTrack]);

  return (
    <section className="video-section" aria-label="Robot video">
      {robotVideoTrack ? (
        <div className="video-live">
          <video ref={videoRef} autoPlay playsInline muted className="robot-video" />
          <div className="video-badge">{robotVideoTrack.participantName ?? robotVideoTrack.participantIdentity}</div>
        </div>
      ) : (
        <div className="video-placeholder">
          <div className="video-copy">
            <p>{getPlaceholderText(liveKitState, robotOnline)}</p>
            <span>{liveKitState === "mock" ? "Configure LiveKit to enable real video" : `LiveKit ${liveKitState}`}</span>
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
