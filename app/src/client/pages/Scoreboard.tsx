import { useState } from "react";
import { CATALOG, CATEGORIES, STATUS_LABELS, score, type Status } from "../../shared/catalog";
import { ScoreBar, StatusBadge } from "../components/ScoreBar";
import { Link } from "../router";

const FILTERS: (Status | "all")[] = ["all", "live", "setup", "card", "domain", "planned", "skipped"];

export function Scoreboard() {
  const [filter, setFilter] = useState<Status | "all">("all");
  const totals = score(CATALOG);
  const shown = CATALOG.filter((offering) => filter === "all" || offering.status === filter);

  return (
    <>
      <header className="page-header">
        <h1>Scoreboard</h1>
        <p className="lead">
          {totals.total} free Cloudflare offerings. {totals.built} have working code in this repo; {totals.byStatus.live} work
          the moment the Worker deploys, and the rest wait on the domain, a card on file or a one-time setup step.
        </p>
      </header>

      <section className="card">
        <ScoreBar score={totals} />
      </section>

      <div className="filters">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            className={status === filter ? "chip active" : "chip"}
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "All" : STATUS_LABELS[status]} ({status === "all" ? totals.total : totals.byStatus[status]})
          </button>
        ))}
      </div>

      {CATEGORIES.map((category) => {
        const offerings = shown.filter((offering) => offering.category === category);
        if (offerings.length === 0) return null;
        return (
          <section key={category}>
            <h2>{category}</h2>
            <ul className="offerings">
              {offerings.map((offering) => (
                <li key={offering.id} className="card offering">
                  <div className="offering-head">
                    <strong>{offering.name}</strong>
                    <StatusBadge status={offering.status} />
                  </div>
                  <p className="muted small">Free: {offering.free}</p>
                  <p>
                    {offering.use}
                    {offering.where && (
                      <>
                        {" "}
                        <Link to={offering.where}>See it</Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
