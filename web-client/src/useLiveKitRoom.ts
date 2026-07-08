import { useEffect, useMemo, useState } from "react";
import { RemoteVideoTrack, Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import type { JoinRoomResponse } from "./types";

export type LiveKitConnectionState = "idle" | "mock" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export type RobotVideoTrackInfo = {
  track: RemoteVideoTrack;
  participantIdentity: string;
  participantName?: string;
};

function isRobotParticipant(participant: RemoteParticipant): boolean {
  return `${participant.identity} ${participant.name ?? ""}`.toLowerCase().includes("robot");
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

export function useLiveKitRoom(session: JoinRoomResponse | null) {
  const [connectionState, setConnectionState] = useState<LiveKitConnectionState>("idle");
  const [robotVideoTrack, setRobotVideoTrack] = useState<RobotVideoTrackInfo | null>(null);
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    setRobotVideoTrack(null);
    setLastError("");

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
    let disposed = false;

    const updateRobotTrack = () => {
      if (!disposed) {
        setRobotVideoTrack(findRobotVideoTrack(room));
      }
    };

    room.on(RoomEvent.Connected, () => {
      setConnectionState("connected");
      updateRobotTrack();
    });
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      setConnectionState(String(state) as LiveKitConnectionState);
    });
    room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
    room.on(RoomEvent.Reconnected, () => {
      setConnectionState("connected");
      updateRobotTrack();
    });
    room.on(RoomEvent.Disconnected, () => {
      setConnectionState("disconnected");
      setRobotVideoTrack(null);
    });
    room.on(RoomEvent.ParticipantConnected, updateRobotTrack);
    room.on(RoomEvent.ParticipantDisconnected, updateRobotTrack);
    room.on(RoomEvent.TrackSubscribed, updateRobotTrack);
    room.on(RoomEvent.TrackUnsubscribed, updateRobotTrack);
    room.on(RoomEvent.TrackPublished, updateRobotTrack);
    room.on(RoomEvent.TrackUnpublished, updateRobotTrack);

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
      void room.disconnect();
    };
  }, [session?.participantId, session?.liveKitUrl, session?.token, session?.tokenMode]);

  return useMemo(
    () => ({
      connectionState,
      robotVideoTrack,
      lastError
    }),
    [connectionState, lastError, robotVideoTrack]
  );
}
