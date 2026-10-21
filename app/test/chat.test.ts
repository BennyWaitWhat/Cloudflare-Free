import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CHAT_TAB_REPLACED, type ChatEvent } from "../src/shared/types";
import { bindings, ORIGIN, signIn } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

const LOBBY = `${ORIGIN}/api/chat/lobby/ws`;

/** Opens a lobby socket as the member with this cookie and records every event it receives. */
async function connect(cookie: string) {
  const response = await SELF.fetch(LOBBY, { headers: { upgrade: "websocket", cookie } });
  const socket = response.webSocket;
  if (!socket) throw new Error(`No WebSocket (HTTP ${response.status})`);
  const events: ChatEvent[] = [];
  socket.addEventListener("message", (event) => {
    events.push(JSON.parse(String(event.data)) as ChatEvent);
  });
  socket.accept();
  return { socket, events };
}

const say = (socket: WebSocket, text: string) => socket.send(JSON.stringify({ text }));
const messages = (events: ChatEvent[]) => events.flatMap((event) => (event.type === "message" ? [event.message] : []));

describe("chat rooms", () => {
  it("sends the history first, then every message to everyone in the room", async () => {
    const dinesh = await connect((await signIn("dinesh")).cookie);
    const gilfoyle = await connect((await signIn("gilfoyle")).cookie);
    await vi.waitFor(() => expect(dinesh.events[0]?.type).toBe("history"));

    say(dinesh.socket, "My code compiled on the first try");
    await vi.waitFor(() =>
      expect(messages(gilfoyle.events)).toContainEqual(
        expect.objectContaining({ username: "dinesh", text: "My code compiled on the first try" }),
      ),
    );
    dinesh.socket.close();
    gilfoyle.socket.close();
  });

  it("lets a member send one message a second, however many tabs they open", async () => {
    const { cookie } = await signIn("jian_yang");
    const first = await connect(cookie);
    const second = await connect(cookie);

    say(first.socket, "Hotdog");
    await vi.waitFor(() => expect(messages(second.events).map((message) => message.text)).toContain("Hotdog"));
    say(second.socket, "Not hotdog");
    await vi.waitFor(() =>
      expect(second.events).toContainEqual({ type: "error", message: "You're sending messages too quickly" }),
    );
    // A refused message is never broadcast, so it can't arrive after the error.
    expect(messages(second.events).map((message) => message.text)).not.toContain("Not hotdog");
    first.socket.close();
    second.socket.close();
  });

  it("closes a member's oldest tab when they open a fourth, so nobody is locked out", async () => {
    const { cookie } = await signIn("russ");
    const tabs = [await connect(cookie), await connect(cookie), await connect(cookie)];
    const oldestClosed = new Promise<number>((done) => tabs[0].socket.addEventListener("close", (event) => done(event.code)));

    const fourth = await connect(cookie);
    expect(await oldestClosed).toBe(CHAT_TAB_REPLACED);
    for (const tab of [...tabs.slice(1), fourth]) tab.socket.close();
  });
});
