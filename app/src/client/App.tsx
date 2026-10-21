import { useEffect, useRef, type ComponentType } from "react";
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

export function App() {
  const path = usePath();
  const { config, user } = useSite();
  const Page = PAGES[path] ?? NotFound;
  const nav = useRef<HTMLElement>(null);

  // On phones the nav scrolls sideways, so center the current page's link.
  useEffect(() => {
    const active = nav.current?.querySelector("a.active");
    if (!nav.current || !active) return;
    const navBox = nav.current.getBoundingClientRect();
    const linkBox = active.getBoundingClientRect();
    nav.current.scrollLeft += linkBox.left - navBox.left - (navBox.width - linkBox.width) / 2;
  }, [path]);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>{config?.siteName ?? "Cloudflare Free"}</span>
        </Link>
        <nav className="nav" ref={nav}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={path === item.to ? "active" : undefined}>
              {item.label}
            </Link>
          ))}
          {user?.isAdmin && (
            <Link to="/admin" className={path === "/admin" ? "active" : undefined}>
              Admin
            </Link>
          )}
        </nav>
        <Link to="/account" className="account-link">
          {user ? user.displayName : "Sign in"}
        </Link>
      </header>
      <main className="content">
        <Page />
      </main>
      <footer className="footer">
        <span>Built only from Cloudflare's free tier.</span>
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
