// Links to the interactive diagrams in public/learn, which are plain HTML files rather than app pages.
// `npm run diagrams:images` writes the thumbnails in public/diagrams.
type Kind = "Architecture" | "Sequence" | "Workflow" | "Data flow" | "Lifecycle";

interface Diagram {
  slug: string;
  title: string;
  kind: Kind;
  text: string;
}

const GROUPS: { title: string; diagrams: Diagram[] }[] = [
  {
    title: "The big picture",
    diagrams: [
      {
        slug: "overview",
        title: "How the pieces fit together",
        kind: "Architecture",
        text: "The whole site on one page: what comes from Static Assets and what runs in the Worker.",
      },
      {
        slug: "pages",
        title: "Pages and the installable app",
        kind: "Workflow",
        text: "Which requests reach the Worker, how every page gets the app shell, and how the app opens offline and installs.",
      },
    ],
  },
  {
    title: "Members and posts",
    diagrams: [
      {
        slug: "sign-in",
        title: "Signing in with a passkey",
        kind: "Sequence",
        text: "Sign-up and sign-in with WebAuthn: a human check, a one-time challenge and a signed session cookie.",
      },
      {
        slug: "photos",
        title: "Uploading and serving photos",
        kind: "Sequence",
        text: "Photos go into R2; the Images binding resizes them to three widths that the edge cache keeps.",
      },
      {
        slug: "posting",
        title: "Posting a photo",
        kind: "Workflow",
        text: "The checks before a post is saved, then the Workflow that describes its photo, screens it and indexes it.",
      },
      {
        slug: "post-lifecycle",
        title: "A post's journey",
        kind: "Lifecycle",
        text: "Every state a post can be in, from pending to published or rejected, and what moves it.",
      },
    ],
  },
  {
    title: "Chat and AI",
    diagrams: [
      {
        slug: "chat",
        title: "Live chat in a Durable Object",
        kind: "Sequence",
        text: "Each room is one Durable Object holding WebSockets that hibernate while the room is quiet.",
      },
      {
        slug: "assistant",
        title: "Asking the AI assistant",
        kind: "Sequence",
        text: "A question finds related posts through Vectorize, then Workers AI streams the answer.",
      },
      {
        slug: "lab-tools",
        title: "The Lab's tools",
        kind: "Architecture",
        text: "DNS lookups, Cloudflare's status and verifiable dice, plus AI tools limited to 6 calls a minute each.",
      },
      {
        slug: "link-preview",
        title: "Link previews and screenshots",
        kind: "Workflow",
        text: "A link is checked, read with HTMLRewriter and cached in KV; members can also get a screenshot from Browser Run.",
      },
    ],
  },
  {
    title: "Messages and numbers",
    diagrams: [
      {
        slug: "contact",
        title: "Sending a contact message",
        kind: "Workflow",
        text: "The form is answered at once; a Queue saves the message, emails the owner and retries failures.",
      },
      {
        slug: "email",
        title: "Email in and out",
        kind: "Data flow",
        text: "Mail sent to the domain lands in the admin inbox, and contact messages are emailed to the owner.",
      },
      {
        slug: "insights",
        title: "Usage insights and the nightly rollup",
        kind: "Data flow",
        text: "Analytics Engine events, logs and a nightly Cron rollup show how the site is used.",
      },
    ],
  },
];

export function HowItWorks() {
  return (
    <>
      <header className="page-header">
        <h1>How it works</h1>
        <p className="lead">
          One diagram for each piece of this site: what runs where, in what order, and which free Cloudflare product does
          each job. Open one to zoom, search, trace a path or save it as an image.
        </p>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <div className="grid two">
            {group.diagrams.map((diagram) => (
              <a key={diagram.slug} href={`/learn/${diagram.slug}.html`} className="card tile diagram-tile">
                <picture>
                  <source media="(prefers-color-scheme: dark)" srcSet={`/diagrams/${diagram.slug}-dark.webp`} />
                  <img className="thumb" src={`/diagrams/${diagram.slug}-light.webp`} alt="" loading="lazy" decoding="async" />
                </picture>
                <p className="eyebrow">{diagram.kind}</p>
                <h3>{diagram.title}</h3>
                <p className="muted">{diagram.text}</p>
              </a>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
