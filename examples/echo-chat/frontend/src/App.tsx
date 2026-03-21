import { useEffect, useRef, useState, type FormEvent } from "react";
import { getMessagesStream } from "./generated/sse/client";
import type { GetMessagesStreamMessageEvent } from "./generated/sse/types";
import { usePostMessages } from "./generated/orval";

type ChatMessage = GetMessagesStreamMessageEvent["data"];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { mutate: sendMessage, isPending } = usePostMessages();

  // Subscribe to SSE stream on mount
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        for await (const event of getMessagesStream(
          {},
          { signal: controller.signal },
        )) {
          setMessages((prev) => [...prev, event.data]);
        }
      } catch {
        if (!controller.signal.aborted) {
          console.error("SSE stream ended unexpectedly");
        }
      }
    })();

    return () => controller.abort();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage({ data: { message: text } });
  };

  return (
    <main className="container" style={{ maxWidth: 600, paddingTop: "2rem" }}>
      <h1>Echo Chat</h1>

      <article style={{ height: 400, overflowY: "auto", marginBottom: "1rem" }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--pico-muted-color)" }}>
            No messages yet. Send one below!
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: "0.5rem" }}>
            <small style={{ color: "var(--pico-muted-color)" }}>
              {new Date(msg.ts).toLocaleTimeString()}
            </small>
            <div>{msg.message}</div>
          </div>
        ))}
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
