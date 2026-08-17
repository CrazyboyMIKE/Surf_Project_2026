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
        Enable arrow-key control
      </label>

      <p className="risk-note">Test at low speed. Releasing the keys stops movement; Space stops immediately.</p>

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
                <strong>Forward</strong>
              </span>
              <span>
                <kbd>S</kbd> / <kbd>↓</kbd>
                <strong>Back</strong>
              </span>
              <span>
                <kbd>A</kbd> / <kbd>←</kbd>
                <strong>Left</strong>
              </span>
              <span>
                <kbd>D</kbd> / <kbd>→</kbd>
                <strong>Right</strong>
              </span>
              <span>
                <kbd>W</kbd> + <kbd>A</kbd>
                <strong>Forward left</strong>
              </span>
              <span>
                <kbd>W</kbd> + <kbd>D</kbd>
                <strong>Forward right</strong>
              </span>
              <span>
                <kbd>S</kbd> + <kbd>A</kbd>
                <strong>Back left</strong>
              </span>
              <span>
                <kbd>S</kbd> + <kbd>D</kbd>
                <strong>Back right</strong>
              </span>
              <span className="keyboard-help-stop">
                <kbd>Space</kbd>
                <strong>Emergency stop</strong>
              </span>
            </div>
            <p>Hold to move, release to stop. Space stops immediately. Chat focus, page blur, or disconnect will not keep movement running.</p>
          </div>
        ) : null}
      </div>

      <div className="keyboard-settings">
        <label>
          Linear speed {control.linearSpeed}
          <input
            type="range"
            min={1}
            max={config.maxLinearSpeed}
            value={control.linearSpeed}
            onChange={(event) => control.setLinearSpeed(Number(event.target.value))}
            onMouseUp={(event) => event.currentTarget.blur()}
            onPointerUp={(event) => event.currentTarget.blur()}
            onTouchEnd={(event) => event.currentTarget.blur()}
          />
        </label>
        <label>
          Angular speed {control.angularSpeed}
          <input
            type="range"
            min={1}
            max={config.maxAngularSpeed}
            value={control.angularSpeed}
            onChange={(event) => control.setAngularSpeed(Number(event.target.value))}
            onMouseUp={(event) => event.currentTarget.blur()}
            onPointerUp={(event) => event.currentTarget.blur()}
            onTouchEnd={(event) => event.currentTarget.blur()}
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
