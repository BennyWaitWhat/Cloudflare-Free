import { useCallback, useEffect, useState } from "react";
import type { PostKind, PublicPost } from "../../shared/types";
import { api, errorMessage } from "../api";
import { ChatPanel } from "../components/ChatPanel";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";

export function useFeed(kind: PostKind) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      try {
        const result = await api<{ posts: PublicPost[]; nextBefore: number | null }>(
          `/api/posts?kind=${kind}${before ? `&before=${before}` : ""}`,
        );
        setPosts((previous) => (before ? [...previous, ...result.posts] : result.posts));
        setNextBefore(result.nextBefore);
        setError(null);
      } catch (failure) {
        setError(errorMessage(failure));
      } finally {
        setLoading(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { posts, nextBefore, loading, error, reload: () => load(), loadMore: () => nextBefore && load(nextBefore) };
}

export function Community() {
  const feed = useFeed("community");

  return (
    <>
      <header className="page-header">
        <h1>Community</h1>
        <p className="lead">
          Posts and photos are stored in D1 and R2. A Workflow checks each one with Llama Guard, writes alt text with a vision
          model and indexes it in Vectorize before it appears. Chat rooms are Durable Objects.
        </p>
      </header>
      <div className="columns">
        <div className="stack">
          <Composer kind="community" onPosted={feed.reload} />
          {feed.error && <p className="error">{feed.error}</p>}
          {feed.posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {!feed.loading && feed.posts.length === 0 && !feed.error && <p className="muted">No posts yet. Be the first.</p>}
          {feed.nextBefore && (
            <button type="button" className="secondary" disabled={feed.loading} onClick={feed.loadMore}>
              Load more
            </button>
          )}
        </div>
        <ChatPanel />
      </div>
    </>
  );
}
