import { FormEvent, useState } from "react";
import type { JoinRoomRequest, WebRole } from "../types";

type JoinRoomFormProps = {
  onJoin: (payload: JoinRoomRequest) => Promise<void>;
};

export function JoinRoomForm({ onJoin }: JoinRoomFormProps) {
  const [roomName, setRoomName] = useState("robot-room-001");
  const [participantName, setParticipantName] = useState("");
  const [requestedRole, setRequestedRole] = useState<WebRole>("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      setIsSubmitting(true);
      await onJoin({
        roomName,
        participantName,
        requestedRole
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Join failed");
    } finally {
      setIsSubmitting(false);
    }
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
              placeholder="Alice"
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

          {error ? <p className="inline-error">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Joining..." : "Join room"}
          </button>
        </form>
      </section>
    </main>
  );
}
