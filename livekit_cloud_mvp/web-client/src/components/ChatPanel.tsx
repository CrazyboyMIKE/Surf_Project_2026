import { FormEvent, useState } from "react";
import type { ChatMessage } from "../types";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  disabled: boolean;
};

export function ChatPanel({ messages, onSend, disabled }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) {
      return;
    }

    onSend(message);
    setDraft("");
  }

  return (
    <section className="tool-panel chat-panel" aria-labelledby="chat-title">
      <div className="panel-heading">
        <h2 id="chat-title">Room Chat</h2>
        <span>{messages.length} messages</span>
      </div>

      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty-state">No messages yet</p>
        ) : (
          messages.map((message) => (
            <article key={`${message.senderId}-${message.timestamp}`} className="chat-message">
              <strong>{message.senderName}</strong>
              <p>{message.message}</p>
            </article>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          value={draft}
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Send a message"
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || draft.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}
