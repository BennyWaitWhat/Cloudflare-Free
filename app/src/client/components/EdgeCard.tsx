import { useEffect, useState } from "react";
import { api } from "../api";

interface Trace {
  colo: string | null;
  city: string | null;
  country: string | null;
  httpProtocol: string | null;
  tlsVersion: string | null;
  asOrganization: string | null;
}

/** Shows which Cloudflare data center served this visit, from the request's `cf` object. */
export function EdgeCard() {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<Trace>("/api/tools/trace")
      .then(setTrace)
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="card">
      <h2 className="h3">Your edge</h2>
      {failed && <p className="muted">Couldn't reach the Worker.</p>}
      {!trace && !failed && <p className="muted">Asking the edge…</p>}
      {trace && (
        <p>
          Served by the <strong>{trace.colo ?? "local"}</strong> data center
          {trace.city ? ` near ${trace.city}` : ""}
          {trace.country ? `, ${trace.country}` : ""}, over {trace.httpProtocol ?? "HTTP"}
          {trace.tlsVersion ? ` with ${trace.tlsVersion}` : ""}
          {trace.asOrganization ? `. Your network: ${trace.asOrganization}.` : "."}
        </p>
      )}
    </section>
  );
}
