import { useState } from "react";
import {
  request,
  type ImpactAssessmentHistory as History,
  type Session,
} from "../../api";
import { EnvironmentalImpactCard } from "./EnvironmentalImpactCard";

/** Reads saved provider assessments without recalculating or accepting them in the customer UI. */
export function ImpactAssessmentHistory({
  initial,
  endpoint,
  code,
  session,
}: {
  initial: History;
  endpoint: string;
  code: string;
  session: Session;
}) {
  const [history, setHistory] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const page = async (value: number) => {
    setBusy(true);
    setError("");
    try {
      const data = await request<{ impactHistory: History }>(
        `${endpoint}/account/items/${encodeURIComponent(code)}?view=assets&assessmentPage=${value}`,
        session,
      );
      setHistory(data.impactHistory);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Assessment history unavailable",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="environment-card" aria-label="Assessment history">
      <h3>Assessment history ({history.total})</h3>
      <p>
        Previous calculations are preserved. The accepted assessment determines
        the current environmental view.
      </p>
      {history.items.map((item) => (
        <details key={item.code} className="environment-details">
          <summary>
            {item.assessment?.methodology.isMock
              ? "Unvalidated calculation"
              : item.assessment?.methodology.providerCode ||
                "Assessment unavailable"}{" "}
            ·{" "}
            {item.calculatedAt
              ? new Date(item.calculatedAt).toLocaleDateString()
              : "Date unavailable"}{" "}
            · {item.accepted ? "Accepted" : "Not selected"}
          </summary>
          <EnvironmentalImpactCard assessment={item.assessment || undefined} />
        </details>
      ))}
      {error && <p role="alert">{error}</p>}
      <div className="environment-history-pages">
        <button
          disabled={busy || history.page <= 1}
          onClick={() => void page(history.page - 1)}
        >
          Previous
        </button>
        <span>Page {history.page}</span>
        <button
          disabled={busy || history.page * history.limit >= history.total}
          onClick={() => void page(history.page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
