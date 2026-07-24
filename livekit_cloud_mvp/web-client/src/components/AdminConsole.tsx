import { useEffect, useMemo, useState } from "react";
import {
  adminCleanupParticipants,
  adminCloseRoom,
  adminKickParticipant,
  adminReleaseController,
  API_BASE_URL,
  getAdminRoom,
  getAdminRoomRecord,
  listAdminRoomRecords,
  listAdminRooms
} from "../api";
import type { AdminRoomDetail, AdminRoomRecordDetail, AdminRoomRecordSummary, AdminRoomSummary, Role } from "../types";

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

function formatPayload(payload?: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) {
    return "-";
  }

  return JSON.stringify(payload);
}

export function AdminConsole() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
  const [saveTokenForSession, setSaveTokenForSession] = useState(true);
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [records, setRecords] = useState<AdminRoomRecordSummary[]>([]);
  const [selectedRoomName, setSelectedRoomName] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<AdminRoomDetail | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AdminRoomRecordDetail | null>(null);
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

  async function refreshRecords(nextSelectedRecordId = selectedRecordId) {
    setNotice("");
    setError("");
    if (!adminToken.trim()) {
      setBackendState("idle");
      setError("Enter admin token before loading room records.");
      return;
    }

    setLoading(true);
    try {
      const response = await listAdminRoomRecords(adminToken.trim(), 30);
      setRecords(response.records);
      setBackendState("connected");

      if (nextSelectedRecordId) {
        const recordStillExists = response.records.some((record) => record.id === nextSelectedRecordId);
        if (recordStillExists) {
          await refreshRecordDetail(nextSelectedRecordId, false);
        } else {
          setSelectedRecordId(null);
          setSelectedRecord(null);
        }
      }
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Admin room records request failed");
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

  async function refreshRecordDetail(roomId: number, showLoading = true) {
    setNotice("");
    setError("");
    if (!adminToken.trim()) {
      setError("Enter admin token before loading room record details.");
      return;
    }

    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await getAdminRoomRecord(adminToken.trim(), roomId);
      setSelectedRecordId(roomId);
      setSelectedRecord(response.record);
      setBackendState("connected");
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Admin room record detail request failed");
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
          : "Close this room? Online participants will be disconnected.";

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
        await refreshRecords();
        setNotice(nextNotice);
      } else {
        if (response.room) {
          setSelectedRoom(response.room);
        }
        await refreshRooms(roomName);
        await refreshRecords();
        setNotice(nextNotice);
      }
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Admin action failed");
    } finally {
      setLoading(false);
    }
  }

  async function runKickParticipant(participantId: string, displayName: string) {
    const roomName = selectedRoom?.roomName;
    if (!roomName) {
      return;
    }

    if (!window.confirm(`Kick ${displayName} from ${roomName}?`)) {
      return;
    }

    setLoading(true);
    setNotice("");
    setError("");
    try {
      const response = await adminKickParticipant(adminToken.trim(), roomName, participantId);
      if (response.room) {
        setSelectedRoom(response.room);
      } else {
        setSelectedRoom(null);
        setSelectedRoomName("");
      }
      await refreshRooms(response.roomDeleted ? "" : roomName);
      await refreshRecords();
      setNotice(response.message ?? "Participant kicked.");
    } catch (caught) {
      setBackendState("error");
      setError(caught instanceof Error ? caught.message : "Kick participant failed");
    } finally {
      setLoading(false);
    }
  }

  const roomForActions = selectedRoom ?? selectedSummary;
  const closeDisabledReason = roomForActions ? "" : "Select an open room first.";

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
          <button type="button" className="secondary-button" disabled={loading} onClick={() => void refreshRecords()}>
            Load History
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
                  disabled={loading || !selectedRoom}
                  title={closeDisabledReason}
                  onClick={() => void runRoomAction("close")}
                >
                  Close Room
                </button>
                <button type="button" className="secondary-button" disabled={loading} onClick={() => void refreshRoomDetail(selectedRoom.roomName)}>
                  Refresh
                </button>
              </div>

              <p className="admin-subtle">Close Room disconnects online participants and writes a room_closed history event.</p>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Role</th>
                      <th>State</th>
                      <th>Joined</th>
                      <th>Last seen</th>
                      <th>Action</th>
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
                        <td>
                          <button
                            type="button"
                            className="danger-button compact-button"
                            disabled={loading}
                            onClick={() => void runKickParticipant(participant.participantId, participant.displayName)}
                          >
                            Kick
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="admin-card">
          <div className="panel-heading">
            <h2>30-Day Room Records</h2>
            <span>{records.length} records</span>
          </div>

          {records.length === 0 ? (
            <p className="empty-state">No room records loaded.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Status</th>
                    <th>Participants</th>
                    <th>Controller</th>
                    <th>Closed</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className={record.id === selectedRecordId ? "selected-row" : ""}>
                      <td>
                        <strong>{record.roomName}</strong>
                        <span>#{record.id}</span>
                      </td>
                      <td>
                        <StatusPill online={record.status === "open"} label={record.status} />
                      </td>
                      <td>{record.participantCount}</td>
                      <td>{record.latestControllerName ?? "-"}</td>
                      <td>
                        {record.closedAt ? formatDate(record.closedAt) : "-"}
                        {record.closeReason ? <span>{record.closeReason}</span> : null}
                      </td>
                      <td>
                        <button type="button" className="text-button" onClick={() => void refreshRecordDetail(record.id)}>
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
            <h2>Record Detail</h2>
            <span>{selectedRecord ? `#${selectedRecord.id}` : "no record selected"}</span>
          </div>

          {!selectedRecord ? (
            <p className="empty-state">Select a historical record to inspect participants and events.</p>
          ) : (
            <>
              <dl className="admin-detail-grid">
                <div>
                  <dt>Room</dt>
                  <dd>{selectedRecord.roomName}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedRecord.status}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(selectedRecord.createdAt)}</dd>
                </div>
                <div>
                  <dt>Closed</dt>
                  <dd>{selectedRecord.closedAt ? `${formatDate(selectedRecord.closedAt)} (${selectedRecord.closeReason ?? "-"})` : "-"}</dd>
                </div>
              </dl>

              <h3 className="admin-subheading">Participants</h3>
              <div className="admin-table-wrap compact-history">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Left</th>
                      <th>Kicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecord.participants.map((participant) => (
                      <tr key={participant.id}>
                        <td>
                          <strong>{participant.participantName}</strong>
                          <span>{participant.participantId}</span>
                        </td>
                        <td>
                          <span className={roleClassName(participant.role)}>{participant.role}</span>
                        </td>
                        <td>{formatDate(participant.joinedAt)}</td>
                        <td>{formatDate(participant.leftAt)}</td>
                        <td>{participant.kickedAt ? `${formatDate(participant.kickedAt)} ${participant.kickReason ?? ""}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="admin-subheading">Events</h3>
              <div className="admin-table-wrap compact-history">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Actor</th>
                      <th>Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecord.events.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDate(event.createdAt)}</td>
                        <td>{event.type}</td>
                        <td>{event.actorName ?? event.actorParticipantId ?? "-"}</td>
                        <td>{formatPayload(event.payload)}</td>
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
