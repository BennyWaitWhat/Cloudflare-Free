import { useState, type FormEvent } from "react";
import type { PostKind, PostStatus, PublicPost } from "../../shared/types";
import { api, errorMessage, sleep } from "../api";
import { Link } from "../router";
import { useSite } from "../site";
import { Turnstile } from "./Turnstile";

/** Polls until the moderation Workflow publishes or rejects the post (about 30 s at most). */
async function waitForModeration(id: string): Promise<PostStatus> {
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(2000);
    const { post } = await api<{ post: PublicPost }>(`/api/posts/${id}`);
    if (post.status !== "pending") return post.status;
  }
  return "pending";
}

export function Composer({ kind, onPosted }: { kind: PostKind; onPosted: () => void }) {
  const { user } = useSite();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="card">
        <p>
          <Link to="/account">Sign in with a passkey</Link> to post.
        </p>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let imageKey: string | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        imageKey = (await api<{ key: string }>("/api/uploads", { body: form })).key;
      }
      const { post } = await api<{ post: { id: string } }>("/api/posts", {
        json: { kind, title: title || undefined, body, imageKey, turnstileToken: token },
      });
      setTitle("");
      setBody("");
      setFile(null);
      setNotice("Checking your post with the AI safety model…");
      const status = await waitForModeration(post.id);
      setNotice(
        status === "published"
          ? "Published."
          : status === "rejected"
            ? "The safety check held this post back."
            : "Still waiting: the site owner can publish it from the Admin page.",
      );
      onPosted();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      setToken(null);
      setRound((value) => value + 1);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      {kind === "blog" && (
        <input placeholder="Title" aria-label="Title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
      )}
      <textarea
        placeholder={kind === "blog" ? "Write a blog post" : "Share something with the community"}
        aria-label={kind === "blog" ? "Blog post" : "Your post"}
        value={body}
        maxLength={5000}
        rows={4}
        required
        onChange={(e) => setBody(e.target.value)}
      />
      <label className="file">
        <span>{file ? file.name : "Add a photo (optional, up to 8 MB)"}</span>
        <input key={round} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Turnstile onToken={setToken} resetKey={round} />
      <div className="row">
        <button type="submit" disabled={busy || !token || !body.trim()}>
          {busy ? "Posting…" : "Post"}
        </button>
        {/* Always rendered, so screen readers hear each new notice. */}
        <span className="muted" role="status">{notice}</span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
