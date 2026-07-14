import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant
} from "livekit-client";
import type { JoinRoomResponse, Role } from "./types";

export type LiveKitConnectionState = "idle" | "mock" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export type RobotVideoTrackInfo = {
  track: RemoteVideoTrack;
  participantIdentity: string;
  participantName?: string;
};

export type LocalMediaState = "off" | "starting" | "on" | "permission-denied" | "device-not-found" | "not-allowed" | "error";

export type RemoteParticipantMediaInfo = {
  identity: string;
  name?: string;
  role: Role | "unknown";
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioTrack: RemoteAudioTrack | null;
  videoTrack: RemoteVideoTrack | null;
};

function isRobotParticipant(participant: RemoteParticipant): boolean {
  return `${participant.identity} ${participant.name ?? ""}`.toLowerCase().includes("robot");
}

function readParticipantRole(participant: RemoteParticipant): Role | "unknown" {
  if (!participant.metadata) {
    return "unknown";
  }

  try {
    const metadata = JSON.parse(participant.metadata) as { role?: unknown };
    return metadata.role === "robot" || metadata.role === "controller" || metadata.role === "viewer" ? metadata.role : "unknown";
  } catch {
    return "unknown";
  }
}

function findRobotVideoTrack(room: Room): RobotVideoTrackInfo | null {
  const robotParticipants = Array.from(room.remoteParticipants.values()).filter(isRobotParticipant);

  for (const participant of robotParticipants) {
    for (const publication of participant.videoTrackPublications.values()) {
      if (publication.track && publication.track.kind === Track.Kind.Video) {
        return {
          track: publication.track as RemoteVideoTrack,
          participantIdentity: participant.identity,
          participantName: participant.name
        };
      }
    }
  }

  return null;
}

function collectRemoteParticipants(room: Room): RemoteParticipantMediaInfo[] {
  return Array.from(room.remoteParticipants.values())
    .filter((participant) => !isRobotParticipant(participant))
    .map((participant) => {
      const audioPublication = Array.from(participant.audioTrackPublications.values()).find((publication) => publication.track);
      const videoPublication = Array.from(participant.videoTrackPublications.values()).find((publication) => publication.track);

      return {
        identity: participant.identity,
        name: participant.name,
        role: readParticipantRole(participant),
        audioEnabled: Boolean(audioPublication?.isEnabled && audioPublication.track),
        videoEnabled: Boolean(videoPublication?.isEnabled && videoPublication.track),
        audioTrack: audioPublication?.track instanceof RemoteAudioTrack ? audioPublication.track : null,
        videoTrack: videoPublication?.track instanceof RemoteVideoTrack ? videoPublication.track : null
      };
    });
}

function classifyMediaError(error: unknown): LocalMediaState {
  if (!(error instanceof DOMException)) {
    return "error";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError" || error.name === "PermissionDeniedError") {
    return "permission-denied";
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "device-not-found";
  }

  return "error";
}

export function useLiveKitRoom(session: JoinRoomResponse | null) {
  const roomRef = useRef<Room | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const [connectionState, setConnectionState] = useState<LiveKitConnectionState>("idle");
  const [robotVideoTrack, setRobotVideoTrack] = useState<RobotVideoTrackInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantMediaInfo[]>([]);
  const [localAudioState, setLocalAudioState] = useState<LocalMediaState>("off");
  const [localVideoState, setLocalVideoState] = useState<LocalMediaState>("off");
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    setRobotVideoTrack(null);
    setRemoteParticipants([]);
    setLastError("");
    setLocalAudioState("off");
    setLocalVideoState("off");
    setLocalVideoTrack(null);

    if (!session) {
      setConnectionState("idle");
      return;
    }

    if (session.tokenMode === "mock" || session.liveKitUrl.startsWith("mock://")) {
      setConnectionState("mock");
      return;
    }

    const room = new Room({
      adaptiveStream: true
    });
    roomRef.current = room;
    let disposed = false;

    const updateRemoteMedia = () => {
      if (!disposed) {
        setRobotVideoTrack(findRobotVideoTrack(room));
        setRemoteParticipants(collectRemoteParticipants(room));
        setCanPlaybackAudio(room.canPlaybackAudio);
      }
    };

    room.on(RoomEvent.Connected, () => {
      setConnectionState("connected");
      updateRemoteMedia();
    });
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      setConnectionState(String(state) as LiveKitConnectionState);
    });
    room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
    room.on(RoomEvent.Reconnected, () => {
      setConnectionState("connected");
      updateRemoteMedia();
    });
    room.on(RoomEvent.Disconnected, () => {
      setConnectionState("disconnected");
      setRobotVideoTrack(null);
      setRemoteParticipants([]);
    });
    room.on(RoomEvent.ParticipantConnected, updateRemoteMedia);
    room.on(RoomEvent.ParticipantDisconnected, updateRemoteMedia);
    room.on(RoomEvent.TrackSubscribed, updateRemoteMedia);
    room.on(RoomEvent.TrackUnsubscribed, updateRemoteMedia);
    room.on(RoomEvent.TrackPublished, updateRemoteMedia);
    room.on(RoomEvent.TrackUnpublished, updateRemoteMedia);
    room.on(RoomEvent.TrackMuted, updateRemoteMedia);
    room.on(RoomEvent.TrackUnmuted, updateRemoteMedia);
    room.on(RoomEvent.AudioPlaybackStatusChanged, updateRemoteMedia);

    setConnectionState("connecting");
    void room.connect(session.liveKitUrl, session.token, { autoSubscribe: true }).catch((error: unknown) => {
      if (disposed) {
        return;
      }
      setConnectionState("error");
      setLastError(error instanceof Error ? error.message : "LiveKit connection failed");
    });

    return () => {
      disposed = true;
      setRobotVideoTrack(null);
      setRemoteParticipants([]);
      localAudioTrackRef.current?.stop();
      localVideoTrackRef.current?.stop();
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      setLocalAudioState("off");
      setLocalVideoState("off");
      setLocalVideoTrack(null);
      roomRef.current = null;
      void room.disconnect();
    };
  }, [session?.participantId, session?.liveKitUrl, session?.token, session?.tokenMode]);

  const toggleMicrophone = useCallback(async () => {
    if (!session?.mediaPermissions.canPublishAudio) {
      setLocalAudioState("not-allowed");
      setLastError("Current role cannot publish microphone audio.");
      return;
    }

    const room = roomRef.current;
    if (!room || connectionState !== "connected") {
      setLastError("LiveKit must be connected before enabling microphone.");
      return;
    }

    if (localAudioTrackRef.current) {
      const track = localAudioTrackRef.current;
      localAudioTrackRef.current = null;
      await room.localParticipant.unpublishTrack(track, true);
      track.stop();
      setLocalAudioState("off");
      return;
    }

    try {
      setLocalAudioState("starting");
      const track = await createLocalAudioTrack();
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
        name: `${session.participantName}-microphone`
      });
      localAudioTrackRef.current = track;
      setLocalAudioState("on");
      setLastError("");
    } catch (error) {
      setLocalAudioState(classifyMediaError(error));
      setLastError(error instanceof Error ? error.message : "Microphone failed to start");
    }
  }, [connectionState, session]);

  const toggleCamera = useCallback(async () => {
    if (!session?.mediaPermissions.canPublishVideo) {
      setLocalVideoState("not-allowed");
      setLastError("Current role cannot publish camera video.");
      return;
    }

    const room = roomRef.current;
    if (!room || connectionState !== "connected") {
      setLastError("LiveKit must be connected before enabling camera.");
      return;
    }

    if (localVideoTrackRef.current) {
      const track = localVideoTrackRef.current;
      localVideoTrackRef.current = null;
      await room.localParticipant.unpublishTrack(track, true);
      track.stop();
      setLocalVideoTrack(null);
      setLocalVideoState("off");
      return;
    }

    try {
      setLocalVideoState("starting");
      const track = await createLocalVideoTrack();
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        name: `${session.participantName}-camera`
      });
      localVideoTrackRef.current = track;
      setLocalVideoTrack(track);
      setLocalVideoState("on");
      setLastError("");
    } catch (error) {
      setLocalVideoState(classifyMediaError(error));
      setLastError(error instanceof Error ? error.message : "Camera failed to start");
    }
  }, [connectionState, session]);

  const enableAudioPlayback = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    try {
      await room.startAudio();
      setCanPlaybackAudio(room.canPlaybackAudio);
      setLastError("");
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Audio playback could not start");
    }
  }, []);

  return useMemo(
    () => ({
      connectionState,
      robotVideoTrack,
      remoteParticipants,
      localAudioState,
      localVideoState,
      localVideoTrack,
      canPlaybackAudio,
      lastError,
      toggleMicrophone,
      toggleCamera,
      enableAudioPlayback
    }),
    [
      canPlaybackAudio,
      connectionState,
      enableAudioPlayback,
      lastError,
      localAudioState,
      localVideoState,
      localVideoTrack,
      remoteParticipants,
      robotVideoTrack,
      toggleCamera,
      toggleMicrophone
    ]
  );
}
