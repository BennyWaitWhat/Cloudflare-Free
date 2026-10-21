import { useEffect, useState } from "react";
import { CATALOG, score } from "../../shared/catalog";
import type { PublicPost } from "../../shared/types";
import { api } from "../api";
import { EdgeCard } from "../components/EdgeCard";
import { PostCard } from "../components/PostCard";
import { ScoreBar } from "../components/ScoreBar";
import { Link } from "../router";

const SECTIONS = [
  {
    to: "/scoreboard",
    title: "Scoreboard",
    text: `${CATALOG.length} free Cloudflare offerings, what each allows, and whether this site uses it yet.`,
  },
  { to: "/community", title: "Community", text: "Post photos, chat in real time, and watch AI moderation publish your posts." },
  { to: "/lab", title: "Lab", text: "Try Workers AI, Browser Run, DNS over HTTPS, the randomness beacon and more." },
  { to: "/blog", title: "Blog", text: "Notes from building on a $0 budget, with semantic search across every post." },
];

export function Home() {
  const totals = score(CATALOG);
  const [latest, setLatest] = useState<PublicPost[]>([]);

  useEffect(() => {
    api<{ posts: PublicPost[] }>("/api/posts?kind=community")
      .then((result) => setLatest(result.posts.slice(0, 3)))
      .catch(() => setLatest([]));
  }, []);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">The $0 challenge</p>
          <h1>A website and app built only from Cloudflare's free tier.</h1>
          <p className="lead">
            No servers and no paid plans. {totals.withCode} of {totals.total} free Cloudflare offerings run on code here,{" "}
            {totals.settings} more are free settings it switches on, and the scoreboard tracks the rest.
          </p>
          <div className="row">
            <Link to="/scoreboard" className="button">
              See the scoreboard
            </Link>
            <Link to="/community" className="button secondary">
              Join the community
            </Link>
          </div>
        </div>
        <div className="card hero-score">
          <p className="hero-number">
            {totals.withCode}
            <span> / {totals.total}</span>
          </p>
          <p className="muted">free Cloudflare offerings run on code here</p>
          <ScoreBar score={totals} />
        </div>
      </section>

      <section className="grid two">
        {SECTIONS.map((section) => (
          <Link key={section.to} to={section.to} className="card tile">
            <h2 className="h3">{section.title}</h2>
            <p className="muted">{section.text}</p>
          </Link>
        ))}
      </section>

      <EdgeCard />

      {latest.length > 0 && (
        <section className="latest">
          <h2>Latest from the community</h2>
          <div className="stack">
            {latest.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
