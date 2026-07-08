import type { ControlParameters, RobotCommand, WebRole } from "../types";

type ControlPanelProps = {
  role: WebRole | null;
  robotOnline: boolean;
  connectionState: string;
  onControl: (command: RobotCommand, parameters?: ControlParameters) => void;
};

export function ControlPanel({ role, robotOnline, connectionState, onControl }: ControlPanelProps) {
  const disabled = role !== "controller" || !robotOnline || connectionState !== "connected";

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
    </section>
  );
}
