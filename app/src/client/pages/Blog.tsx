import { useState, type FormEvent } from "react";
import type { PublicPost } from "../../shared/types";
import { api, errorMessage } from "../api";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { Link } from "../router";
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
        {feed.error && (
          <div className="row">
            <p className="error" role="alert">{feed.error}</p>
            <button type="button" className="secondary" disabled={feed.loading} onClick={feed.reload}>
              Try again
            </button>
          </div>
        )}
        {feed.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {!feed.loading && feed.posts.length === 0 && !feed.error && (
          <div className="card">
            <p>No posts yet.</p>
            <p className="muted">
              Notes from building on a $0 budget land here. Meanwhile,{" "}
              <Link to="/community">see what the community is sharing</Link>.
            </p>
          </div>
        )}
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
      <h2 className="h3">Search the site by meaning</h2>
      <form className="row" onSubmit={search}>
        <input
          value={query}
          maxLength={200}
          placeholder="e.g. photos of the ocean"
          aria-label="Search the site by meaning"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy || query.trim().length < 2}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
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
