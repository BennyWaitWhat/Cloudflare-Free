import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_ROOMS, CHAT_TAB_REPLACED, type ChatEvent, type ChatMessage, type ChatRoomName } from "../../shared/types";
import { timeAgo } from "../api";
import { Link } from "../router";
import { useSite } from "../site";

/** Live chat: each room is a Durable Object holding hibernating WebSockets. */
export function ChatPanel() {
  const { config, user } = useSite();
  const [room, setRoom] = useState<ChatRoomName>("lobby");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const sessionKnown = config !== null;

  useEffect(() => {
    // Wait until the session is known, so a page load opens one socket rather than two.
    if (!sessionKnown) return;
    let stopped = false;
    let attempts = 0;
    let timer: number | undefined;
    // The room answers "ping" without waking up, and drops sockets that stay silent.
    const heartbeat = window.setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send("ping");
    }, 25_000);

    function connect() {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${scheme}://${location.host}/api/chat/${room}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        attempts = 0;
        setConnected(true);
        setError(null);
      };
      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        const data = JSON.parse(String(event.data)) as ChatEvent;
        if (data.type === "history") setMessages(data.messages);
        else if (data.type === "message") setMessages((previous) => [...previous.slice(-199), data.message]);
        else if (data.type === "presence") setOnline(data.online);
        else setError(data.message);
      };
      ws.onclose = (event) => {
        setConnected(false);
        if (stopped) return;
        // The room closed this tab because the member opened chat in a newer one.
        if (event.code === CHAT_TAB_REPLACED) {
          setError("Chat moved to your newer tab. Reload this page to chat here.");
          return;
        }
        attempts = Math.min(attempts + 1, 5);
        timer = window.setTimeout(connect, attempts * 1500);
      };
    }

    setMessages([]);
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(heartbeat);
      socket.current?.close();
    };
    // Reconnect when the user signs in or out so the room knows who is talking.
  }, [room, user?.id, sessionKnown]);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ text }));
    setDraft("");
  }

  return (
    <section id="chat" className="card chat">
      <div className="chat-head">
        <div className="tabs">
          {CHAT_ROOMS.map((name) => (
            <button
              key={name}
              type="button"
              className={name === room ? "tab active" : "tab"}
              aria-pressed={name === room}
              onClick={() => setRoom(name)}
            >
              #{name}
            </button>
          ))}
        </div>
        <span className="muted small" role="status">{connected ? `${online} online` : "connecting…"}</span>
      </div>
      <div className="chat-log" ref={list} role="log" aria-label={`Messages in #${room}`}>
        {messages.length === 0 && <p className="muted">No messages yet. Say hello.</p>}
        {messages.map((message) => (
          <p key={message.id} className="chat-line">
            <strong title={`@${message.username}`}>{message.name}</strong> {message.text}{" "}
            <span className="muted small">{timeAgo(message.at)}</span>
          </p>
        ))}
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
      {user ? (
        <form className="row" onSubmit={send}>
          <input
            value={draft}
            maxLength={500}
            placeholder={`Message #${room}`}
            aria-label={`Message #${room}`}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={!connected || !draft.trim()}>
            Send
          </button>
        </form>
      ) : (
        <p className="muted small">
          <Link to="/account">Sign in</Link> to chat.
        </p>
      )}
    </section>
  );
}
