import { useEffect, useRef, useState } from "react";
import type { RobotControlEvent } from "../types";
import type { LiveKitConnectionState, RobotAudioTrackInfo, RobotVideoTrackInfo } from "../useLiveKitRoom";

type RobotVideoProps = {
  liveKitState: LiveKitConnectionState;
  robotOnline: boolean;
  robotVideoTrack: RobotVideoTrackInfo | null;
  stageParticipantRole: string;
  robotAudioTrack: RobotAudioTrackInfo | null;
  robotAudioMuted: boolean;
  canPlaybackAudio: boolean;
  robotEvents: RobotControlEvent[];
  onEnableAudio: () => Promise<void>;
};

function describeEvent(event: RobotControlEvent): string {
  if (event.command === "1002") {
    return `1002 move ${event.parameters.distanceCm ?? 20}cm`;
  }

  if (event.command === "1003") {
    return `1003 rotate ${event.parameters.angleDeg ?? 15}deg`;
  }

  if (event.command === "1004") {
    return "1004 head stop";
  }

  if (event.command === "1005") {
    return `1005 head d=${event.parameters.d ?? 1} a=${event.parameters.a ?? 0}deg`;
  }

  if (event.command === "1006") {
    return `1006 head reset d=${event.parameters.d ?? 0}`;
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

function getRobotAudioUnavailableText(liveKitState: LiveKitConnectionState, robotOnline: boolean): string {
  if (!robotOnline) {
    return "robot offline";
  }

  if (liveKitState !== "connected") {
    return `LiveKit ${liveKitState}`;
  }

  return "robot has no microphone track";
}

function RobotAudioPlayer({
  liveKitState,
  robotOnline,
  robotAudioTrack,
  robotAudioMuted,
  canPlaybackAudio,
  onEnableAudio
}: {
  liveKitState: LiveKitConnectionState;
  robotOnline: boolean;
  robotAudioTrack: RobotAudioTrackInfo | null;
  robotAudioMuted: boolean;
  canPlaybackAudio: boolean;
  onEnableAudio: () => Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioState, setAudioState] = useState("waiting");

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !robotAudioTrack) {
      setAudioState(getRobotAudioUnavailableText(liveKitState, robotOnline));
      return;
    }

    robotAudioTrack.track.attach(audioElement);
    audioElement.muted = robotAudioMuted;
    audioElement.volume = 1;
    setAudioState(robotAudioMuted ? "muted for you" : "subscribed");

    void audioElement.play().then(
      () => setAudioState(robotAudioMuted ? "muted for you" : "playing"),
      () => setAudioState("audio playback blocked")
    );

    return () => {
      robotAudioTrack.track.detach(audioElement);
    };
  }, [canPlaybackAudio, liveKitState, robotAudioMuted, robotAudioTrack, robotOnline]);

  async function enableRobotAudio() {
    const audioElement = audioRef.current;
    if (!audioElement || !robotAudioTrack) {
      setAudioState(getRobotAudioUnavailableText(liveKitState, robotOnline));
      return;
    }

    try {
      await onEnableAudio();
      audioElement.muted = robotAudioMuted;
      await audioElement.play();
      setAudioState(robotAudioMuted ? "muted for you" : "playing");
    } catch {
      setAudioState("audio playback blocked");
    }
  }

  const shouldShowEnableButton = Boolean(robotAudioTrack) && (!canPlaybackAudio || audioState === "audio playback blocked");

  return (
    <div className="robot-audio-panel">
      <audio ref={audioRef} autoPlay playsInline />
      <span>
        Robot audio <strong>{audioState}</strong>
      </span>
      {shouldShowEnableButton ? (
        <button type="button" className="secondary-button audio-unlock" onClick={enableRobotAudio}>
          Enable robot audio
        </button>
      ) : null}
    </div>
  );
}

export function RobotVideo({
  liveKitState,
  robotOnline,
  robotVideoTrack,
  stageParticipantRole,
  robotAudioTrack,
  robotAudioMuted,
  canPlaybackAudio,
  robotEvents,
  onEnableAudio
}: RobotVideoProps) {
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
          <div className="video-role-badge">{stageParticipantRole}</div>
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

      <RobotAudioPlayer
        liveKitState={liveKitState}
        robotOnline={robotOnline}
        robotAudioTrack={robotAudioTrack}
        robotAudioMuted={robotAudioMuted}
        canPlaybackAudio={canPlaybackAudio}
        onEnableAudio={onEnableAudio}
      />

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
