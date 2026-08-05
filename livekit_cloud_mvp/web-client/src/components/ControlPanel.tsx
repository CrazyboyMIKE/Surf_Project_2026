import type {
  ControlParameters,
  ControlRequestParticipant,
  KeyboardControlConfig,
  RobotCommand,
  WebRole
} from "../types";
import type { KeyboardDirectionControlState } from "../useKeyboardDirectionControl";
import { KeyboardControlPanel } from "./KeyboardControlPanel";

type ControlPanelProps = {
  role: WebRole | null;
  participantId: string;
  controlRequestQueue: ControlRequestParticipant[];
  robotOnline: boolean;
  connectionState: string;
  actionPending: boolean;
  keyboardControlConfig: KeyboardControlConfig;
  keyboardControl: KeyboardDirectionControlState;
  onControl: (command: RobotCommand, parameters?: ControlParameters) => void;
  onTransferControl: (targetParticipantId: string) => void;
};

export function ControlPanel({
  role,
  participantId,
  controlRequestQueue,
  robotOnline,
  connectionState,
  actionPending,
  keyboardControlConfig,
  keyboardControl,
  onControl,
  onTransferControl
}: ControlPanelProps) {
  const disabled = role !== "controller" || !robotOnline || connectionState !== "connected";
  const pendingControlRequests = controlRequestQueue.filter((participant) => participant.id !== participantId && participant.connected);

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
        <button type="button" disabled={disabled} onClick={() => onControl("1003", { angleDeg: 15 })}>
          ↺
          <span>Left</span>
        </button>
        <button type="button" className="stop-button" disabled={disabled} onClick={() => onControl("1000")}>
          ■
          <span>Stop</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1003", { angleDeg: -15 })}>
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
        control={keyboardControl}
      />

      {role === "controller" ? (
        <div className="transfer-panel" aria-labelledby="transfer-title">
          <div className="panel-heading">
            <h3 id="transfer-title">Control requests</h3>
            <span>{pendingControlRequests.length} pending</span>
          </div>

          {pendingControlRequests.length === 0 ? (
            <p className="empty-state">No pending control requests</p>
          ) : (
            <div className="transfer-list">
              {pendingControlRequests.map((requester) => (
                <div className="transfer-row" key={requester.id}>
                  <span>{requester.name}</span>
                  <button
                    type="button"
                    className="transfer-button"
                    disabled={actionPending}
                    onClick={() => {
                      if (window.confirm(`Approve control request from ${requester.name}?`)) {
                        onTransferControl(requester.id);
                      }
                    }}
                  >
                    Approve
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
