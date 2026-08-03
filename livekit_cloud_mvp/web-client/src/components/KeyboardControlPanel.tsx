import { useState } from "react";
import type { KeyboardControlConfig, WebRole } from "../types";
import type { KeyboardDirectionControlState } from "../useKeyboardDirectionControl";

type KeyboardControlPanelProps = {
  role: WebRole | null;
  robotOnline: boolean;
  connectionState: string;
  config: KeyboardControlConfig;
  control: KeyboardDirectionControlState;
};

export function KeyboardControlPanel({
  role,
  robotOnline,
  connectionState,
  config,
  control
}: KeyboardControlPanelProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const controlsDisabled = !control.backendEnabled || role !== "controller" || !robotOnline || connectionState !== "connected";

  return (
    <div className="keyboard-control-panel" aria-labelledby="keyboard-control-title">
      <div className="panel-heading">
        <h3 id="keyboard-control-title">Keyboard direction control</h3>
        <span>{control.backendEnabled ? (control.enabled ? "ready" : "off") : "unavailable"}</span>
      </div>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={control.enabled}
          disabled={controlsDisabled}
          onChange={(event) => control.setEnabled(event.target.checked)}
        />
        启用方向键控制
      </label>

      <p className="risk-note">请低速测试，松开方向键自动停止，空格急停。</p>

      <div
        className="keyboard-help"
        onMouseEnter={() => setHelpOpen(true)}
        onMouseLeave={() => setHelpOpen(false)}
      >
        <button
          type="button"
          className="keyboard-help-button"
          aria-label="Show keyboard controls"
          aria-expanded={helpOpen}
          aria-controls="keyboard-help-popover"
          onClick={() => setHelpOpen((current) => !current)}
          onFocus={() => setHelpOpen(true)}
          onBlur={() => setHelpOpen(false)}
        >
          ?
        </button>
        {helpOpen ? (
          <div id="keyboard-help-popover" className="keyboard-help-popover" role="tooltip">
            <div className="keyboard-help-grid">
              <span>
                <kbd>W</kbd> / <kbd>↑</kbd>
                <strong>前进</strong>
              </span>
              <span>
                <kbd>S</kbd> / <kbd>↓</kbd>
                <strong>后退</strong>
              </span>
              <span>
                <kbd>A</kbd> / <kbd>←</kbd>
                <strong>左转</strong>
              </span>
              <span>
                <kbd>D</kbd> / <kbd>→</kbd>
                <strong>右转</strong>
              </span>
              <span>
                <kbd>W</kbd> + <kbd>A</kbd>
                <strong>左前</strong>
              </span>
              <span>
                <kbd>W</kbd> + <kbd>D</kbd>
                <strong>右前</strong>
              </span>
              <span>
                <kbd>S</kbd> + <kbd>A</kbd>
                <strong>左后</strong>
              </span>
              <span>
                <kbd>S</kbd> + <kbd>D</kbd>
                <strong>右后</strong>
              </span>
              <span className="keyboard-help-stop">
                <kbd>Space</kbd>
                <strong>急停</strong>
              </span>
            </div>
            <p>按住移动，松开停止。空格立即停止。聊天输入框聚焦时不会触发移动，页面失焦或断线会自动停止。</p>
          </div>
        ) : null}
      </div>

      <div className="keyboard-settings">
        <label>
          线速度 {control.linearSpeed}
          <input
            type="range"
            min={1}
            max={config.maxLinearSpeed}
            value={control.linearSpeed}
            onChange={(event) => control.setLinearSpeed(Number(event.target.value))}
          />
        </label>
        <label>
          角速度 {control.angularSpeed}
          <input
            type="range"
            min={1}
            max={config.maxAngularSpeed}
            value={control.angularSpeed}
            onChange={(event) => control.setAngularSpeed(Number(event.target.value))}
          />
        </label>
      </div>

      <p className="keyboard-simple-status">{control.keyboardStateText}</p>

      <button type="button" className="keyboard-stop-button" disabled={!control.enabled} onClick={() => control.sendStop("button_stop")}>
        Stop
      </button>
    </div>
  );
}
