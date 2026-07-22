import type { KeyboardControlPublicConfig } from "../types.js";

export type KeyboardControlConfig = KeyboardControlPublicConfig;

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === "true";
}

function readInteger(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function readKeyboardControlConfig(env: NodeJS.ProcessEnv = process.env): KeyboardControlConfig {
  const maxLinearSpeed = positiveInteger(readInteger(env.ROBOT_KEYBOARD_MAX_LINEAR_SPEED, 120), 120);
  const maxAngularSpeed = positiveInteger(readInteger(env.ROBOT_KEYBOARD_MAX_ANGULAR_SPEED, 20), 20);
  const defaultLinearSpeed = clamp(
    positiveInteger(readInteger(env.ROBOT_KEYBOARD_DEFAULT_LINEAR_SPEED, 80), 80),
    1,
    maxLinearSpeed
  );
  const defaultAngularSpeed = clamp(
    positiveInteger(readInteger(env.ROBOT_KEYBOARD_DEFAULT_ANGULAR_SPEED, 15), 15),
    1,
    maxAngularSpeed
  );

  return {
    enabled: readBoolean(env.ROBOT_ENABLE_KEYBOARD_CONTROL, false),
    continuous1001Enabled: readBoolean(env.ROBOT_ENABLE_CONTINUOUS_1001, false),
    mode: "1001",
    sendIntervalMs: positiveInteger(readInteger(env.ROBOT_KEYBOARD_SEND_INTERVAL_MS, 300), 300),
    deadmanTimeoutMs: positiveInteger(readInteger(env.ROBOT_KEYBOARD_DEADMAN_TIMEOUT_MS, 900), 900),
    maxSessionMs: positiveInteger(readInteger(env.ROBOT_KEYBOARD_MAX_SESSION_MS, 10_000), 10_000),
    maxLinearSpeed,
    maxAngularSpeed,
    defaultLinearSpeed,
    defaultAngularSpeed,
    requireFocus: readBoolean(env.ROBOT_KEYBOARD_REQUIRE_FOCUS, true)
  };
}

export function getPublicKeyboardControlConfig(config: KeyboardControlConfig): KeyboardControlPublicConfig {
  return { ...config };
}
