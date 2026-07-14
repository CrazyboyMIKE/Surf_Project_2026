import { useEffect, useMemo, useState } from "react";
import {
  adminCleanupParticipants,
  adminCloseRoom,
  adminReleaseController,
  API_BASE_URL,
  getAdminRoom,
  listAdminRooms
} from "../api";
import type { AdminRoomDetail, AdminRoomSummary, Role } from "../types";

type BackendState = "idle" | "connected" | "error";

const ADMIN_TOKEN_STORAGE_KEY = "livekitCloudAdminToken";

function formatDate(timestamp?: number): string {
  if (!timestamp) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function roleClassName(role: Role): string {
  return `role-pill role-${role}`;
}

function StatusPill({ online, label }: { online: boolean; label?: string }) {
  return <span className={online ? "state-pill online" : "state-pill offline"}>{label ?? (online ? "online" : "offline")}</span>;
}

export function AdminConsole() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
  const [saveTokenForSession, setSaveTokenForSession] = useState(true);
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [selectedRoomName, setSelectedRoomName] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<AdminRoomDetail | null>(null);
  const [backendState, setBackendState] = useState<BackendState>("idle");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (saveTokenForSession && adminToken) {
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
      return;
    }

    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }, [adminToken, saveTokenForSession]);

  const selectedSummary = useMemo(
    () => rooms.find((room) => room.roomName === selectedRoomName),
    [rooms, selectedRoomName]
  );

  async function refreshRooms(nextSelectedRoomName = selectedRoomName) {
    setNotice("");
    setError("");
    if (!adminToken.trim()) {
      setBackendState("idle");
      setError("Enter admin token before loading rooms.");
      return;
    }

    setLoading(true);
    try {
      const response = await listAdminRooms(adminToken.trim());
      setRooms(response.rooms);
      setBackendState("connected");

      if (nextSelectedRoomName) {
        const roomStillExists = response.rooms.some((room) => room.roomName === nextSelectedRoomName);
        if (roomStillExists) {
          await refreshRoomDetail(nextSelectedRoomName, false);
        } else {
          setSelectedRoomName("");
          setSelectedRoom(null);
        }
      }
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Admin rooms request failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshRoomDetail(roomName: string, showLoading = true) {
    setNotice("");
    setError("");
    if (!adminToken.trim()) {
      setError("Enter admin token before loading room details.");
      return;
    }

    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await getAdminRoom(adminToken.trim(), roomName);
      setSelectedRoomName(roomName);
      setSelectedRoom(response.room);
      setBackendState("connected");
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Admin room detail request failed");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  async function runRoomAction(action: "release" | "cleanup" | "close") {
    const roomName = selectedRoom?.roomName;
    if (!roomName) {
      return;
    }

    const confirmation =
      action === "release"
        ? "Release the current controller for this room?"
        : action === "cleanup"
          ? "Cleanup offline participants older than the cleanup threshold?"
          : "Close this empty room? This removes only backend in-memory room state.";

    if (!window.confirm(confirmation)) {
      return;
    }

    setLoading(true);
    setNotice("");
    setError("");
    try {
      const token = adminToken.trim();
      const response =
        action === "release"
          ? await adminReleaseController(token, roomName)
          : action === "cleanup"
            ? await adminCleanupParticipants(token, roomName)
            : await adminCloseRoom(token, roomName);

      const nextNotice = response.message ?? (action === "cleanup" ? `Removed ${response.removedCount ?? 0} offline participants.` : "Action completed.");
      if (action === "close") {
        setSelectedRoomName("");
        setSelectedRoom(null);
        await refreshRooms("");
        setNotice(nextNotice);
      } else {
        if (response.room) {
          setSelectedRoom(response.room);
        }
        await refreshRooms(roomName);
        setNotice(nextNotice);
      }
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Admin action failed");
    } finally {
      setLoading(false);
    }
  }

  const roomForActions = selectedRoom ?? selectedSummary;
  const closeDisabledReason = roomForActions?.canClose ? "" : roomForActions?.closeDisabledReason ?? "Select an empty room first.";

  return (
    <main className="admin-shell">
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">LiveKit Cloud MVP</p>
          <h1>Admin Room Console</h1>
          <p className="admin-subtle">Backend: {API_BASE_URL}</p>
        </div>

        <div className="admin-token-panel">
          <label>
            Admin token
            <input
              type="password"
              value={adminToken}
              autoComplete="off"
              placeholder="Bearer token from backend .env"
              onChange={(event) => setAdminToken(event.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={saveTokenForSession}
              onChange={(event) => setSaveTokenForSession(event.target.checked)}
            />
            Save for this browser session
          </label>
        </div>

        <div className="admin-actions">
          <StatusPill online={backendState === "connected"} label={`backend ${backendState}`} />
          <button type="button" className="secondary-button" disabled={loading} onClick={() => void refreshRooms()}>
            Refresh
          </button>
        </div>
      </section>

      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}

      <section className="admin-grid">
        <div className="admin-card">
          <div className="panel-heading">
            <h2>Rooms</h2>
            <span>{rooms.length} active in memory</span>
          </div>

          {rooms.length === 0 ? (
            <p className="empty-state">No rooms loaded.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Robot</th>
                    <th>Controller</th>
                    <th>Viewers</th>
                    <th>Participants</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.roomName} className={room.roomName === selectedRoomName ? "selected-row" : ""}>
                      <td>
                        <strong>{room.roomName}</strong>
                        <span>{room.liveKitRoomName}</span>
                      </td>
                      <td>
                        <StatusPill online={room.robotOnline} />
                      </td>
                      <td>{room.currentControllerName ?? "-"}</td>
                      <td>{room.viewerCount}</td>
                      <td>
                        {room.connectedParticipantCount}/{room.participantCount}
                      </td>
                      <td>{formatDate(room.updatedAt)}</td>
                      <td>
                        <button type="button" className="text-button" onClick={() => void refreshRoomDetail(room.roomName)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-card">
          <div className="panel-heading">
            <h2>Room Detail</h2>
            <span>{selectedRoom?.roomName ?? "no room selected"}</span>
          </div>

          {!selectedRoom ? (
            <p className="empty-state">Select a room to inspect participants and safe admin actions.</p>
          ) : (
            <>
              <dl className="admin-detail-grid">
                <div>
                  <dt>Room</dt>
                  <dd>{selectedRoom.roomName}</dd>
                </div>
                <div>
                  <dt>Robot</dt>
                  <dd>{selectedRoom.robotId ?? "-"} {selectedRoom.robotOnline ? "(online)" : "(offline)"}</dd>
                </div>
                <div>
                  <dt>Controller</dt>
                  <dd>{selectedRoom.currentControllerName ?? "-"}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(selectedRoom.updatedAt)}</dd>
                </div>
              </dl>

              <div className="admin-button-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={loading || !selectedRoom.currentControllerId}
                  onClick={() => void runRoomAction("release")}
                >
                  Release Controller
                </button>
                <button type="button" className="secondary-button" disabled={loading} onClick={() => void runRoomAction("cleanup")}>
                  Cleanup Offline Participants
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={loading || !selectedRoom.canClose}
                  title={closeDisabledReason}
                  onClick={() => void runRoomAction("close")}
                >
                  Close Empty Room
                </button>
                <button type="button" className="secondary-button" disabled={loading} onClick={() => void refreshRoomDetail(selectedRoom.roomName)}>
                  Refresh
                </button>
              </div>

              {!selectedRoom.canClose ? <p className="admin-subtle">Close disabled: {selectedRoom.closeDisabledReason}</p> : null}

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Role</th>
                      <th>State</th>
                      <th>Joined</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRoom.participants.map((participant) => (
                      <tr key={participant.participantId}>
                        <td>
                          <strong>{participant.displayName}</strong>
                          <span>{participant.identity}</span>
                        </td>
                        <td>
                          <span className={roleClassName(participant.role)}>{participant.role}</span>
                        </td>
                        <td>
                          <StatusPill online={participant.connected} />
                        </td>
                        <td>{formatDate(participant.joinedAt)}</td>
                        <td>{formatDate(participant.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
