import { useState } from "react";
import type { WebRole } from "../types";

type StatusBarProps = {
  roomName: string;
  participantName: string;
  role: WebRole | null;
  isSpeaker: boolean;
  webSocketState: string;
  robotOnline: boolean;
  currentControllerName?: string;
  controlRequestPending: boolean;
  controlActionsDisabled: boolean;
  onRequestControl: () => void;
  onReleaseControl: () => void;
  onLeaveRoom: () => void;
  actionPending: boolean;
};

export function StatusBar({
  roomName,
  participantName,
  role,
  isSpeaker,
  webSocketState,
  robotOnline,
  currentControllerName,
  controlRequestPending,
  controlActionsDisabled,
  onRequestControl,
  onReleaseControl,
  onLeaveRoom,
  actionPending
}: StatusBarProps) {
  const isController = role === "controller";
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <header className="status-bar compact-status-bar">
      <div className="room-title-block">
        <p className="eyebrow">Room</p>
        <h1>{roomName}</h1>
      </div>

      <div className="compact-status-badges" aria-label="Room summary">
        <span className="state-pill">{role ?? "viewer"}</span>
        {isSpeaker ? <span className="state-pill speaker">Speaker</span> : null}
        <span className={`state-pill ${webSocketState === "connected" ? "online" : "offline"}`}>
          {webSocketState === "connected" ? "connected" : "reconnecting"}
        </span>
        <span className={`state-pill ${robotOnline ? "online" : "offline"}`}>{robotOnline ? "robot online" : "robot offline"}</span>
      </div>

      <div className="status-popover-wrap">
        <button
          type="button"
          className="secondary-button compact-status-button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((current) => !current)}
        >
          Status
        </button>
        {detailsOpen ? (
          <div className="status-popover" role="dialog" aria-label="Room status details">
            <div className="floating-panel-top">
              <h2>Status</h2>
              <button type="button" className="panel-close-button" onClick={() => setDetailsOpen(false)}>
                Close
              </button>
            </div>
            <div className="status-grid" aria-label="Room status">
              <span>
                User <strong>{participantName}</strong>
              </span>
              <span>
                Role <strong>{role ?? "viewer"}</strong>
              </span>
              <span>
                Controller <strong>{currentControllerName ?? "none"}</strong>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="status-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onRequestControl}
          disabled={isController || controlRequestPending || actionPending || controlActionsDisabled}
        >
          {controlRequestPending ? "Request queued" : "Request control"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onReleaseControl}
          disabled={(!isController && !controlRequestPending) || actionPending || controlActionsDisabled}
        >
          {controlRequestPending ? "Cancel" : "Release"}
        </button>
        <button type="button" className="secondary-button" onClick={onLeaveRoom} disabled={actionPending}>
          Leave room
        </button>
      </div>
    </header>
  );
}
