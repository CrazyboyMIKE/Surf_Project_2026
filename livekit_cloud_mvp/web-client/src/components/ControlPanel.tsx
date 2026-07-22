import type {
  ControlParameters,
  KeyboardControlConfig,
  KeyboardControlStatus,
  KeyboardDirection,
  ParticipantSummary,
  RobotCommand,
  WebRole
} from "../types";
import { KeyboardControlPanel } from "./KeyboardControlPanel";

type ControlPanelProps = {
  role: WebRole | null;
  participantId: string;
  participants: ParticipantSummary[];
  robotOnline: boolean;
  connectionState: string;
  actionPending: boolean;
  keyboardControlConfig: KeyboardControlConfig;
  keyboardStatus: KeyboardControlStatus | null;
  lastKeyboardResult: string;
  onControl: (command: RobotCommand, parameters?: ControlParameters) => void;
  onTransferControl: (targetParticipantId: string) => void;
  onKeyboardStart: (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => void;
  onKeyboardKeepalive: (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => void;
  onKeyboardStop: () => void;
};

export function ControlPanel({
  role,
  participantId,
  participants,
  robotOnline,
  connectionState,
  actionPending,
  keyboardControlConfig,
  keyboardStatus,
  lastKeyboardResult,
  onControl,
  onTransferControl,
  onKeyboardStart,
  onKeyboardKeepalive,
  onKeyboardStop
}: ControlPanelProps) {
  const disabled = role !== "controller" || !robotOnline || connectionState !== "connected";
  const transferableViewers = participants.filter(
    (participant) => participant.id !== participantId && participant.role === "viewer" && participant.connected
  );

  return (
    <section className="tool-panel" aria-labelledby="control-title">
      <div className="panel-heading">
        <h2 id="control-title">Robot Control</h2>
        <span>{role === "controller" ? "enabled" : "viewer locked"}</span>
      </div>

      <div className="control-pad">
        <button type="button" disabled={disabled} onClick={() => onControl("1002", { distanceCm: 20 })}>
          ↑
          <span>Forward</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1003", { angleDeg: -15 })}>
          ↺
          <span>Left</span>
        </button>
        <button type="button" className="stop-button" disabled={disabled} onClick={() => onControl("1000")}>
          ■
          <span>Stop</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1003", { angleDeg: 15 })}>
          ↻
          <span>Right</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1002", { distanceCm: -20 })}>
          ↓
          <span>Back</span>
        </button>
      </div>

      <KeyboardControlPanel
        role={role}
        robotOnline={robotOnline}
        connectionState={connectionState}
        config={keyboardControlConfig}
        status={keyboardStatus}
        lastResult={lastKeyboardResult}
        onStart={onKeyboardStart}
        onKeepalive={onKeyboardKeepalive}
        onStop={onKeyboardStop}
      />

      {role === "controller" ? (
        <div className="transfer-panel" aria-labelledby="transfer-title">
          <div className="panel-heading">
            <h3 id="transfer-title">Transfer control</h3>
            <span>{transferableViewers.length} online viewers</span>
          </div>

          {transferableViewers.length === 0 ? (
            <p className="empty-state">No online viewers available for transfer</p>
          ) : (
            <div className="transfer-list">
              {transferableViewers.map((viewer) => (
                <div className="transfer-row" key={viewer.id}>
                  <span>{viewer.name}</span>
                  <button
                    type="button"
                    className="transfer-button"
                    disabled={actionPending}
                    onClick={() => {
                      if (window.confirm(`Transfer control to ${viewer.name}?`)) {
                        onTransferControl(viewer.id);
                      }
                    }}
                  >
                    转交控制权
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
