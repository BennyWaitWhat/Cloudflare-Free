import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import { Turnstile } from "../components/Turnstile";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/contact", { json: { name, email, message, turnstileToken: token } });
      setSent(true);
      setMessage("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      setToken(null);
      setRound((value) => value + 1);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Contact</h1>
        <p className="lead">
          Turnstile checks you're human without a puzzle. Your message goes onto a Queue, and a consumer stores it in D1 and emails
          the owner.
        </p>
      </header>
      {sent ? (
        <section className="card">
          <h3>Thanks, your message is on its way.</h3>
          <button type="button" className="secondary" onClick={() => setSent(false)}>
            Send another
          </button>
        </section>
      ) : (
        <form className="card form" onSubmit={submit}>
          <label>
            Name
            <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={email} maxLength={254} required onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Message
            <textarea value={message} rows={6} minLength={5} maxLength={4000} required onChange={(e) => setMessage(e.target.value)} />
          </label>
          <Turnstile onToken={setToken} resetKey={round} />
          <button type="submit" disabled={busy || !token}>
            {busy ? "Sending…" : "Send"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </>
  );
}
