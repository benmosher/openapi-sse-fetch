import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getMessagesStream } from './generated/sse/client';
import type {
  GetMessagesStreamMessageEvent,
  GetMessagesStreamStatusEvent,
} from './generated/sse/types';
import { usePostMessages } from './generated/orval';

type ChatEntry =
  | { kind: 'message'; data: GetMessagesStreamMessageEvent['data'] }
  | { kind: 'status'; data: GetMessagesStreamStatusEvent['data'] };

export default function App() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { mutate: sendMessage, isPending } = usePostMessages();

  // Subscribe to SSE stream on mount
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        for await (const event of getMessagesStream({
          signal: controller.signal,
        })) {
          if (event.event === 'message') {
            setEntries((prev) => [
              ...prev,
              { kind: 'message', data: event.data },
            ]);
          } else if (event.event === 'status') {
            setEntries((prev) => [
              ...prev,
              { kind: 'status', data: event.data },
            ]);
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          console.error('SSE stream ended unexpectedly');
        }
      }
    })();

    return () => controller.abort();
  }, []);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage({ data: { message: text } });
  };

  return (
    <main className="container" style={{ maxWidth: 600, paddingTop: '2rem' }}>
      <h1>Echo Chat</h1>

      <article style={{ height: 400, overflowY: 'auto', marginBottom: '1rem' }}>
        {entries.length === 0 && (
          <p style={{ color: 'var(--pico-muted-color)' }}>
            No messages yet. Send one below!
          </p>
        )}
        {entries.map((entry, i) =>
          entry.kind === 'message' ? (
            <div key={i} style={{ marginBottom: '0.5rem' }}>
              <small style={{ color: 'var(--pico-muted-color)' }}>
                {new Date(entry.data.ts).toLocaleTimeString()}
              </small>
              <div>{entry.data.message}</div>
            </div>
          ) : (
            <div key={i} style={{ marginBottom: '0.5rem' }}>
              <small style={{ color: 'var(--pico-muted-color)' }}>
                {new Date(entry.data.ts).toLocaleTimeString()}
              </small>
              <div>
                <em>
                  The status has changed to: {entry.data.status.toLowerCase()}
                </em>
              </div>
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </article>

      <form onSubmit={handleSubmit} role="group">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isPending}
        />
        <button type="submit" disabled={isPending}>
          Send
        </button>
      </form>
    </main>
  );
}
