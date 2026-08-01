import { useEffect, useRef, useState } from "react";
import type { KeyboardControlConfig, KeyboardControlStatus, KeyboardDirection, WebRole } from "../types";

type KeyboardControlPanelProps = {
  role: WebRole | null;
  robotOnline: boolean;
  connectionState: string;
  config: KeyboardControlConfig;
  status: KeyboardControlStatus | null;
  onStart: (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => void;
  onKeepalive: (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => void;
  onStop: () => void;
};

function normalizeControlKey(key: string): string | null {
  if (key === "ArrowUp" || key.toLowerCase() === "w") return "ArrowUp";
  if (key === "ArrowDown" || key.toLowerCase() === "s") return "ArrowDown";
  if (key === "ArrowLeft" || key.toLowerCase() === "a") return "ArrowLeft";
  if (key === "ArrowRight" || key.toLowerCase() === "d") return "ArrowRight";
  return null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function directionFromKeys(keys: Set<string>): KeyboardDirection | null {
  const up = keys.has("ArrowUp");
  const down = keys.has("ArrowDown");
  const left = keys.has("ArrowLeft");
  const right = keys.has("ArrowRight");

  if (up && left && !down && !right) return "forward_left";
  if (up && right && !down && !left) return "forward_right";
  if (down && left && !up && !right) return "backward_left";
  if (down && right && !up && !left) return "backward_right";
  if (up && !down) return "forward";
  if (down && !up) return "backward";
  if (left && !right) return "left";
  if (right && !left) return "right";
  return null;
}

function describeDirection(direction: KeyboardDirection | undefined): string {
  if (!direction) return "stopped";
  return direction.replace("_", " ");
}

function describeKeyboardState({
  backendEnabled,
  enabled,
  canUseKeyboard,
  localDirection,
  remoteDirection,
  remoteActive
}: {
  backendEnabled: boolean;
  enabled: boolean;
  canUseKeyboard: boolean;
  localDirection: KeyboardDirection | null;
  remoteDirection?: KeyboardDirection;
  remoteActive?: boolean;
}): string {
  if (!backendEnabled || !canUseKeyboard) {
    return "Keyboard control unavailable";
  }

  const direction = localDirection ?? remoteDirection;
  if (direction && remoteActive !== false) {
    return `Moving ${describeDirection(direction)}`;
  }

  return enabled ? "Keyboard control ready" : "Keyboard control off";
}

export function KeyboardControlPanel({
  role,
  robotOnline,
  connectionState,
  config,
  status,
  onStart,
  onKeepalive,
  onStop
}: KeyboardControlPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [linearSpeed, setLinearSpeed] = useState(config.defaultLinearSpeed);
  const [angularSpeed, setAngularSpeed] = useState(config.defaultAngularSpeed);
  const [localDirection, setLocalDirection] = useState<KeyboardDirection | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeDirectionRef = useRef<KeyboardDirection | null>(null);
  const hasStartedRef = useRef(false);
  const latestDirectionRef = useRef<KeyboardDirection | null>(null);
  const latestLinearSpeedRef = useRef(linearSpeed);
  const latestAngularSpeedRef = useRef(angularSpeed);

  const backendEnabled = config.enabled && config.continuous1001Enabled;
  const canUseKeyboard = enabled && backendEnabled && role === "controller" && robotOnline && connectionState === "connected";

  useEffect(() => {
    latestLinearSpeedRef.current = Math.min(Math.max(linearSpeed, 1), config.maxLinearSpeed);
    latestAngularSpeedRef.current = Math.min(Math.max(angularSpeed, 1), config.maxAngularSpeed);
  }, [angularSpeed, config.maxAngularSpeed, config.maxLinearSpeed, linearSpeed]);

  function sendStop(reason: string) {
    if (hasStartedRef.current || activeDirectionRef.current) {
      onStop();
    }
    pressedKeysRef.current.clear();
    activeDirectionRef.current = null;
    latestDirectionRef.current = null;
    hasStartedRef.current = false;
    setLocalDirection(null);
  }

  function sendDirection(direction: KeyboardDirection) {
    const nextLinearSpeed = latestLinearSpeedRef.current;
    const nextAngularSpeed = latestAngularSpeedRef.current;
    const previousDirection = activeDirectionRef.current;
    activeDirectionRef.current = direction;
    latestDirectionRef.current = direction;
    setLocalDirection(direction);

    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      onStart(direction, nextLinearSpeed, nextAngularSpeed);
      return;
    }

    if (previousDirection !== direction) {
      onKeepalive(direction, nextLinearSpeed, nextAngularSpeed);
    }
  }

  useEffect(() => {
    if (!canUseKeyboard) {
      sendStop("disabled_or_unavailable");
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        sendStop("space_stop");
        return;
      }

      const normalizedKey = normalizeControlKey(event.key);
      if (!normalizedKey) {
        return;
      }

      event.preventDefault();
      pressedKeysRef.current.add(normalizedKey);
      const nextDirection = directionFromKeys(pressedKeysRef.current);
      if (nextDirection) {
        sendDirection(nextDirection);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const normalizedKey = normalizeControlKey(event.key);
      if (!normalizedKey) {
        return;
      }

      event.preventDefault();
      pressedKeysRef.current.delete(normalizedKey);
      const nextDirection = directionFromKeys(pressedKeysRef.current);
      if (!nextDirection) {
        sendStop("key_release");
        return;
      }

      sendDirection(nextDirection);
    }

    function handleBlur() {
      if (config.requireFocus) {
        sendStop("window_blur");
      }
    }

    function handleBeforeUnload() {
      sendStop("page_unload");
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sendStop("listener_removed");
    };
  }, [canUseKeyboard, config.requireFocus, onKeepalive, onStart, onStop]);

  useEffect(() => {
    if (!canUseKeyboard || !localDirection) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const direction = latestDirectionRef.current;
      if (direction) {
        onKeepalive(direction, latestLinearSpeedRef.current, latestAngularSpeedRef.current);
      }
    }, config.sendIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [canUseKeyboard, config.sendIntervalMs, localDirection, onKeepalive]);

  const keyboardStateText = describeKeyboardState({
    backendEnabled,
    enabled,
    canUseKeyboard,
    localDirection,
    remoteDirection: status?.direction,
    remoteActive: status?.active
  });

  return (
    <div className="keyboard-control-panel" aria-labelledby="keyboard-control-title">
      <div className="panel-heading">
        <h3 id="keyboard-control-title">Keyboard direction control</h3>
        <span>{backendEnabled ? (enabled ? "ready" : "off") : "unavailable"}</span>
      </div>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!backendEnabled || role !== "controller" || !robotOnline || connectionState !== "connected"}
          onChange={(event) => setEnabled(event.target.checked)}
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
          线速度 {linearSpeed}
          <input
            type="range"
            min={1}
            max={config.maxLinearSpeed}
            value={linearSpeed}
            onChange={(event) => setLinearSpeed(Number(event.target.value))}
          />
        </label>
        <label>
          角速度 {angularSpeed}
          <input
            type="range"
            min={1}
            max={config.maxAngularSpeed}
            value={angularSpeed}
            onChange={(event) => setAngularSpeed(Number(event.target.value))}
          />
        </label>
      </div>

      <p className="keyboard-simple-status">{keyboardStateText}</p>

      <button type="button" className="keyboard-stop-button" disabled={!enabled} onClick={() => sendStop("button_stop")}>
        Stop
      </button>
    </div>
  );
}
