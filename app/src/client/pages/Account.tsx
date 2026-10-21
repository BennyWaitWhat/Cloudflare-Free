import { useEffect, useState, type FormEvent } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { PublicPost, SessionUser } from "../../shared/types";
import { api, errorMessage } from "../api";
import { PostCard } from "../components/PostCard";
import { Turnstile } from "../components/Turnstile";
import { useSite } from "../site";

export function Account() {
  const { user } = useSite();
  return user ? <Profile user={user} /> : <SignIn />;
}

function Profile({ user }: { user: SessionUser }) {
  const { setUser } = useSite();
  const [posts, setPosts] = useState<PublicPost[]>([]);

  useEffect(() => {
    api<{ posts: PublicPost[] }>("/api/posts/mine")
      .then((result) => setPosts(result.posts))
      .catch(() => setPosts([]));
  }, []);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <>
      <header className="page-header">
        <h1>{user.displayName}</h1>
        <p className="lead">
          @{user.username}
          {user.isAdmin ? " · site owner" : ""}
        </p>
        <p className="muted">
          Member id: <code>{user.id}</code>
        </p>
        <button type="button" className="secondary" onClick={signOut}>
          Sign out
        </button>
      </header>
      <h2>Your posts</h2>
      <div className="stack">
        {posts.length === 0 && <p className="muted">Nothing yet.</p>}
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </>
  );
}

function SignIn() {
  const { setUser } = useSite();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = browserSupportsWebAuthn();

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>("/api/auth/login/options", { method: "POST" });
      const response = await startAuthentication({ optionsJSON });
      setUser((await api<{ user: SessionUser }>("/api/auth/login/verify", { json: { response } })).user);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>("/api/auth/register/options", {
        json: { username, displayName, turnstileToken: token },
      });
      const response = await startRegistration({ optionsJSON });
      setUser((await api<{ user: SessionUser }>("/api/auth/register/verify", { json: { response } })).user);
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
        <h1>Sign in</h1>
        <p className="lead">
          This site uses passkeys: your device signs in with a fingerprint, face or PIN, and there's no password to leak.
        </p>
      </header>
      {!supported && <p className="error" role="alert">This browser doesn't support passkeys.</p>}
      <div className="grid two top">
        <section className="card">
          <h2 className="h3">I have an account</h2>
          <button type="button" disabled={busy || !supported} onClick={signIn}>
            Sign in with a passkey
          </button>
        </section>
        <form className="card form" onSubmit={register}>
          <h2 className="h3">Create an account</h2>
          <label>
            Username
            <input
              value={username}
              pattern="[a-z0-9_]{3,24}"
              title="3-24 characters: a-z, 0-9 and _"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
          </label>
          <label>
            Display name
            <input value={displayName} maxLength={40} autoComplete="nickname" onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <Turnstile onToken={setToken} resetKey={round} />
          <button type="submit" disabled={busy || !supported || !token}>
            Create a passkey
          </button>
        </form>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
