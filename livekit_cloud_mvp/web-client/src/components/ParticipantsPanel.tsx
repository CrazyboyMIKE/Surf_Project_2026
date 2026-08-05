import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack } from "livekit-client";
import type { ParticipantSummary, Role, SpeakerState, WebRole } from "../types";
import type {
  LocalMediaState,
  ParticipantSpeakingInfo,
  RemoteParticipantMediaInfo,
  RobotAudioTrackInfo,
  RobotVideoTrackInfo
} from "../useLiveKitRoom";

type ParticipantsPanelProps = {
  participants: RemoteParticipantMediaInfo[];
  roomParticipants: ParticipantSummary[];
  currentParticipantId: string;
  currentParticipantName: string;
  currentRole: WebRole | null;
  localAudioState: LocalMediaState;
  localSpeaking: ParticipantSpeakingInfo;
  localVideoState: LocalMediaState;
  localVideoTrack: LocalVideoTrack | null;
  selectedStageParticipantId: string | null;
  robotStageParticipantId: string;
  robotOnline: boolean;
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

function attachPreviewVideoTrack(track: RemoteVideoTrack | LocalVideoTrack, videoElement: HTMLVideoElement, muted: boolean): () => void {
  let disposed = false;
  const retryTimers: Array<ReturnType<typeof window.setTimeout>> = [];

  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.preload = "auto";
  videoElement.muted = muted;
  videoElement.defaultMuted = muted;
  videoElement.setAttribute("playsinline", "");
  videoElement.setAttribute("webkit-playsinline", "true");
  if (muted) {
    videoElement.setAttribute("muted", "");
  }

  track.attach(videoElement);

  const playVideo = () => {
    if (disposed) {
      return;
    }

    void videoElement.play().catch(() => {
      // Some mobile browsers delay playback until the page is visible again.
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

function RemoteVideo({
  track,
  hasAudioTrack,
  isSpeaking,
  audioLevel,
  placeholder = "No camera"
}: {
  track: RemoteVideoTrack | null;
  hasAudioTrack: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  placeholder?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!track || !videoElement) {
      return;
    }

    return attachPreviewVideoTrack(track, videoElement, true);
  }, [track]);

  return (
    <div className={`participant-video${hasAudioTrack && isSpeaking ? " is-speaking" : ""}`}>
      {track ? <video ref={videoRef} autoPlay muted playsInline /> : <span>{placeholder}</span>}
      <SpeakingBadge hasAudioTrack={hasAudioTrack} isSpeaking={isSpeaking} audioLevel={audioLevel} />
    </div>
  );
}

function LocalVideoPreview({
  track,
  speaking,
  placeholder = "Local camera off"
}: {
  track: LocalVideoTrack | null;
  speaking: ParticipantSpeakingInfo;
  placeholder?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!track || !videoElement) {
      return;
    }

    return attachPreviewVideoTrack(track, videoElement, true);
  }, [track]);

  return (
    <div className={`participant-video participant-video-local${speaking.hasAudioTrack && speaking.isSpeaking ? " is-speaking" : ""}`}>
      {track ? <video ref={videoRef} autoPlay muted playsInline /> : <span>{placeholder}</span>}
      <SpeakingBadge hasAudioTrack={speaking.hasAudioTrack} isSpeaking={speaking.isSpeaking} audioLevel={speaking.audioLevel} />
    </div>
  );
}

function getParticipantRole(participant: RemoteParticipantMediaInfo, roomParticipants: ParticipantSummary[]): Role | "unknown" {
  const roomParticipant = roomParticipants.find((candidate) => candidate.id === participant.identity);
  return roomParticipant?.role ?? (participant.role !== "unknown" ? participant.role : "unknown");
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

function isRobotRole(role: Role | "unknown"): boolean {
  return role === "robot";
}

type ParticipantListItem =
  | { kind: "robot"; identity: string; name: string; role: "robot"; hasAudioTrack: boolean; isSpeaking: boolean; audioLevel: number }
  | {
      kind: "local";
      identity: string;
      name: string;
      role: WebRole;
      hasAudioTrack: boolean;
      isSpeaking: boolean;
      audioLevel: number;
    }
  | {
      kind: "remote";
      participant: DisplayParticipant;
      identity: string;
      name: string;
      role: Role | "unknown";
      hasAudioTrack: boolean;
      isSpeaking: boolean;
      audioLevel: number;
    };

const SPEAKING_SORT_HOLD_MS = 1600;

function getDefaultSortRank(item: ParticipantListItem, speaker: SpeakerState): number {
  if (item.identity === speaker.currentSpeaker?.id) {
    return 0;
  }

  if (item.role === "controller") {
    return 1;
  }

  if (item.kind === "robot") {
    return 2;
  }

  if (item.kind === "local") {
    return 3;
  }

  if (item.role === "viewer") {
    return 4;
  }

  return 5;
}

function sortParticipantItems(
  items: ParticipantListItem[],
  speaker: SpeakerState,
  lastSpokeAtById: Record<string, number>,
  now: number
): ParticipantListItem[] {
  return [...items].sort((left, right) => {
    const leftLastSpokeAt = lastSpokeAtById[left.identity] ?? 0;
    const rightLastSpokeAt = lastSpokeAtById[right.identity] ?? 0;
    const leftSpeaking = left.hasAudioTrack && (left.isSpeaking || now - leftLastSpokeAt < SPEAKING_SORT_HOLD_MS);
    const rightSpeaking = right.hasAudioTrack && (right.isSpeaking || now - rightLastSpokeAt < SPEAKING_SORT_HOLD_MS);

    if (leftSpeaking !== rightSpeaking) {
      return leftSpeaking ? -1 : 1;
    }

    if (leftSpeaking && rightSpeaking) {
      const levelDifference = right.audioLevel - left.audioLevel;
      if (Math.abs(levelDifference) > 0.04) {
        return levelDifference;
      }

      return rightLastSpokeAt - leftLastSpokeAt;
    }

    const rankDifference = getDefaultSortRank(left, speaker) - getDefaultSortRank(right, speaker);
    if (rankDifference !== 0) {
      return rankDifference;
    }

    return left.name.localeCompare(right.name);
  });
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
  const canUseSpeakerQueue = currentRole === "viewer" || currentRole === "controller";
  const currentParticipantIsSpeaker =
    speaker.currentSpeaker?.id === currentParticipantId && canUseSpeakerQueue && Boolean(speaker.currentSpeakerStartedAt);
  const currentParticipantIsQueued = queueIndex >= 0;
  const canRequestSpeaker = canUseSpeakerQueue && !currentParticipantIsSpeaker && !currentParticipantIsQueued;

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
        ) : canUseSpeakerQueue ? (
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
  currentParticipantName,
  currentRole,
  localAudioState,
  localSpeaking,
  localVideoState,
  localVideoTrack,
  selectedStageParticipantId,
  robotStageParticipantId,
  robotOnline,
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
  const [lastSpokeAtById, setLastSpokeAtById] = useState<Record<string, number>>({});
  const [speakingClock, setSpeakingClock] = useState(0);
  const displayParticipants: DisplayParticipant[] = participants.map((participant) => ({
    ...participant,
    role: getParticipantRole(participant, roomParticipants),
    name: getParticipantName(participant, roomParticipants),
    connected: roomParticipants.find((candidate) => candidate.id === participant.identity)?.connected
  }));
  const robotMediaParticipant = displayParticipants.find((participant) => isRobotRole(participant.role));
  const webParticipants = displayParticipants.filter((participant) => !isRobotRole(participant.role));
  const robotParticipant = roomParticipants.find((participant) => participant.role === "robot");
  const robotIdentity =
    robotMediaParticipant?.identity ??
    robotVideoTrack?.participantIdentity ??
    robotAudioTrack?.participantIdentity ??
    robotParticipant?.id ??
    robotStageParticipantId;
  const robotName =
    robotMediaParticipant?.name ??
    robotVideoTrack?.participantName ??
    robotAudioTrack?.participantName ??
    robotParticipant?.name ??
    "Robot";
  const robotVideo = robotMediaParticipant?.videoTrack ?? robotVideoTrack?.track ?? null;
  const robotAudio = robotMediaParticipant?.audioTrack ?? robotAudioTrack?.track ?? null;
  const hasRobotAudio = Boolean(robotAudio);
  const hasRobotVideo = Boolean(robotVideo);
  const robotIsSpeaking =
    hasRobotAudio && Boolean(robotMediaParticipant?.isSpeaking ?? robotAudioTrack?.isSpeaking ?? robotVideoTrack?.isSpeaking);
  const robotAudioLevel = robotMediaParticipant?.audioLevel ?? robotAudioTrack?.audioLevel ?? robotVideoTrack?.audioLevel ?? 0;
  const robotSelected = selectedStageParticipantId === robotStageParticipantId || selectedStageParticipantId === robotIdentity;
  const robotMuteParticipantId = robotAudioTrack?.participantIdentity ?? robotMediaParticipant?.identity ?? robotIdentity;
  const localRole = currentRole ?? "viewer";
  const localHasAudio = localSpeaking.hasAudioTrack || localAudioState === "on";
  const localHasVideo = Boolean(localVideoTrack) || localVideoState === "on";
  const participantItems = useMemo<ParticipantListItem[]>(
    () => [
      {
        kind: "robot",
        identity: robotIdentity,
        name: robotName,
        role: "robot",
        hasAudioTrack: hasRobotAudio,
        isSpeaking: robotIsSpeaking,
        audioLevel: robotAudioLevel
      },
      {
        kind: "local",
        identity: currentParticipantId,
        name: currentParticipantName,
        role: localRole,
        hasAudioTrack: localHasAudio,
        isSpeaking: localSpeaking.hasAudioTrack && localSpeaking.isSpeaking,
        audioLevel: localSpeaking.audioLevel
      },
      ...webParticipants.map((participant) => ({
        kind: "remote" as const,
        participant,
        identity: participant.identity,
        name: participant.name ?? participant.identity,
        role: participant.role,
        hasAudioTrack: participant.hasAudioTrack,
        isSpeaking: participant.hasAudioTrack && participant.isSpeaking,
        audioLevel: participant.audioLevel
      }))
    ],
    [
      currentParticipantId,
      currentParticipantName,
      hasRobotAudio,
      localHasAudio,
      localRole,
      localSpeaking.audioLevel,
      localSpeaking.hasAudioTrack,
      localSpeaking.isSpeaking,
      robotAudioLevel,
      robotIdentity,
      robotIsSpeaking,
      robotName,
      webParticipants
    ]
  );
  const speakingSignature = participantItems
    .map((item) => `${item.identity}:${item.hasAudioTrack ? "a" : "n"}:${item.isSpeaking ? "s" : "q"}:${item.audioLevel.toFixed(2)}`)
    .join("|");
  const orderedItems = useMemo(
    () => sortParticipantItems(participantItems, speaker, lastSpokeAtById, Date.now()),
    [lastSpokeAtById, participantItems, speaker, speakingClock]
  );
  const participantCount = participantItems.length;
  const robotVideoPlaceholder = robotOnline ? "Waiting for robot video" : "Robot camera unavailable";

  useEffect(() => {
    const now = Date.now();
    const speakingUpdates = participantItems.filter((item) => item.hasAudioTrack && item.isSpeaking);
    if (speakingUpdates.length === 0) {
      return;
    }

    setLastSpokeAtById((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of speakingUpdates) {
        if ((next[item.identity] ?? 0) !== now) {
          next[item.identity] = now;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [speakingSignature]);

  useEffect(() => {
    const hasRecentSpeaker = Object.values(lastSpokeAtById).some((lastSpokeAt) => Date.now() - lastSpokeAt < SPEAKING_SORT_HOLD_MS);
    if (!hasRecentSpeaker) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSpeakingClock((current) => current + 1), SPEAKING_SORT_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [lastSpokeAtById, speakingClock]);

  return (
    <section className="tool-panel participants-panel" aria-labelledby="participants-title">
      <div className="panel-heading">
        <h2 id="participants-title">Participants</h2>
        <span>
          {participantCount} {participantCount === 1 ? "participant" : "participants"}
        </span>
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
        {orderedItems.map((item) => {
          if (item.kind === "robot") {
            return (
              <article className={`participant-tile participant-robot${robotIsSpeaking ? " is-speaking" : ""}`} key={robotIdentity}>
                <div className="participant-header">
                  <strong>{robotName}</strong>
                  <span>robot</span>
                </div>
                <RemoteVideo
                  track={robotVideo}
                  hasAudioTrack={hasRobotAudio}
                  isSpeaking={robotIsSpeaking}
                  audioLevel={robotAudioLevel}
                  placeholder={robotVideoPlaceholder}
                />
                <RemoteAudio track={robotAudio} muted={Boolean(locallyMutedAudio[robotMuteParticipantId])} />
                <div className="participant-media-state">
                  <span>Audio {hasRobotAudio ? "on" : "off"}</span>
                  <span>Video {hasRobotVideo ? "on" : "off"}</span>
                  <span>{locallyMutedAudio[robotMuteParticipantId] ? "Muted for you" : "Unmuted for you"}</span>
                </div>
                <div className="participant-actions">
                  <button
                    type="button"
                    className="stage-select-button"
                    disabled={robotSelected}
                    title={hasRobotVideo ? "Show robot camera on the main screen" : "Show robot camera placeholder on the main screen"}
                    onClick={() => onSelectStageParticipant(robotStageParticipantId)}
                  >
                    {robotSelected ? "On main" : "Show main"}
                  </button>
                  <AudioLocalMuteControl
                    currentRole={currentRole}
                    participantRole="robot"
                    participantId={robotMuteParticipantId}
                    hasAudio={hasRobotAudio}
                    locallyMuted={Boolean(locallyMutedAudio[robotMuteParticipantId])}
                    onToggleLocalAudioMute={onToggleLocalAudioMute}
                  />
                </div>
              </article>
            );
          }

          if (item.kind === "local") {
            return (
              <article
                className={`participant-tile participant-local participant-${localRole}${
                  localSpeaking.hasAudioTrack && localSpeaking.isSpeaking ? " is-speaking" : ""
                }`}
                key={currentParticipantId}
              >
                <div className="participant-header">
                  <strong>{currentParticipantName}</strong>
                  <span>{localRole}</span>
                  <em>You</em>
                </div>
                <LocalVideoPreview track={localVideoTrack} speaking={localSpeaking} />
                <div className="participant-media-state">
                  <span>Mic {localHasAudio ? "on" : "off"}</span>
                  <span>Camera {localHasVideo ? "on" : "off"}</span>
                  <span>Local preview</span>
                </div>
              </article>
            );
          }

          const { participant } = item;
          return (
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
          );
        })}
      </div>
    </section>
  );
}
