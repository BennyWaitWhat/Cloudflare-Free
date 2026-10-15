import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env";
import type { ChatEvent, ChatMessage } from "../../shared/types";

interface Identity {
  id: string;
  name: string;
  username: string;
}

interface SocketState {
  user: Identity | null;
  connectedAt: number;
  lastSentAt: number;
}

const KEEP_MESSAGES = 200;
const MAX_TEXT = 500;
/** Clients ping every 25 s; a socket silent for longer than this is treated as gone. */
const STALE_MS = 75_000;

/**
 * One SQLite-backed Durable Object per chat room. It uses the WebSocket
 * Hibernation API, so idle rooms are evicted from memory and don't spend the
 * free daily GB-seconds while sockets stay connected. Heartbeat pings are
 * answered by the runtime without waking the object.
 */
export class ChatRoom extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL
    )`);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      user: parseIdentity(request.headers.get("x-chat-user")),
      connectedAt: Date.now(),
      lastSentAt: 0,
    } satisfies SocketState);
    send(server, { type: "history", messages: this.history(50) });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC: the latest messages, oldest first. */
  history(limit = 50): ChatMessage[] {
    const rows = this.ctx.storage.sql
      .exec<{ id: number; user_id: string; name: string; username: string; text: string; at: number }>(
        "SELECT id, user_id, name, username, text, at FROM messages ORDER BY id DESC LIMIT ?",
        Math.min(Math.max(limit, 1), KEEP_MESSAGES),
      )
      .toArray();
    return rows.reverse().map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      username: row.username,
      text: row.text,
      at: row.at,
    }));
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const state = ws.deserializeAttachment() as SocketState;
    if (!state.user) {
      send(ws, { type: "error", message: "Sign in to chat" });
      return;
    }
    if (typeof raw !== "string" || raw.length > 4 * MAX_TEXT) return;

    let text = "";
    try {
      text = String((JSON.parse(raw) as { text?: unknown }).text ?? "").trim();
    } catch {
      return;
    }
    if (!text) return;

    const now = Date.now();
    if (now - state.lastSentAt < 1000) {
      send(ws, { type: "error", message: "You're sending messages too quickly" });
      return;
    }
    ws.serializeAttachment({ ...state, lastSentAt: now } satisfies SocketState);

    const at = Math.floor(now / 1000);
    const clipped = text.slice(0, MAX_TEXT);
    const { id } = this.ctx.storage.sql
      .exec<{ id: number }>(
        "INSERT INTO messages (user_id, name, username, text, at) VALUES (?, ?, ?, ?, ?) RETURNING id",
        state.user.id,
        state.user.name,
        state.user.username,
        clipped,
        at,
      )
      .one();
    this.broadcast({
      type: "message",
      message: { id, userId: state.user.id, name: state.user.name, username: state.user.username, text: clipped, at },
    });
    if (id % 50 === 0) this.ctx.storage.sql.exec("DELETE FROM messages WHERE id <= ?", id - KEEP_MESSAGES);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  /** Sockets heard from recently; silent ones are closed so they stop counting as online. */
  private liveSockets(except?: WebSocket): WebSocket[] {
    const now = Date.now();
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket === except) return false;
      const state = socket.deserializeAttachment() as SocketState | null;
      const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? 0;
      if (now - Math.max(lastPing, state?.connectedAt ?? 0, state?.lastSentAt ?? 0) < STALE_MS) return true;
      try {
        socket.close(1001, "No heartbeat");
      } catch {
        // Already closed.
      }
      return false;
    });
  }

  private broadcast(event: ChatEvent, except?: WebSocket): void {
    for (const socket of this.liveSockets(except)) send(socket, event);
  }

  private broadcastPresence(leaving?: WebSocket): void {
    const sockets = this.liveSockets(leaving);
    for (const socket of sockets) send(socket, { type: "presence", online: sockets.length });
  }
}

function send(socket: WebSocket, event: ChatEvent): void {
  try {
    socket.send(JSON.stringify(event));
  } catch {
    // The socket closed while we were sending.
  }
}

function parseIdentity(header: string | null): Identity | null {
  if (!header) return null;
  try {
    const value = JSON.parse(header) as Partial<Identity> | null;
    return value?.id && value.name && value.username ? { id: value.id, name: value.name, username: value.username } : null;
  } catch {
    return null;
  }
}
