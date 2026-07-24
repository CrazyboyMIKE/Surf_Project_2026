import { useEffect, useRef } from "react";
import type { RemoteAudioTrack, RemoteVideoTrack } from "livekit-client";
import type { ParticipantSummary, Role, WebRole } from "../types";
import type { RemoteParticipantMediaInfo, RobotAudioTrackInfo } from "../useLiveKitRoom";

type ParticipantsPanelProps = {
  participants: RemoteParticipantMediaInfo[];
  roomParticipants: ParticipantSummary[];
  currentParticipantId: string;
  currentRole: WebRole | null;
  robotAudioTrack: RobotAudioTrackInfo | null;
  canPlaybackAudio: boolean;
  locallyMutedAudio: Record<string, boolean>;
  privateUnreadCounts: Record<string, number>;
  onEnableAudio: () => void;
  onToggleLocalAudioMute: (participantId: string) => void;
  onStartPrivateChat: (participantId: string) => void;
};

type DisplayParticipant = RemoteParticipantMediaInfo & {
  connected?: boolean;
};

function RemoteAudio({ track, muted }: { track: RemoteAudioTrack | null; muted: boolean }) {
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

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  return <audio ref={audioRef} autoPlay muted={muted} />;
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

function getParticipantRole(participant: RemoteParticipantMediaInfo, roomParticipants: ParticipantSummary[]): Role | "unknown" {
  const roomParticipant = roomParticipants.find((candidate) => candidate.id === participant.identity);
  return participant.role !== "unknown" ? participant.role : (roomParticipant?.role ?? "unknown");
}

function getParticipantName(participant: RemoteParticipantMediaInfo, roomParticipants: ParticipantSummary[]): string {
  return roomParticipants.find((candidate) => candidate.id === participant.identity)?.name ?? participant.name ?? participant.identity;
}

function AudioLocalMuteControl({
  currentRole,
  participantRole,
  participantId,
  hasAudio,
  locallyMuted,
  onToggleLocalAudioMute
}: {
  currentRole: WebRole | null;
  participantRole: Role | "unknown";
  participantId: string;
  hasAudio: boolean;
  locallyMuted: boolean;
  onToggleLocalAudioMute: (participantId: string) => void;
}) {
  const canMuteLocally = currentRole === "viewer" && (participantRole === "viewer" || participantRole === "robot");
  if (!canMuteLocally) {
    return null;
  }

  return (
    <button
      type="button"
      className="audio-local-mute-button"
      disabled={!hasAudio}
      title={hasAudio ? "Only mutes this audio in your browser" : "No audio track to mute"}
      onClick={() => onToggleLocalAudioMute(participantId)}
    >
      {hasAudio ? (locallyMuted ? "Unmute locally" : "Mute locally") : "No audio"}
    </button>
  );
}

export function ParticipantsPanel({
  participants,
  roomParticipants,
  currentParticipantId,
  currentRole,
  robotAudioTrack,
  canPlaybackAudio,
  locallyMutedAudio,
  privateUnreadCounts,
  onEnableAudio,
  onToggleLocalAudioMute,
  onStartPrivateChat
}: ParticipantsPanelProps) {
  const displayParticipants: DisplayParticipant[] = participants.map((participant) => ({
    ...participant,
    role: getParticipantRole(participant, roomParticipants),
    name: getParticipantName(participant, roomParticipants),
    connected: roomParticipants.find((candidate) => candidate.id === participant.identity)?.connected
  }));
  const orderedParticipants = [...displayParticipants].sort((left, right) => {
    if (left.role === "controller" && right.role !== "controller") {
      return -1;
    }

    if (left.role !== "controller" && right.role === "controller") {
      return 1;
    }

    return (left.name ?? left.identity).localeCompare(right.name ?? right.identity);
  });
  const robotParticipant = roomParticipants.find((participant) => participant.role === "robot" && participant.connected);
  const robotIdentity = robotAudioTrack?.participantIdentity ?? robotParticipant?.id;
  const robotName = robotAudioTrack?.participantName ?? robotParticipant?.name ?? robotIdentity;
  const hasRobotAudio = Boolean(robotAudioTrack);

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
        {robotIdentity ? (
          <article className="participant-tile participant-robot" key={robotIdentity}>
            <div className="participant-header">
              <strong>{robotName}</strong>
              <span>robot</span>
            </div>
            <div className="participant-video participant-audio-only">
              <span>{hasRobotAudio ? "Robot microphone" : "Robot has no audio track"}</span>
            </div>
            <div className="participant-media-state">
              <span>Audio {hasRobotAudio ? "on" : "off"}</span>
              <span>{locallyMutedAudio[robotIdentity] ? "Muted for you" : "Unmuted for you"}</span>
            </div>
            <AudioLocalMuteControl
              currentRole={currentRole}
              participantRole="robot"
              participantId={robotIdentity}
              hasAudio={hasRobotAudio}
              locallyMuted={Boolean(locallyMutedAudio[robotIdentity])}
              onToggleLocalAudioMute={onToggleLocalAudioMute}
            />
          </article>
        ) : null}

        {orderedParticipants.length === 0 && !robotIdentity ? (
          <p className="empty-state">No remote Web participants yet</p>
        ) : (
          orderedParticipants.map((participant) => (
            <article className={`participant-tile participant-${participant.role}`} key={participant.identity}>
              <div className="participant-header">
                <strong>{participant.name ?? participant.identity}</strong>
                <span>{participant.role}</span>
              </div>
              <RemoteVideo track={participant.videoTrack} />
              <RemoteAudio
                track={participant.audioTrack}
                muted={participant.role === "controller" ? false : Boolean(locallyMutedAudio[participant.identity])}
              />
              <div className="participant-media-state">
                <span>Audio {participant.audioEnabled ? "on" : "off"}</span>
                <span>Video {participant.videoEnabled ? "on" : "off"}</span>
                {participant.role === "viewer" ? (
                  <span>{locallyMutedAudio[participant.identity] ? "Muted for you" : "Unmuted for you"}</span>
                ) : null}
              </div>
              <div className="participant-actions">
                <AudioLocalMuteControl
                  currentRole={currentRole}
                  participantRole={participant.role}
                  participantId={participant.identity}
                  hasAudio={Boolean(participant.audioTrack)}
                  locallyMuted={Boolean(locallyMutedAudio[participant.identity])}
                  onToggleLocalAudioMute={onToggleLocalAudioMute}
                />
                {currentRole === "viewer" &&
                participant.role === "viewer" &&
                participant.connected !== false &&
                participant.identity !== currentParticipantId ? (
                  <button type="button" className="private-chat-button" onClick={() => onStartPrivateChat(participant.identity)}>
                    Private chat
                    {privateUnreadCounts[participant.identity] ? <span>{privateUnreadCounts[participant.identity]}</span> : null}
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
