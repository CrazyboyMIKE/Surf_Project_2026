import { useEffect, useRef, useState } from "react";
import type { KeyboardControlConfig, KeyboardControlStatus, KeyboardDirection, WebRole } from "../types";

type KeyboardControlPanelProps = {
  role: WebRole | null;
  robotOnline: boolean;
  connectionState: string;
  config: KeyboardControlConfig;
  status: KeyboardControlStatus | null;
  lastResult: string;
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
  if (!direction) return "idle";
  return direction.replace("_", " ");
}

export function KeyboardControlPanel({
  role,
  robotOnline,
  connectionState,
  config,
  status,
  lastResult,
  onStart,
  onKeepalive,
  onStop
}: KeyboardControlPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [linearSpeed, setLinearSpeed] = useState(config.defaultLinearSpeed);
  const [angularSpeed, setAngularSpeed] = useState(config.defaultAngularSpeed);
  const [localDirection, setLocalDirection] = useState<KeyboardDirection | null>(null);
  const [localStopReason, setLocalStopReason] = useState("");
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
    setLocalStopReason(reason);
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
    if (!canUseKeyboard || !latestDirectionRef.current) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const direction = latestDirectionRef.current;
      if (direction) {
        onKeepalive(direction, latestLinearSpeedRef.current, latestAngularSpeedRef.current);
      }
    }, config.sendIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [canUseKeyboard, config.sendIntervalMs, onKeepalive]);

  return (
    <div className="keyboard-control-panel" aria-labelledby="keyboard-control-title">
      <div className="panel-heading">
        <h3 id="keyboard-control-title">Keyboard direction control</h3>
        <span>{backendEnabled ? (enabled ? "armed" : "manual off") : "backend disabled"}</span>
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

      <div className="keyboard-status-grid">
        <span>
          Current <strong>{describeDirection(localDirection ?? status?.direction)}</strong>
        </span>
        <span>
          Active <strong>{status?.active ? "yes" : "no"}</strong>
        </span>
        <span>
          Stop reason <strong>{status?.stopReason ?? (localStopReason || "-")}</strong>
        </span>
        <span>
          Interval <strong>{config.sendIntervalMs}ms</strong>
        </span>
        <span>
          Deadman <strong>{config.deadmanTimeoutMs}ms</strong>
        </span>
        <span>
          Max session <strong>{config.maxSessionMs}ms</strong>
        </span>
      </div>

      {lastResult ? <p className="keyboard-result">{lastResult}</p> : null}

      <button type="button" className="keyboard-stop-button" disabled={!enabled} onClick={() => sendStop("button_stop")}>
        Stop
      </button>
    </div>
  );
}
