import { FormEvent, useMemo, useState } from "react";
import type { ParticipantSummary, PrivateChatErrorMessage, PrivateChatMessage, WebRole } from "../types";

type PrivateChatPanelProps = {
  currentParticipantId: string;
  currentRole: WebRole | null;
  participants: ParticipantSummary[];
  selectedParticipantId: string | null;
  messages: PrivateChatMessage[];
  errors: PrivateChatErrorMessage[];
  unreadCounts: Record<string, number>;
  disabled: boolean;
  onSelectParticipant: (participantId: string) => void;
  onSend: (recipientId: string, message: string) => void;
};

function getConversationPeerId(message: PrivateChatMessage, currentParticipantId: string): string {
  return message.senderId === currentParticipantId ? message.recipientId : message.senderId;
}

function getParticipantName(participant: ParticipantSummary): string {
  return participant.name || participant.id;
}

function canUsePrivateChatRole(role: WebRole | "robot" | null): boolean {
  return role === "controller" || role === "viewer";
}

export function PrivateChatPanel({
  currentParticipantId,
  currentRole,
  participants,
  selectedParticipantId,
  messages,
  errors,
  unreadCounts,
  disabled,
  onSelectParticipant,
  onSend
}: PrivateChatPanelProps) {
  const [draft, setDraft] = useState("");
  const privateChatTargets = useMemo(
    () =>
      participants
        .filter((participant) => canUsePrivateChatRole(participant.role) && participant.connected && participant.id !== currentParticipantId)
        .sort((left, right) => getParticipantName(left).localeCompare(getParticipantName(right))),
    [currentParticipantId, participants]
  );
  const selectedParticipant = privateChatTargets.find((participant) => participant.id === selectedParticipantId) ?? null;
  const visibleMessages = selectedParticipantId
    ? messages.filter((message) => getConversationPeerId(message, currentParticipantId) === selectedParticipantId)
    : [];
  const latestError = errors[errors.length - 1];
  const canUsePrivateChat = canUsePrivateChatRole(currentRole);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!selectedParticipantId || !message || message.length > 500) {
      return;
    }

    onSend(selectedParticipantId, message);
    setDraft("");
  }

  return (
    <section className="tool-panel private-chat-panel" aria-labelledby="private-chat-title">
      <div className="panel-heading">
        <h2 id="private-chat-title">Private Chat</h2>
        <span>{canUsePrivateChat ? "web participants" : "web users only"}</span>
      </div>

      {!canUsePrivateChat ? <p className="empty-state">Private chat is available between controller and viewer users.</p> : null}

      {canUsePrivateChat ? (
        <div className="private-chat-layout">
          <div className="private-chat-targets" aria-label="Private chat targets">
            {privateChatTargets.length === 0 ? (
              <p className="empty-state">No online web participants available</p>
            ) : (
              privateChatTargets.map((participant) => (
                <button
                  type="button"
                  className={participant.id === selectedParticipantId ? "private-target active" : "private-target"}
                  key={participant.id}
                  onClick={() => onSelectParticipant(participant.id)}
                >
                  <span>{getParticipantName(participant)}</span>
                  {unreadCounts[participant.id] ? <strong>{unreadCounts[participant.id]}</strong> : null}
                </button>
              ))
            )}
          </div>

          <div className="private-chat-thread">
            <div className="private-chat-thread-title">
              {selectedParticipant ? `Private chat with ${getParticipantName(selectedParticipant)}` : "Select an online participant"}
            </div>

            <div className="private-chat-log" aria-live="polite">
              {!selectedParticipant ? (
                <p className="empty-state">Choose a participant to start a private chat.</p>
              ) : visibleMessages.length === 0 ? (
                <p className="empty-state">No private messages yet</p>
              ) : (
                visibleMessages.map((message) => (
                  <article
                    className={message.senderId === currentParticipantId ? "private-message from-me" : "private-message from-peer"}
                    key={message.messageId}
                  >
                    <strong>{message.senderId === currentParticipantId ? "You" : message.senderName}</strong>
                    <p>{message.message}</p>
                  </article>
                ))
              )}
            </div>

            {latestError ? <p className="inline-error private-chat-error">{latestError.message}</p> : null}

            <form className="private-chat-form" onSubmit={handleSubmit}>
              <input
                value={draft}
                maxLength={500}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Send private message"
                disabled={disabled || !selectedParticipant}
              />
              <button type="submit" disabled={disabled || !selectedParticipant || draft.trim().length === 0}>
                Send
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
