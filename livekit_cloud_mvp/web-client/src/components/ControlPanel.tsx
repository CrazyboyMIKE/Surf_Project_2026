import { useEffect, useRef, useState } from "react";
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

const HEAD_VERTICAL_DIRECTION = 1;
const HEAD_TILT_SPEED_DEG_PER_SEC = 60;
const HEAD_TILT_UP_ANGLE_DEG = 15;
const HEAD_TILT_DOWN_ANGLE_DEG = -15;

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
  const [headStopArmed, setHeadStopArmed] = useState(false);
  const headStopArmedRef = useRef(false);
  const transferableViewers = participants.filter(
    (participant) => participant.id !== participantId && participant.role === "viewer" && participant.connected
  );

  function sendHeadTilt(angleDeg: number) {
    onControl("1005", {
      d: HEAD_VERTICAL_DIRECTION,
      a: angleDeg,
      av: HEAD_TILT_SPEED_DEG_PER_SEC
    });
    headStopArmedRef.current = true;
    setHeadStopArmed(true);
  }

  function sendHeadStop() {
    onControl("1004");
    headStopArmedRef.current = false;
    setHeadStopArmed(false);
  }

  function sendHeadReset() {
    onControl("1006", { d: HEAD_VERTICAL_DIRECTION });
    headStopArmedRef.current = false;
    setHeadStopArmed(false);
  }

  useEffect(() => {
    if (!headStopArmed && headStopArmedRef.current) {
      headStopArmedRef.current = false;
    }
  }, [headStopArmed]);

  useEffect(() => {
    function handleBlur() {
      if (!headStopArmedRef.current || disabled) {
        return;
      }

      sendHeadStop();
    }

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [disabled]);

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
          <small>1002 d=20cm</small>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1003", { angleDeg: 15 })}>
          ↺
          <span>Left</span>
          <small>1003 a=15deg</small>
        </button>
        <button type="button" className="stop-button" disabled={disabled} onClick={() => onControl("1000")}>
          ■
          <span>Stop</span>
          <small>1000 stop</small>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1003", { angleDeg: -15 })}>
          ↻
          <span>Right</span>
          <small>1003 a=-15deg</small>
        </button>
        <button type="button" disabled={disabled} onClick={() => onControl("1002", { distanceCm: -20 })}>
          ↓
          <span>Back</span>
          <small>1002 d=-20cm</small>
        </button>
      </div>

      <div className="head-control-panel" aria-labelledby="head-control-title">
        <div className="panel-heading">
          <h3 id="head-control-title">Head Control</h3>
          <span>{role === "controller" ? "safe step" : "viewer locked"}</span>
        </div>

        <div className="head-control-grid">
          <button type="button" disabled={disabled} onClick={() => sendHeadTilt(HEAD_TILT_UP_ANGLE_DEG)}>
            抬头
            <span>{HEAD_TILT_UP_ANGLE_DEG}deg</span>
            <small>1005 d=1</small>
          </button>
          <button type="button" disabled={disabled} onClick={() => sendHeadTilt(HEAD_TILT_DOWN_ANGLE_DEG)}>
            低头
            <span>{HEAD_TILT_DOWN_ANGLE_DEG}deg</span>
            <small>1005 d=1</small>
          </button>
          <button type="button" className="head-stop-button" disabled={disabled} onClick={sendHeadStop}>
            头部停止
            <span>1004</span>
            <small>head stop</small>
          </button>
          <button type="button" disabled={disabled} onClick={sendHeadReset}>
            头部复位
            <span>d=1</span>
            <small>1006 vertical</small>
          </button>
        </div>

        <p className="calibration-note">抬头/低头角度符号可能需要按真实机器人方向校准。</p>
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
