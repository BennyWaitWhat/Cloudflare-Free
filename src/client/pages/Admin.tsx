import { useCallback, useEffect, useState } from "react";
import type { PublicPost } from "../../shared/types";
import { api, errorMessage, timeAgo } from "../api";
import { PostCard } from "../components/PostCard";
import { useSite } from "../site";

interface Overview {
  users: number;
  posts: { published: number; pending: number; rejected: number };
  newMessages: number;
  inboundEmails: number;
}

interface Message {
  id: string;
  name: string;
  email: string;
  message: string;
  country: string | null;
  status: string;
  created_at: number;
}

interface InboundEmail {
  id: string;
  from_addr: string;
  to_addr: string;
  subject: string | null;
  text_body: string | null;
  received_at: number;
}

export function Admin() {
  const { user } = useSite();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pending, setPending] = useState<PublicPost[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, posts, contact, inbox] = await Promise.all([
        api<Overview>("/api/admin/overview"),
        api<{ posts: PublicPost[] }>("/api/admin/posts?status=pending"),
        api<{ messages: Message[] }>("/api/admin/messages"),
        api<{ emails: InboundEmail[] }>("/api/admin/inbox"),
      ]);
      setOverview(summary);
      setPending(posts.posts);
      setMessages(contact.messages);
      setEmails(inbox.emails);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) void load();
  }, [user?.isAdmin, load]);

  if (!user?.isAdmin) return <p className="card">Only the site owner can see this page.</p>;

  async function setPostStatus(id: string, status: "published" | "rejected") {
    await api(`/api/admin/posts/${id}/status`, { json: { status } });
    await load();
  }

  async function markRead(id: string) {
    await api(`/api/admin/messages/${id}/status`, { json: { status: "read" } });
    await load();
  }

  return (
    <>
      <header className="page-header">
        <h1>Admin</h1>
        {overview && (
          <p className="lead">
            {overview.users} members · {overview.posts.published} published, {overview.posts.pending} pending,{" "}
            {overview.posts.rejected} rejected · {overview.newMessages} new messages · {overview.inboundEmails} emails
          </p>
        )}
      </header>
      {error && <p className="error">{error}</p>}

      <h2>Waiting for review</h2>
      <div className="stack">
        {pending.length === 0 && <p className="muted">Nothing pending.</p>}
        {pending.map((post) => (
          <div key={post.id}>
            <PostCard post={post} />
            <div className="row">
              <button type="button" onClick={() => setPostStatus(post.id, "published")}>
                Publish
              </button>
              <button type="button" className="secondary" onClick={() => setPostStatus(post.id, "rejected")}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2>Contact messages</h2>
      <div className="stack">
        {messages.length === 0 && <p className="muted">No messages.</p>}
        {messages.map((message) => (
          <article key={message.id} className="card">
            <p>
              <strong>{message.name}</strong> &lt;{message.email}&gt; · {timeAgo(message.created_at)}
              {message.country ? ` · ${message.country}` : ""} <span className="badge">{message.status}</span>
            </p>
            <p className="post-body">{message.message}</p>
            {message.status === "new" && (
              <button type="button" className="secondary" onClick={() => markRead(message.id)}>
                Mark read
              </button>
            )}
          </article>
        ))}
      </div>

      <h2>Email inbox</h2>
      <div className="stack">
        {emails.length === 0 && <p className="muted">No email yet. This fills up once Email Routing sends mail to the Worker.</p>}
        {emails.map((email) => (
          <article key={email.id} className="card">
            <p>
              <strong>{email.subject ?? "(no subject)"}</strong> · from {email.from_addr} to {email.to_addr} ·{" "}
              {timeAgo(email.received_at)}
            </p>
            <p className="post-body">{email.text_body}</p>
          </article>
        ))}
      </div>
    </>
  );
}
