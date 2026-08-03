import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardControlConfig, KeyboardControlStatus, KeyboardDirection, WebRole } from "./types";

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";

type KeyboardDirectionControlOptions = {
  role: WebRole | null;
  robotOnline: boolean;
  connectionState: ConnectionState;
  config: KeyboardControlConfig;
  status: KeyboardControlStatus | null;
  onStart: (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => void;
  onKeepalive: (direction: KeyboardDirection, linearSpeed: number, angularSpeed: number) => void;
  onStop: () => void;
};

export type KeyboardDirectionControlState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  linearSpeed: number;
  setLinearSpeed: (speed: number) => void;
  angularSpeed: number;
  setAngularSpeed: (speed: number) => void;
  localDirection: KeyboardDirection | null;
  activeDirection: KeyboardDirection | null;
  backendEnabled: boolean;
  canUseKeyboard: boolean;
  keyboardStateText: string;
  sendStop: (reason: string) => void;
};

function normalizeControlKey(key: string): string | null {
  if (key === "ArrowUp" || key.toLowerCase() === "w") return "ArrowUp";
  if (key === "ArrowDown" || key.toLowerCase() === "s") return "ArrowDown";
  if (key === "ArrowLeft" || key.toLowerCase() === "a") return "ArrowLeft";
  if (key === "ArrowRight" || key.toLowerCase() === "d") return "ArrowRight";
  return null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.isContentEditable ||
      target.closest("input, textarea, select, button, a, [role='button'], [contenteditable='true']")
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
  role,
  robotOnline,
  connectionState,
  direction
}: {
  backendEnabled: boolean;
  enabled: boolean;
  role: WebRole | null;
  robotOnline: boolean;
  connectionState: ConnectionState;
  direction: KeyboardDirection | null;
}): string {
  if (!backendEnabled) {
    return "Keyboard control unavailable";
  }

  if (role !== "controller") {
    return "Controller only";
  }

  if (!robotOnline) {
    return "Robot offline";
  }

  if (connectionState !== "connected") {
    return "WebSocket disconnected";
  }

  if (!enabled) {
    return "Keyboard control off";
  }

  return direction ? `Moving ${describeDirection(direction)}` : "Keyboard control ready";
}

function clampSpeed(value: number, max: number): number {
  return Math.min(Math.max(value, 1), max);
}

export function useKeyboardDirectionControl({
  role,
  robotOnline,
  connectionState,
  config,
  status,
  onStart,
  onKeepalive,
  onStop
}: KeyboardDirectionControlOptions): KeyboardDirectionControlState {
  const [enabled, setEnabled] = useState(false);
  const [linearSpeed, setLinearSpeed] = useState(config.defaultLinearSpeed);
  const [angularSpeed, setAngularSpeed] = useState(config.defaultAngularSpeed);
  const [localDirection, setLocalDirection] = useState<KeyboardDirection | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeDirectionRef = useRef<KeyboardDirection | null>(null);
  const hasStartedRef = useRef(false);
  const latestDirectionRef = useRef<KeyboardDirection | null>(null);
  const latestLinearSpeedRef = useRef(linearSpeed);
  const latestAngularSpeedRef = useRef(angularSpeed);

  const backendEnabled = config.enabled && config.continuous1001Enabled;
  const canUseKeyboard = enabled && backendEnabled && role === "controller" && robotOnline && connectionState === "connected";
  const activeDirection = localDirection ?? (status?.active ? (status.direction ?? null) : null);

  useEffect(() => {
    setLinearSpeed((current) => clampSpeed(current, config.maxLinearSpeed));
    setAngularSpeed((current) => clampSpeed(current, config.maxAngularSpeed));
  }, [config.maxAngularSpeed, config.maxLinearSpeed]);

  useEffect(() => {
    latestLinearSpeedRef.current = clampSpeed(linearSpeed, config.maxLinearSpeed);
    latestAngularSpeedRef.current = clampSpeed(angularSpeed, config.maxAngularSpeed);
  }, [angularSpeed, config.maxAngularSpeed, config.maxLinearSpeed, linearSpeed]);

  const sendStop = useCallback(
    (_reason: string) => {
      if (hasStartedRef.current || activeDirectionRef.current) {
        onStop();
      }
      pressedKeysRef.current.clear();
      activeDirectionRef.current = null;
      latestDirectionRef.current = null;
      hasStartedRef.current = false;
      setLocalDirection(null);
    },
    [onStop]
  );

  const sendDirection = useCallback(
    (direction: KeyboardDirection) => {
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
    },
    [onKeepalive, onStart]
  );

  useEffect(() => {
    if (!canUseKeyboard) {
      sendStop("disabled_or_unavailable");
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isInteractiveTarget(event.target)) {
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
      const normalizedKey = normalizeControlKey(event.key);
      if (!normalizedKey) {
        return;
      }

      if (isInteractiveTarget(event.target) && !pressedKeysRef.current.has(normalizedKey)) {
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

    function handleFocusIn(event: FocusEvent) {
      if (isInteractiveTarget(event.target)) {
        sendStop("interactive_focus");
      }
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
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sendStop("listener_removed");
    };
  }, [canUseKeyboard, config.requireFocus, sendDirection, sendStop]);

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
    role,
    robotOnline,
    connectionState,
    direction: activeDirection
  });

  return useMemo(
    () => ({
      enabled,
      setEnabled,
      linearSpeed,
      setLinearSpeed,
      angularSpeed,
      setAngularSpeed,
      localDirection,
      activeDirection,
      backendEnabled,
      canUseKeyboard,
      keyboardStateText,
      sendStop
    }),
    [
      activeDirection,
      angularSpeed,
      backendEnabled,
      canUseKeyboard,
      enabled,
      keyboardStateText,
      linearSpeed,
      localDirection,
      sendStop
    ]
  );
}
