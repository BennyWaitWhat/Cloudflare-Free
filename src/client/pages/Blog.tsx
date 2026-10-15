import { useState, type FormEvent } from "react";
import type { PublicPost } from "../../shared/types";
import { api, errorMessage } from "../api";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { useSite } from "../site";
import { useFeed } from "./Community";

export function Blog() {
  const { user } = useSite();
  const feed = useFeed("blog");

  return (
    <>
      <header className="page-header">
        <h1>Blog</h1>
        <p className="lead">Notes from building on a $0 budget.</p>
      </header>
      <SiteSearch />
      {user?.isAdmin && <Composer kind="blog" onPosted={feed.reload} />}
      <div className="stack">
        {feed.error && <p className="error">{feed.error}</p>}
        {feed.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {!feed.loading && feed.posts.length === 0 && !feed.error && <p className="muted">No blog posts yet.</p>}
        {feed.nextBefore && (
          <button type="button" className="secondary" disabled={feed.loading} onClick={feed.loadMore}>
            Load more
          </button>
        )}
      </div>
    </>
  );
}

/** Semantic search: Workers AI embeds the question and Vectorize finds the closest posts. */
export function SiteSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ score: number; post: PublicPost }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResults((await api<{ results: { score: number; post: PublicPost }[] }>(`/api/ai/search?q=${encodeURIComponent(query)}`)).results);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Search the site by meaning</h3>
      <form className="row" onSubmit={search}>
        <input value={query} maxLength={200} placeholder="e.g. photos of the ocean" onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={busy || query.trim().length < 2}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {results && results.length === 0 && <p className="muted">Nothing close yet.</p>}
      {results && results.length > 0 && (
        <div className="stack">
          {results.map(({ score, post }) => (
            <div key={post.id}>
              <p className="muted small">Match {Math.round(score * 100)}%</p>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
