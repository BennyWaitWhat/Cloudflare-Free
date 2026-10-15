import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SiteProvider } from "./site";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SiteProvider>
      <App />
    </SiteProvider>
  </StrictMode>,
);

// The service worker makes the app installable and keeps the shell available offline.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker registration failed", error));
  });
}
