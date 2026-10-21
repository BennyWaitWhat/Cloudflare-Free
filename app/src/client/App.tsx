import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, usePath } from "./router";
import { useSite } from "./site";
import { Account } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { Blog } from "./pages/Blog";
import { Community } from "./pages/Community";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { HowItWorks } from "./pages/HowItWorks";
import { Lab } from "./pages/Lab";
import { Scoreboard } from "./pages/Scoreboard";

const PAGES: Record<string, ComponentType> = {
  "/": Home,
  "/scoreboard": Scoreboard,
  "/how-it-works": HowItWorks,
  "/community": Community,
  "/lab": Lab,
  "/blog": Blog,
  "/contact": Contact,
  "/account": Account,
  "/admin": Admin,
};

const NAV = [
  { to: "/scoreboard", label: "Scoreboard" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/community", label: "Community" },
  { to: "/lab", label: "Lab" },
  { to: "/blog", label: "Blog" },
  { to: "/contact", label: "Contact" },
];

/** The browser tab's title for each page; the home page gets its own. */
const TITLES: Record<string, string> = {
  "/scoreboard": "Scoreboard",
  "/how-it-works": "How it works",
  "/community": "Community",
  "/lab": "Lab",
  "/blog": "Blog",
  "/contact": "Contact",
  "/account": "Account",
  "/admin": "Admin",
};

/** Chromium browsers' offer to install the app (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

export function App() {
  const path = usePath();
  const { config, user } = useSite();
  const Page = PAGES[path] ?? NotFound;
  const nav = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const shownPath = useRef(path);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  // On phones the nav scrolls sideways, so center the current page's link.
  useEffect(() => {
    const active = nav.current?.querySelector("a.active");
    if (!nav.current || !active) return;
    const navBox = nav.current.getBoundingClientRect();
    const linkBox = active.getBoundingClientRect();
    nav.current.scrollLeft += linkBox.left - navBox.left - (navBox.width - linkBox.width) / 2;
  }, [path]);

  // After a page change, start keyboard and screen reader users at the new page's content.
  useEffect(() => {
    if (shownPath.current === path) return;
    shownPath.current = path;
    main.current?.focus({ preventScroll: true });
  }, [path]);

  useEffect(() => {
    const site = config?.siteName ?? "Cloudflare Free";
    document.title =
      path === "/" ? `${site}: built only from Cloudflare's free tier` : `${TITLES[path] ?? "Page not found"} · ${site}`;
  }, [path, config?.siteName]);

  // Keep the browser's install offer for the footer button instead of its default banner.
  useEffect(() => {
    const offer = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  function install() {
    // An offer can be shown only once.
    installPrompt?.prompt().catch(() => undefined);
    setInstallPrompt(null);
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>{config?.siteName ?? "Cloudflare Free"}</span>
        </Link>
        <nav className="nav" ref={nav}>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={path === item.to ? "active" : undefined}
              aria-current={path === item.to ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          {user?.isAdmin && (
            <Link
              to="/admin"
              className={path === "/admin" ? "active" : undefined}
              aria-current={path === "/admin" ? "page" : undefined}
            >
              Admin
            </Link>
          )}
        </nav>
        <Link to="/account" className="account-link">
          {user ? user.displayName : "Sign in"}
        </Link>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="content">
        <Page />
      </main>
      <footer className="footer">
        <span>Built only from Cloudflare's free tier.</span>
        {installPrompt && (
          <button type="button" className="secondary" onClick={install}>
            Install the app
          </button>
        )}
        <span>Unofficial project; not affiliated with Cloudflare.</span>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section className="card">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to the start</Link>
      </p>
    </section>
  );
}
