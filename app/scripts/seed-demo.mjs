// Fills the local dev site with a demo community, the cast of HBO's Silicon Valley:
// members, posts with photos, and chat messages. It only touches local data.
// Run with `npm run demo` while `npm run dev` is running.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const SITE = process.env.SITE_URL ?? "http://localhost:5173";
const APP = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = join(APP, "node_modules", "wrangler", "bin", "wrangler.js");

/** [username, display name]. Each member's id is `demo-<username>`. */
export const MEMBERS = [
  ["richard", "Richard Hendricks"],
  ["erlich", "Erlich Bachman"],
  ["gilfoyle", "Bertram Gilfoyle"],
  ["dinesh", "Dinesh Chugtai"],
  ["jared", "Jared Dunn"],
  ["monica", "Monica Hall"],
  ["bighead", "Big Head"],
  ["jianyang", "Jian-Yang"],
  ["carla", "Carla Walton"],
  ["gavin", "Gavin Belson"],
  ["hoover", "Hoover"],
  ["denpok", "Denpok"],
  ["jackbarker", "Jack Barker"],
  ["peter", "Peter Gregory"],
  ["laurie", "Laurie Bream"],
  ["russ", "Russ Hanneman"],
  ["ron", "Ron LaFlamme"],
  ["keenan", "Keenan Feldspar"],
];

const POSTS = [
  {
    by: "jianyang",
    minutesAgo: 9,
    photo: "hotdog",
    alt: "A grilled hot dog with a zigzag of yellow mustard on a white plate",
    body: "SeeFood runs on Workers AI now. Verdict on lunch: hotdog.",
  },
  {
    by: "gilfoyle",
    minutesAgo: 41,
    photo: "server-rack",
    alt: "A home server rack with blue and amber lights in a garage at night",
    body: "Anton has a new rack. He's mostly decorative now, since this site runs on Workers and costs nothing.",
  },
  {
    by: "russ",
    minutesAgo: 95,
    photo: "orange-car",
    alt: "An orange sports car with its doors open in front of a glass house in the hills",
    body: "Three commas in the bank. Zero dollars on the hosting bill. Doors up.",
  },
  {
    by: "erlich",
    minutesAgo: 260,
    photo: "house",
    alt: "A ranch house with a palm tree and a lemon tree under an orange sunset",
    body: "Golden hour at the incubator. Rent is 10% equity, the Wi-Fi is free, and so is this website.",
  },
  {
    by: "richard",
    minutesAgo: 600,
    body: "Middle-out compression now runs in a Worker. Turns out 10 ms of CPU is plenty if you're careful.",
  },
  {
    by: "jared",
    minutesAgo: 900,
    body: "Friendly reminder: a Workflow checks every post before it goes live. It's very thorough. I find that comforting.",
  },
  {
    by: "laurie",
    minutesAgo: 1320,
    body: "Features divided by dollars spent is, mathematically, undefined. I find that compelling.",
  },
  {
    by: "gavin",
    minutesAgo: 1980,
    body: "At Hooli, we don't just make the world a better place. We make it a better place for free. Pending legal review.",
  },
];

/** The #lobby conversation, oldest first. */
const CHAT = [
  ["erlich", "Welcome to the lobby. I'm Erlich Bachman, and this is my incubator. Digitally."],
  ["gilfoyle", "This room is a Durable Object. It's the only thing here that does exactly what it's told."],
  ["dinesh", "Says the guy who named his server Anton."],
  ["jared", "I love that the room hibernates when we're quiet. Very considerate."],
  ["bighead", "wait, are we on the internet right now"],
  ["hoover", "Every visitor passes Turnstile. Even Erlich."],
  ["denpok", "The cloud has no servers to worry about. Be like the cloud."],
  ["peter", "Serverless. Like sesame seeds: small, numerous and underestimated."],
  ["keenan", "This would be incredible in VR."],
  ["jackbarker", "Has anyone thought about selling this as a box?"],
  ["carla", "Please don't."],
  ["ron", "For the record, I'm billing for reading this."],
  ["jianyang", "SeeFood is live. It knows hotdog and not hotdog."],
  ["monica", "Richard, what does all of this cost to run?"],
  ["richard", "Nothing. That's the whole point."],
  ["russ", "Zero dollars? That's the opposite of three commas. I respect it."],
  ["gavin", "Hooli could build this. Bigger."],
  ["laurie", "Bigger would cost more. That would be strictly worse."],
];

function devVar(name) {
  const line = readFileSync(join(APP, ".dev.vars"), "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is missing from .dev.vars; run npm run setup first`);
  return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, "$1");
}

/** A session cookie for a demo member, signed the way Hono's setSignedCookie signs it. */
export function sessionCookie(username) {
  const value = JSON.stringify({ uid: `demo-${username}`, exp: Math.floor(Date.now() / 1000) + 86_400 });
  const signature = createHmac("sha256", devVar("SESSION_SECRET")).update(value).digest("base64");
  return `session=${encodeURIComponent(`${value}.${signature}`)}`;
}

const sql = (value) => (value == null ? "NULL" : typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`);

function wrangler(...args) {
  execFileSync(process.execPath, [WRANGLER, ...args], { cwd: APP, stdio: ["ignore", "ignore", "inherit"] });
}

function seedDatabase() {
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    `INSERT OR IGNORE INTO users (id, username, display_name, webauthn_user_id) VALUES ${MEMBERS.map(
      ([username, name]) => `(${sql(`demo-${username}`)}, ${sql(username)}, ${sql(name)}, ${sql(`demo-${username}`)})`,
    ).join(", ")};`,
    // Posts get fresh timestamps on every run, so the feed says "9 min ago" rather than a date.
    "DELETE FROM posts WHERE id LIKE 'demo-%';",
  ];
  for (const [index, post] of POSTS.entries()) {
    const at = now - post.minutesAgo * 60;
    const key = post.photo ? `uploads/demo-${post.by}/${post.photo}.webp` : null;
    if (key) {
      const file = join(APP, "scripts", "demo", `${post.photo}.webp`);
      wrangler("r2", "object", "put", `cloudflare-free-media/${key}`, "--file", file, "--content-type", "image/webp", "--local");
      statements.push(
        `INSERT OR REPLACE INTO uploads (key, owner_id, content_type, size) VALUES (${sql(key)}, ${sql(`demo-${post.by}`)}, 'image/webp', ${statSync(file).size});`,
      );
    }
    statements.push(
      `INSERT INTO posts (id, author_id, kind, body, image_key, image_alt, status, created_at, published_at) VALUES (${sql(`demo-post-${index + 1}`)}, ${sql(`demo-${post.by}`)}, 'community', ${sql(post.body)}, ${sql(key)}, ${sql(post.alt)}, 'published', ${at}, ${at});`,
    );
  }
  const folder = mkdtempSync(join(tmpdir(), "demo-seed-"));
  try {
    writeFileSync(join(folder, "seed.sql"), statements.join("\n"));
    wrangler("d1", "execute", "cloudflare-free", "--local", "--file", join(folder, "seed.sql"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Sends the conversation as each member, unless it was sent in the last six hours. */
async function seedChat() {
  const { messages } = await (await fetch(`${SITE}/api/chat/lobby/history`)).json();
  const last = messages.at(-1);
  if (last?.text === CHAT.at(-1)[1] && Date.now() / 1000 - last.at < 6 * 3600) return 0;

  const sockets = new Map();
  const errors = [];
  for (const [username, text] of CHAT) {
    let socket = sockets.get(username);
    if (!socket) {
      socket = new WebSocket(`${SITE.replace(/^http/, "ws")}/api/chat/lobby/ws`, { headers: { cookie: sessionCookie(username) } });
      socket.addEventListener("message", ({ data }) => {
        const event = JSON.parse(String(data));
        if (event.type === "error") errors.push(`${username}: ${event.message}`);
      });
      await new Promise((done, failed) => {
        socket.addEventListener("open", done, { once: true });
        socket.addEventListener("error", () => failed(new Error("Couldn't open the chat WebSocket")), { once: true });
      });
      sockets.set(username, socket);
    }
    socket.send(JSON.stringify({ text }));
    await sleep(300);
  }
  await sleep(500);
  for (const socket of sockets.values()) socket.close();
  if (errors.length) throw new Error(`The chat room refused messages: ${errors.join("; ")}`);
  return CHAT.length;
}

async function main() {
  await fetch(`${SITE}/api/health`).catch(() => {
    throw new Error(`Nothing answered at ${SITE}; start the site with npm run dev first`);
  });
  seedDatabase();
  const sent = await seedChat();
  const photos = POSTS.filter((post) => post.photo).length;
  console.log(
    `Demo community ready: ${MEMBERS.length} members, ${POSTS.length} posts (${photos} with photos), ${sent} new chat messages in #lobby.`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
