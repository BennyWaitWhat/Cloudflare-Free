import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LinkPreview } from "../../shared/types";
import { api, errorMessage, request } from "../api";
import { EdgeCard } from "../components/EdgeCard";
import { useSite } from "../site";

export function Lab() {
  return (
    <>
      <header className="page-header">
        <h1>Lab</h1>
        <p className="lead">
          Small demos of free Cloudflare products. AI tools share one budget of 10,000 Neurons a day, so they may pause until
          midnight UTC.
        </p>
      </header>
      <div className="grid two">
        <AssistantDemo />
        <ImageDemo />
        <PreviewDemo />
        <DnsDemo />
        <MarkdownDemo />
        <EdgeCard />
        <StatusDemo />
        <RandomDemo />
      </div>
    </>
  );
}

type Turn = { role: "user" | "assistant"; content: string };

/** Workers AI chat, streamed token by token from the Worker. */
function AssistantDemo() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    const history: Turn[] = [...turns, { role: "user", content: question }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const response = await request("/api/ai/chat", { json: { messages: history } });
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += value;
        setTurns([...history, { role: "assistant", content: answer }]);
      }
    } catch (failure) {
      setError(errorMessage(failure));
      setTurns(history);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Ask the assistant</h3>
      <p className="muted small">Workers AI (GLM-4.7 Flash), with posts found through Vectorize as context.</p>
      <div className="chat-log short">
        {turns.length === 0 && <p className="muted">Try: "Which free products does this site use?"</p>}
        {turns.map((turn, index) => (
          <p key={index} className={turn.role === "user" ? "turn user" : "turn"}>
            {turn.content || "…"}
          </p>
        ))}
      </div>
      <form className="row" onSubmit={ask}>
        <input value={draft} maxLength={2000} placeholder="Ask something" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" disabled={busy || !draft.trim()}>
          Ask
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** FLUX.1 schnell on Workers AI; the prompt is screened by Llama Guard first. */
function ImageDemo() {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image);
  }, [image]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await request("/api/ai/image", { json: { prompt } });
      setImage(URL.createObjectURL(await response.blob()));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Generate an image</h3>
      <p className="muted small">FLUX.1 schnell on Workers AI, about 57 Neurons per image.</p>
      <form className="row" onSubmit={generate}>
        <input value={prompt} maxLength={500} placeholder="A lighthouse made of clouds" onChange={(e) => setPrompt(e.target.value)} />
        <button type="submit" disabled={busy || prompt.trim().length < 3}>
          {busy ? "Drawing…" : "Draw"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {image && <img className="generated" src={image} alt={prompt} />}
    </section>
  );
}

/** Open Graph previews (Worker fetch + HTMLRewriter, cached in KV) and Browser Run screenshots. */
function PreviewDemo() {
  const { user } = useSite();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [cached, setCached] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setScreenshot(null);
    try {
      const result = await api<{ preview: LinkPreview; cached: boolean }>("/api/tools/preview", { json: { url } });
      setPreview(result.preview);
      setCached(result.cached);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    setBusy(true);
    setError(null);
    try {
      setScreenshot((await api<{ url: string }>("/api/tools/screenshot", { json: { url } })).url);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Link preview</h3>
      <p className="muted small">Worker fetch + HTMLRewriter, cached in KV. Screenshots use Browser Run.</p>
      <form className="row" onSubmit={load}>
        <input type="url" value={url} placeholder="https://example.com" onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" disabled={busy || !url}>
          Preview
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {preview && (
        <div className="preview">
          {preview.image && <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div>
            <strong>{preview.title ?? preview.url}</strong>
            {preview.description && <p className="small">{preview.description}</p>}
            <p className="muted small">
              {preview.siteName} {cached ? "· from KV cache" : ""}
            </p>
          </div>
        </div>
      )}
      {preview && (
        <button type="button" className="secondary" disabled={busy || !user} onClick={capture}>
          {user ? "Take a screenshot" : "Sign in to take a screenshot"}
        </button>
      )}
      {screenshot && <img className="generated" src={screenshot} alt={`Screenshot of ${url}`} />}
    </section>
  );
}

const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "HTTPS", "SOA"];

interface DnsAnswer {
  Status: number;
  Answer?: { name: string; type: number; TTL: number; data: string }[];
}

/** 1.1.1.1 DNS over HTTPS, through the Worker. */
function DnsDemo() {
  const [name, setName] = useState("cloudflare.com");
  const [type, setType] = useState("A");
  const [answer, setAnswer] = useState<DnsAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setAnswer(await api<DnsAnswer>(`/api/tools/dns?name=${encodeURIComponent(name)}&type=${type}`));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <section className="card">
      <h3>DNS lookup</h3>
      <p className="muted small">The 1.1.1.1 resolver's DNS-over-HTTPS JSON API.</p>
      <form className="row" onSubmit={lookup}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {DNS_TYPES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button type="submit">Look up</button>
      </form>
      {error && <p className="error">{error}</p>}
      {answer && (
        <ul className="plain small">
          {(answer.Answer ?? []).map((record, index) => (
            <li key={index}>
              <code>{record.data}</code> <span className="muted">TTL {record.TTL}</span>
            </li>
          ))}
          {!answer.Answer?.length && <li className="muted">No records (status {answer.Status}).</li>}
        </ul>
      )}
    </section>
  );
}

/** Workers AI document conversion to Markdown (free for non-image files). */
function MarkdownDemo() {
  const input = useRef<HTMLInputElement>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      setMarkdown((await api<{ markdown: string }>("/api/ai/markdown", { body: form })).markdown);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Document to Markdown</h3>
      <p className="muted small">PDF, Office, HTML, CSV and more, converted by Workers AI.</p>
      <form className="row" onSubmit={convert}>
        <input ref={input} type="file" />
        <button type="submit" disabled={busy}>
          Convert
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {markdown && <pre className="output">{markdown.slice(0, 4000)}</pre>}
    </section>
  );
}

interface StatusSummary {
  indicator: string;
  description: string;
  incidents: { name: string; status: string; url: string }[];
}

/** Cloudflare's public status API. */
function StatusDemo() {
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StatusSummary>("/api/tools/status")
      .then(setStatus)
      .catch((failure) => setError(errorMessage(failure)));
  }, []);

  return (
    <section className="card">
      <h3>Cloudflare status</h3>
      {error && <p className="error">{error}</p>}
      {status && (
        <>
          <p>
            <span className={`dot indicator-${status.indicator}`} /> {status.description}
          </p>
          <ul className="plain small">
            {status.incidents.map((incident) => (
              <li key={incident.url}>
                <a href={incident.url} target="_blank" rel="noreferrer">
                  {incident.name}
                </a>{" "}
                <span className="muted">({incident.status})</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface Beacon {
  round: number;
  randomness: string;
  dice: number;
  source: string;
}

/** drand: public, verifiable randomness relayed by Cloudflare. */
function RandomDemo() {
  const [beacon, setBeacon] = useState<Beacon | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function roll() {
    setError(null);
    try {
      setBeacon(await api<Beacon>("/api/tools/random"));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <section className="card">
      <h3>Verifiable dice</h3>
      <p className="muted small">Each roll comes from a public drand round that anyone can check.</p>
      <button type="button" onClick={roll}>
        Roll
      </button>
      {error && <p className="error">{error}</p>}
      {beacon && (
        <p>
          <span className="dice">{beacon.dice}</span> from round{" "}
          <a href={beacon.source} target="_blank" rel="noreferrer">
            {beacon.round}
          </a>
          <br />
          <code className="small">{beacon.randomness.slice(0, 32)}…</code>
        </p>
      )}
    </section>
  );
}
