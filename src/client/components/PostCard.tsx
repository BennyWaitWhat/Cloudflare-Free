import { IMAGE_WIDTHS, type PublicPost } from "../../shared/types";
import { imageUrl, timeAgo } from "../api";

export function PostCard({ post }: { post: PublicPost }) {
  const { imageKey } = post;
  return (
    <article className="card post">
      {post.title && <h3>{post.title}</h3>}
      {imageKey && (
        <img
          className="post-image"
          src={imageUrl(imageKey, 640)}
          srcSet={IMAGE_WIDTHS.map((width) => `${imageUrl(imageKey, width)} ${width}w`).join(", ")}
          sizes="(max-width: 720px) 100vw, 640px"
          alt={post.imageAlt ?? ""}
          loading="lazy"
        />
      )}
      <p className="post-body">{post.body}</p>
      <footer className="muted small">
        {post.author.displayName} · @{post.author.username} · {timeAgo(post.publishedAt ?? post.createdAt)}
        {post.status !== "published" && <span className={`badge ${post.status}`}>{post.status}</span>}
      </footer>
    </article>
  );
}
