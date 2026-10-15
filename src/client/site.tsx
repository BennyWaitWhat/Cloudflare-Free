import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SessionUser, SiteConfig } from "../shared/types";
import { api } from "./api";

interface SiteState {
  config: SiteConfig | null;
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
}

const SiteContext = createContext<SiteState>({ config: null, user: null, setUser: () => undefined });

const FALLBACK: SiteConfig = { siteName: "Cloudflare Free", turnstileSiteKey: "", webAnalyticsToken: "", user: null };

export function SiteProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    api<SiteConfig>("/api/config")
      .then((loaded) => {
        setConfig(loaded);
        setUser(loaded.user);
        loadWebAnalytics(loaded.webAnalyticsToken);
      })
      .catch(() => setConfig(FALLBACK));
  }, []);

  return <SiteContext.Provider value={{ config, user, setUser }}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteState {
  return useContext(SiteContext);
}

/** Cloudflare Web Analytics: cookieless, added only when a token is configured. */
function loadWebAnalytics(token: string) {
  if (!token || document.querySelector("script[data-cf-beacon]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.dataset.cfBeacon = JSON.stringify({ token });
  document.head.appendChild(script);
}
