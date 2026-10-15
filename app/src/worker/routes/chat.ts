import { Hono } from "hono";
import type { AppEnv } from "../env";
import { CHAT_ROOMS, type ChatRoomName } from "../../shared/types";
import { fail } from "../lib/http";

export const chat = new Hono<AppEnv>();

function roomName(value: string): ChatRoomName {
  const room = CHAT_ROOMS.find((name) => name === value);
  if (!room) fail(404, "No such room");
  return room;
}

chat.get("/rooms", (c) => c.json({ rooms: CHAT_ROOMS }));

/** Hands the WebSocket to the room's Durable Object along with who is connecting. */
chat.get("/:room/ws", async (c) => {
  const room = roomName(c.req.param("room"));
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") fail(426, "Expected a WebSocket upgrade");
  const user = c.get("user");
  const headers = new Headers(c.req.raw.headers);
  headers.set(
    "x-chat-user",
    JSON.stringify(user ? { id: user.id, name: user.displayName, username: user.username } : null),
  );
  return c.env.CHAT_ROOM.getByName(room).fetch(new Request(c.req.raw, { headers }));
});

chat.get("/:room/history", async (c) => {
  const room = roomName(c.req.param("room"));
  const messages = await c.env.CHAT_ROOM.getByName(room).history(50);
  return c.json({ messages });
});
