import { FormEvent, useState } from "react";
import type { JoinRoomRequest, WebRole } from "../types";

type RoomEntryIntent = "create" | "join";

type JoinRoomFormProps = {
  onJoin: (payload: JoinRoomRequest) => Promise<void>;
  notice?: string;
};

export function JoinRoomForm({ onJoin, notice }: JoinRoomFormProps) {
  const [roomName, setRoomName] = useState("robot-room-001");
  const [participantName, setParticipantName] = useState("");
  const [requestedRole, setRequestedRole] = useState<WebRole>("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingIntent, setSubmittingIntent] = useState<RoomEntryIntent | null>(null);
  const [error, setError] = useState("");

  async function submitRoom(intent: RoomEntryIntent) {
    setError("");

    try {
      setIsSubmitting(true);
      setSubmittingIntent(intent);
      await onJoin({
        roomName,
        participantName,
        requestedRole,
        intent
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Join failed");
    } finally {
      setIsSubmitting(false);
      setSubmittingIntent(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitRoom("join");
  }

  return (
    <main className="join-shell">
      <section className="join-panel" aria-labelledby="join-title">
        <div>
          <p className="eyebrow">Remote Presence MVP</p>
          <h1 id="join-title">Robot Room</h1>
        </div>

        <form onSubmit={handleSubmit} className="join-form">
          <label>
            Room name
            <input
              value={roomName}
              maxLength={80}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="robot-room-001"
              required
            />
          </label>

          <label>
            Your name
            <input
              value={participantName}
              maxLength={80}
              onChange={(event) => setParticipantName(event.target.value)}
              placeholder="Enter your name"
              required
            />
          </label>

          <label>
            Initial role
            <select value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as WebRole)}>
              <option value="viewer">Viewer</option>
              <option value="controller">Controller</option>
            </select>
          </label>

          {notice ? <p className="notice">{notice}</p> : null}
          {error ? <p className="inline-error">{error}</p> : null}

          <div className="join-actions">
            <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => void submitRoom("create")}>
              {submittingIntent === "create" ? "Creating..." : "Create room"}
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {submittingIntent === "join" ? "Joining..." : "Join room"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
