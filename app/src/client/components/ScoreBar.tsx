import { STATUS_LABELS, type Score, type Status } from "../../shared/catalog";

const ORDER: Status[] = ["live", "setup", "card", "domain", "planned", "skipped"];

/** Stacked bar of the catalog by status. */
export function ScoreBar({ score }: { score: Score }) {
  return (
    <div
      className="scorebar"
      role="img"
      aria-label={`${score.withCode} of ${score.total} offerings run on code here, ${score.settings} more are settings`}
    >
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

/** Marks an offering that is only a dashboard setting or always on. */
export function SettingBadge() {
  return (
    <span className="badge" title="Switched on in the dashboard or always on; no code or config in this repo">
      Setting
    </span>
  );
}
