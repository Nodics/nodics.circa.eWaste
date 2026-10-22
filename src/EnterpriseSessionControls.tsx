import { useEffect, useState } from "react";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { enterpriseMemberships, type EnterpriseMembership, type EnterpriseSession } from "./api";
import { ReviewDialog } from "./ReviewDialog";

/** Own-person accepted membership selections; no invitations, role grants or personal Customer switching. */
export function EnterpriseSessionControls({ session, onSwitch }: {
  session: EnterpriseSession; onSwitch: (membership: EnterpriseMembership) => void;
}) {
  const [choices, setChoices] = useState<EnterpriseMembership[]>([]), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [selected, setSelected] = useState("");
  const [review, setReview] = useState<EnterpriseMembership | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setChoices([]); setSelected(""); setReview(null);
    void enterpriseMemberships(session, controller.signal).then(rows => { if (!controller.signal.aborted) setChoices(rows); })
      .catch(() => { if (!controller.signal.aborted) setError("Enterprise memberships are unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session, revision]);
  return <section className="enterprise-switch" aria-label="Enterprise session">
    <dl><dt>Enterprise</dt><dd>{session.enterpriseCode}</dd><dt>Employee</dt><dd>{session.loginId}</dd></dl>
    <div className="enterprise-switch-actions">
      <label>Switch Enterprise<select value={selected} onChange={event => setSelected(event.target.value)} disabled={loading || !!review}>
        <option value="">{loading ? "Loading memberships..." : "Select accepted membership"}</option>
        {choices.map(choice => <option key={choice.code} value={choice.code}>{choice.enterpriseName} ({choice.enterpriseCode})</option>)}
      </select></label>
      <button className="secondary" disabled={!selected || loading || !!review} onClick={() => setReview(choices.find(row => row.code === selected) || null)}><ArrowRightLeft size={17} /> Switch</button>
      <button className="icon-button" title="Refresh memberships" aria-label="Refresh memberships" disabled={loading || !!review} onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && !choices.length && <p>No other accepted Enterprise memberships.</p>}
    {review && <ReviewDialog title="Switch Enterprise" onClose={() => setReview(null)}>
      <p>{session.enterpriseCode} <ArrowRightLeft size={16} aria-hidden="true" /> {review.enterpriseName} ({review.enterpriseCode})</p>
      <button className="primary" onClick={() => { const value = review; setReview(null); onSwitch(value); }}>Confirm switch</button>
    </ReviewDialog>}
  </section>;
}
