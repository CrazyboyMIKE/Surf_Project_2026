import type { ParticipantSummary, WebRole } from "../types";

type StatusBarProps = {
  roomName: string;
  participantName: string;
  role: WebRole | null;
  backendState: string;
  webSocketState: string;
  liveKitState: string;
  robotOnline: boolean;
  currentControllerName?: string;
  participants: ParticipantSummary[];
  onRequestControl: () => void;
  onReleaseControl: () => void;
  actionPending: boolean;
};

export function StatusBar({
  roomName,
  participantName,
  role,
  backendState,
  webSocketState,
  liveKitState,
  robotOnline,
  currentControllerName,
  participants,
  onRequestControl,
  onReleaseControl,
  actionPending
}: StatusBarProps) {
  const isController = role === "controller";

  return (
    <header className="status-bar">
      <div>
        <p className="eyebrow">Room</p>
        <h1>{roomName}</h1>
      </div>

      <div className="status-grid" aria-label="Room status">
        <span>
          User <strong>{participantName}</strong>
        </span>
        <span>
          Role <strong>{role ?? "viewer"}</strong>
        </span>
        <span>
          Backend <strong>{backendState}</strong>
        </span>
        <span>
          WebSocket <strong>{webSocketState}</strong>
        </span>
        <span>
          LiveKit <strong>{liveKitState}</strong>
        </span>
        <span>
          Robot <strong>{robotOnline ? "online" : "offline"}</strong>
        </span>
        <span>
          Controller <strong>{currentControllerName ?? "none"}</strong>
        </span>
        <span>
          Participants <strong>{participants.length || 1}</strong>
        </span>
      </div>

      <div className="status-actions">
        <button type="button" className="secondary-button" onClick={onRequestControl} disabled={isController || actionPending}>
          Request control
        </button>
        <button type="button" className="secondary-button" onClick={onReleaseControl} disabled={!isController || actionPending}>
          Release
        </button>
      </div>
    </header>
  );
}
