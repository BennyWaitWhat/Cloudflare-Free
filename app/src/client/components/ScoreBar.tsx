import { STATUS_LABELS, type Score, type Status } from "../../shared/catalog";

const ORDER: Status[] = ["live", "setup", "card", "domain", "planned", "skipped"];

/** Stacked bar of the catalog by status. */
export function ScoreBar({ score }: { score: Score }) {
  return (
    <div className="scorebar" role="img" aria-label={`${score.built} of ${score.total} offerings built`}>
      <div className="scorebar-track">
        {ORDER.map((status) =>
          score.byStatus[status] > 0 ? (
            <span
              key={status}
              className={`scorebar-part status-${status}`}
              style={{ flexGrow: score.byStatus[status] }}
              title={`${STATUS_LABELS[status]}: ${score.byStatus[status]}`}
            />
          ) : null,
        )}
      </div>
      <ul className="legend">
        {ORDER.map((status) => (
          <li key={status}>
            <span className={`dot status-${status}`} /> {STATUS_LABELS[status]} {score.byStatus[status]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}
