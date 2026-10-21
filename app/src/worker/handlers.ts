import PostalMime from "postal-mime";
import type { Bindings, JobMessage } from "./env";
import { track } from "./lib/analytics";

/** Queue consumer: stores contact messages and tells the owner about them. */
export async function handleQueue(batch: MessageBatch<JobMessage>, env: Bindings): Promise<void> {
  for (const message of batch.messages) {
    try {
      await handleJob(message.body, env);
      message.ack();
    } catch (error) {
      console.error("job failed; will retry", message.body.type, error);
      message.retry({ delaySeconds: 30 });
    }
  }
}

async function handleJob(job: JobMessage, env: Bindings): Promise<void> {
  switch (job.type) {
    case "contact": {
      // INSERT OR IGNORE keeps retries idempotent.
      await env.DB.prepare(
        "INSERT OR IGNORE INTO contact_messages (id, name, email, message, country, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(job.id, job.name, job.email, job.message, job.country, job.at)
        .run();
      await notifyOwner(env, `New message from ${job.name}`, `${job.name} <${job.email}> wrote:\n\n${job.message}`);
      track(env, "contact_stored", { country: job.country });
      return;
    }
  }
}

/**
 * Sends to your own verified address, which is free on every plan. Needs the
 * NOTIFY_EMAIL send_email binding plus OWNER_EMAIL and NOTIFY_FROM, all of
 * which depend on Email Routing for your domain.
 */
async function notifyOwner(env: Bindings, subject: string, text: string): Promise<void> {
  if (!env.NOTIFY_EMAIL || !env.OWNER_EMAIL || !env.NOTIFY_FROM) return;
  await env.NOTIFY_EMAIL.send({ from: env.NOTIFY_FROM, to: env.OWNER_EMAIL, subject, text });
}

/** Cron Trigger: a nightly snapshot of site totals. */
export async function handleScheduled(controller: ScheduledController, env: Bindings): Promise<void> {
  const day = new Date(controller.scheduledTime).toISOString().slice(0, 10);
  const [users, published, pending, messages, inbound] = await env.DB.batch<{ n: number }>([
    env.DB.prepare("SELECT COUNT(*) AS n FROM users"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM contact_messages"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM inbound_emails"),
  ]);
  const n = (result: D1Result<{ n: number }>) => result.results[0]?.n ?? 0;
  const stats = {
    members: n(users),
    publishedPosts: n(published),
    pendingPosts: n(pending),
    contactMessages: n(messages),
    inboundEmails: n(inbound),
  };
  await env.DB.prepare("INSERT OR REPLACE INTO daily_stats (day, data) VALUES (?, ?)").bind(day, JSON.stringify(stats)).run();
  track(env, "nightly_rollup", { detail: day });
}

/**
 * Email Worker: mail routed to this Worker is forwarded to OWNER_EMAIL first, then
 * copied into the admin inbox. Saving the copy is best-effort, so a message too
 * big to parse within the CPU limit, or a failed write, still reaches the owner.
 */
export async function handleEmail(message: ForwardableEmailMessage, env: Bindings): Promise<void> {
  const raw = message.rawSize <= 512 * 1024 ? await new Response(message.raw).arrayBuffer() : null;
  if (env.OWNER_EMAIL) await message.forward(env.OWNER_EMAIL);
  try {
    const parsed = raw ? await PostalMime.parse(raw) : null;
    const text = parsed ? (parsed.text ?? "") : "(too large to preview; see your inbox)";
    await env.DB.prepare("INSERT INTO inbound_emails (id, from_addr, to_addr, subject, text_body) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), message.from, message.to, parsed?.subject ?? message.headers.get("subject"), text.slice(0, 20000))
      .run();
    track(env, "email_received");
  } catch (error) {
    console.error("email forwarded but not saved to the admin inbox", error);
  }
}
