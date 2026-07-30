import { useEffect, useRef, type CSSProperties } from "react";
import type { RemoteAudioTrack, RemoteVideoTrack } from "livekit-client";
import type { ParticipantSummary, Role, SpeakerState, WebRole } from "../types";
import type { RemoteParticipantMediaInfo, RobotAudioTrackInfo, RobotVideoTrackInfo } from "../useLiveKitRoom";

type ParticipantsPanelProps = {
  participants: RemoteParticipantMediaInfo[];
  roomParticipants: ParticipantSummary[];
  currentParticipantId: string;
  currentRole: WebRole | null;
  selectedStageParticipantId: string | null;
  robotVideoTrack: RobotVideoTrackInfo | null;
  robotAudioTrack: RobotAudioTrackInfo | null;
  canPlaybackAudio: boolean;
  speaker: SpeakerState;
  speakerActionsDisabled: boolean;
  locallyMutedAudio: Record<string, boolean>;
  privateUnreadCounts: Record<string, number>;
  onEnableAudio: () => void;
  onRequestSpeaker: () => void;
  onEndSpeaker: () => void;
  onSelectStageParticipant: (participantId: string) => void;
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
      className={`speaking-badge${isSpeaking ? " active" : ""}`}
      style={getSpeakingStyle(audioLevel)}
      title={isSpeaking ? "Speaking" : "Audio track available"}
      aria-label={isSpeaking ? "Speaking" : "Audio track available"}
    >
      <span className="speaking-icon" aria-hidden="true" />
    </span>
  );
}

function RemoteVideo({
  track,
  hasAudioTrack,
  isSpeaking,
  audioLevel
}: {
  track: RemoteVideoTrack | null;
  hasAudioTrack: boolean;
  isSpeaking: boolean;
  audioLevel: number;
}) {
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
    <div className={`participant-video${hasAudioTrack && isSpeaking ? " is-speaking" : ""}`}>
      {track ? <video ref={videoRef} autoPlay playsInline /> : <span>No camera</span>}
      <SpeakingBadge hasAudioTrack={hasAudioTrack} isSpeaking={isSpeaking} audioLevel={audioLevel} />
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

function canUsePrivateChatRole(role: Role | "unknown" | null): boolean {
  return role === "controller" || role === "viewer";
}

function canShowLocalMuteState(role: Role | "unknown"): boolean {
  return role === "controller" || role === "viewer" || role === "robot";
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
  const canMuteLocally =
    (currentRole === "controller" || currentRole === "viewer") &&
    (participantRole === "controller" || participantRole === "viewer" || participantRole === "robot");
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

function SpeakerPanel({
  speaker,
  currentParticipantId,
  currentRole,
  disabled,
  onRequestSpeaker,
  onEndSpeaker
}: {
  speaker: SpeakerState;
  currentParticipantId: string;
  currentRole: WebRole | null;
  disabled: boolean;
  onRequestSpeaker: () => void;
  onEndSpeaker: () => void;
}) {
  const queueIndex = speaker.queue.findIndex((participant) => participant.id === currentParticipantId);
  const currentParticipantIsSpeaker = speaker.currentSpeaker?.id === currentParticipantId && currentRole === "viewer";
  const currentParticipantIsQueued = queueIndex >= 0;
  const canRequestSpeaker = currentRole === "viewer" && !currentParticipantIsSpeaker && !currentParticipantIsQueued;

  return (
    <section className="speaker-panel" aria-labelledby="speaker-title">
      <div className="speaker-panel-header">
        <div>
          <h3 id="speaker-title">Speaker</h3>
          <span>{speaker.currentSpeaker ? `${speaker.currentSpeaker.name} · ${speaker.currentSpeaker.role}` : "none"}</span>
        </div>
        {currentParticipantIsSpeaker ? (
          <button type="button" className="speaker-action-button" disabled={disabled} onClick={onEndSpeaker}>
            End Speaker
          </button>
        ) : currentRole === "viewer" ? (
          <button type="button" className="speaker-action-button" disabled={disabled || !canRequestSpeaker} onClick={onRequestSpeaker}>
            {currentParticipantIsQueued ? `Queued #${queueIndex + 1}` : "Request Speaker"}
          </button>
        ) : null}
      </div>
      <div className="speaker-queue" aria-label="Speaker queue">
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
    </section>
  );
}

export function ParticipantsPanel({
  participants,
  roomParticipants,
  currentParticipantId,
  currentRole,
  selectedStageParticipantId,
  robotVideoTrack,
  robotAudioTrack,
  canPlaybackAudio,
  speaker,
  speakerActionsDisabled,
  locallyMutedAudio,
  privateUnreadCounts,
  onEnableAudio,
  onRequestSpeaker,
  onEndSpeaker,
  onSelectStageParticipant,
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
  const robotIdentity = robotVideoTrack?.participantIdentity ?? robotAudioTrack?.participantIdentity ?? robotParticipant?.id;
  const robotName = robotVideoTrack?.participantName ?? robotAudioTrack?.participantName ?? robotParticipant?.name ?? robotIdentity;
  const hasRobotAudio = Boolean(robotAudioTrack);
  const hasRobotVideo = Boolean(robotVideoTrack);
  const robotIsSpeaking = hasRobotAudio && Boolean(robotAudioTrack?.isSpeaking ?? robotVideoTrack?.isSpeaking);
  const robotAudioLevel = robotAudioTrack?.audioLevel ?? robotVideoTrack?.audioLevel ?? 0;

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

      <SpeakerPanel
        speaker={speaker}
        currentParticipantId={currentParticipantId}
        currentRole={currentRole}
        disabled={speakerActionsDisabled}
        onRequestSpeaker={onRequestSpeaker}
        onEndSpeaker={onEndSpeaker}
      />

      <div className="participants-list">
        {robotIdentity ? (
          <article className={`participant-tile participant-robot${robotIsSpeaking ? " is-speaking" : ""}`} key={robotIdentity}>
            <div className="participant-header">
              <strong>{robotName}</strong>
              <span>robot</span>
            </div>
            <RemoteVideo
              track={robotVideoTrack?.track ?? null}
              hasAudioTrack={hasRobotAudio}
              isSpeaking={robotIsSpeaking}
              audioLevel={robotAudioLevel}
            />
            <div className="participant-media-state">
              <span>Audio {hasRobotAudio ? "on" : "off"}</span>
              <span>Video {hasRobotVideo ? "on" : "off"}</span>
              <span>{locallyMutedAudio[robotIdentity] ? "Muted for you" : "Unmuted for you"}</span>
            </div>
            <div className="participant-actions">
              <button
                type="button"
                className="stage-select-button"
                disabled={!hasRobotVideo || selectedStageParticipantId === robotIdentity}
                title={hasRobotVideo ? "Show this participant on the main screen" : "No video track to show"}
                onClick={() => onSelectStageParticipant(robotIdentity)}
              >
                {selectedStageParticipantId === robotIdentity ? "On main" : hasRobotVideo ? "Show main" : "No video"}
              </button>
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
            <article
              className={`participant-tile participant-${participant.role}${
                participant.hasAudioTrack && participant.isSpeaking ? " is-speaking" : ""
              }`}
              key={participant.identity}
            >
              <div className="participant-header">
                <strong>{participant.name ?? participant.identity}</strong>
                <span>{participant.role}</span>
              </div>
              <RemoteVideo
                track={participant.videoTrack}
                hasAudioTrack={participant.hasAudioTrack}
                isSpeaking={participant.isSpeaking}
                audioLevel={participant.audioLevel}
              />
              <RemoteAudio track={participant.audioTrack} muted={Boolean(locallyMutedAudio[participant.identity])} />
              <div className="participant-media-state">
                <span>Audio {participant.audioEnabled ? "on" : "off"}</span>
                <span>Video {participant.videoEnabled ? "on" : "off"}</span>
                {canShowLocalMuteState(participant.role) ? (
                  <span>{locallyMutedAudio[participant.identity] ? "Muted for you" : "Unmuted for you"}</span>
                ) : null}
              </div>
              <div className="participant-actions">
                <button
                  type="button"
                  className="stage-select-button"
                  disabled={!participant.videoTrack || selectedStageParticipantId === participant.identity}
                  title={participant.videoTrack ? "Show this participant on the main screen" : "No video track to show"}
                  onClick={() => onSelectStageParticipant(participant.identity)}
                >
                  {selectedStageParticipantId === participant.identity ? "On main" : participant.videoTrack ? "Show main" : "No video"}
                </button>
                <AudioLocalMuteControl
                  currentRole={currentRole}
                  participantRole={participant.role}
                  participantId={participant.identity}
                  hasAudio={Boolean(participant.audioTrack)}
                  locallyMuted={Boolean(locallyMutedAudio[participant.identity])}
                  onToggleLocalAudioMute={onToggleLocalAudioMute}
                />
                {canUsePrivateChatRole(currentRole) &&
                canUsePrivateChatRole(participant.role) &&
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
