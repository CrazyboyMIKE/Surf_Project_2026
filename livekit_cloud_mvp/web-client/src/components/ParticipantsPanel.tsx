import { useEffect, useRef } from "react";
import type { RemoteAudioTrack, RemoteVideoTrack } from "livekit-client";
import type { RemoteParticipantMediaInfo } from "../useLiveKitRoom";

type ParticipantsPanelProps = {
  participants: RemoteParticipantMediaInfo[];
  canPlaybackAudio: boolean;
  onEnableAudio: () => void;
};

function RemoteAudio({ track }: { track: RemoteAudioTrack | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!track || !audioElement) {
      return;
    }

    track.attach(audioElement);

    return () => {
      track.detach(audioElement);
    };
  }, [track]);

  return <audio ref={audioRef} autoPlay />;
}

function RemoteVideo({ track }: { track: RemoteVideoTrack | null }) {
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
    <div className="participant-video">
      {track ? <video ref={videoRef} autoPlay playsInline /> : <span>No camera</span>}
    </div>
  );
}

export function ParticipantsPanel({ participants, canPlaybackAudio, onEnableAudio }: ParticipantsPanelProps) {
  const orderedParticipants = [...participants].sort((left, right) => {
    if (left.role === "controller" && right.role !== "controller") {
      return -1;
    }

    if (left.role !== "controller" && right.role === "controller") {
      return 1;
    }

    return (left.name ?? left.identity).localeCompare(right.name ?? right.identity);
  });

  return (
    <section className="tool-panel participants-panel" aria-labelledby="participants-title">
      <div className="panel-heading">
        <h2 id="participants-title">Participants</h2>
        <span>{participants.length} remote users</span>
      </div>

      {!canPlaybackAudio ? (
        <button type="button" className="secondary-button audio-unlock" onClick={onEnableAudio}>
          Enable sound
        </button>
      ) : null}

      <div className="participants-list">
        {orderedParticipants.length === 0 ? (
          <p className="empty-state">No remote Web participants yet</p>
        ) : (
          orderedParticipants.map((participant) => (
            <article className={`participant-tile participant-${participant.role}`} key={participant.identity}>
              <div className="participant-header">
                <strong>{participant.name ?? participant.identity}</strong>
                <span>{participant.role}</span>
              </div>
              <RemoteVideo track={participant.videoTrack} />
              <RemoteAudio track={participant.audioTrack} />
              <div className="participant-media-state">
                <span>Audio {participant.audioEnabled ? "on" : "off"}</span>
                <span>Video {participant.videoEnabled ? "on" : "off"}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
