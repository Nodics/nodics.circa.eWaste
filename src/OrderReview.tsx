/** Customer order-review consumer; Commerce owns review, refund and idempotency decisions. */
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { API, request, commandKey, type Session } from "./api";
import { ReviewDialog } from "./ReviewDialog";
import "./purchaseReview.css";
type Case = {
  code: string;
  status: string;
  requestedResolution: string;
  decision?: { reason: string };
  refund?: {
    amount: string;
    currency: string;
    message: string;
    refundCode: string;
  };
};
type ReviewRequest = {
  confirmed: true;
  requestedResolution: string;
  comment: string;
  idempotencyKey: string;
};
/** Validates history before rendering or enabling another reviewed command. */
function reviewCases(value: unknown, orderCode: string): Case[] {
  const rows = (value as { cases?: unknown } | null)?.cases;
  if (
    !Array.isArray(rows) ||
    rows.length > 100 ||
    rows.some(
      (item) =>
        !item ||
        item.orderCode !== orderCode ||
        typeof item.code !== "string" ||
        item.code.length > 192 ||
        typeof item.status !== "string" ||
        item.status.length > 64 ||
        !["DISPUTE", "CANCELLATION", "REFUND"].includes(
          item.requestedResolution,
        ) ||
        (item.decision &&
          (typeof item.decision.reason !== "string" ||
            item.decision.reason.length > 4000)) ||
        (item.refund &&
          ["amount", "currency", "message", "refundCode"].some(
            (key) =>
              typeof item.refund[key] !== "string" ||
              item.refund[key].length > 4000,
          )),
    )
  )
    throw new Error("Review history unavailable.");
  return rows.map((item) => ({
    code: item.code,
    status: item.status,
    requestedResolution: item.requestedResolution,
    ...(item.decision ? { decision: { reason: item.decision.reason } } : {}),
    ...(item.refund
      ? {
          refund: {
            amount: item.refund.amount,
            currency: item.refund.currency,
            message: item.refund.message,
            refundCode: item.refund.refundCode,
          },
        }
      : {}),
  }));
}
/** Sends commands once and preserves the same reviewed request after an uncertain acknowledgement. */
export function OrderReview({
  code,
  session,
}: {
  code: string;
  session: Session;
}) {
  const [open, setOpen] = useState(false),
    [snapshot, setSnapshot] = useState<{
      session: Session;
      code: string;
      cases: Case[];
    }>(),
    [resolution, setResolution] = useState("DISPUTE"),
    [comment, setComment] = useState(""),
    [key, setKey] = useState(commandKey),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState<ReviewRequest>();
  const generation = useRef(0),
    inFlight = useRef(false),
    controller = useRef<AbortController | undefined>(undefined);
  const cases =
    snapshot?.session === session && snapshot.code === code
      ? snapshot.cases
      : undefined;
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    inFlight.current = false;
    setOpen(false);
    setSnapshot(undefined);
    setUncertain(undefined);
    setComment("");
    setResolution("DISPUTE");
    setKey(commandKey());
    setBusy(false);
    setError("");
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [session, code]);
  /** Reads one order's case history and rejects stale-context completion. */
  const load = async (attempt: number) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const data = reviewCases(
      await request<unknown>(
        `${API}/purchases/${encodeURIComponent(code)}/reviews`,
        session,
        undefined,
        "GET",
        { signal: abort.signal },
      ),
      code,
    );
    if (attempt === generation.current)
      setSnapshot({ session, code, cases: data });
  };
  /** Explicit inspection never replays a concern or changes its recovery identity. */
  const inspect = async () => {
    if (inFlight.current) return;
    const attempt = generation.current;
    inFlight.current = true;
    setOpen(true);
    setBusy(true);
    setError("");
    setSnapshot(undefined);
    try {
      await load(attempt);
    } catch (cause) {
      if (attempt === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Review history unavailable.",
        );
    } finally {
      if (attempt === generation.current) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  };
  /** Preserves the original command on uncertainty; a confirmed case still requires fresh history. */
  const submit = async () => {
    if (inFlight.current || !cases) return;
    const attempt = generation.current;
    const input: ReviewRequest = uncertain || {
      confirmed: true,
      requestedResolution: resolution,
      comment,
      idempotencyKey: key,
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    let acknowledged = false;
    try {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const outcome = await request<unknown>(
        `${API}/purchases/${encodeURIComponent(code)}/reviews`,
        session,
        input,
        "POST",
        { signal: abort.signal },
      );
      reviewCases({ cases: [outcome] }, code);
      if (
        !outcome ||
        typeof outcome !== "object" ||
        (outcome as { requestedResolution?: unknown }).requestedResolution !==
          input.requestedResolution ||
        (outcome as { comment?: unknown }).comment !== input.comment.trim()
      )
        throw new Error("The recorded review request could not be confirmed.");
      if (attempt !== generation.current) return;
      acknowledged = true;
      setUncertain(undefined);
      setComment("");
      setKey(commandKey());
      setSnapshot(undefined);
      await load(attempt);
    } catch {
      if (attempt !== generation.current) return;
      if (!acknowledged) setUncertain(input);
      setSnapshot(undefined);
      setError(
        acknowledged
          ? "The request was recorded, but review history could not be refreshed. Inspect history before another request."
          : "The request outcome is unconfirmed. Inspect review history before explicitly resuming this same request.",
      );
    } finally {
      if (attempt === generation.current) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  };
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void inspect()}
      >
        Request order review
      </button>
      {open && (
        <ReviewDialog
          title="Order review"
          className="order-review-dialog"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            Request a cancellation, refund review or help with a disputed
            purchase. A moderator reviews the case. Submitting this request does
            not move points, change ownership or issue a refund.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void inspect()}
          >
            <RefreshCw size={16} aria-hidden="true" /> Inspect review history
          </button>
          {busy && <p role="status">Working…</p>}
          {cases?.length === 0 && (
            <p>No review requests are recorded for this purchase.</p>
          )}
          {cases?.map((item) => (
            <p key={item.code}>
              {item.requestedResolution}: <strong>{item.status}</strong> ·{" "}
              {item.code}
              {item.decision && <> · {item.decision.reason}</>}
              {item.refund && (
                <>
                  {" "}
                  · {item.refund.amount} {item.refund.currency}:{" "}
                  {item.refund.message} Reference: {item.refund.refundCode}
                </>
              )}
            </p>
          ))}
          <label>
            Request type
            <select
              disabled={busy || !!uncertain}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            >
              <option value="DISPUTE">Purchase dispute</option>
              <option value="CANCELLATION">Cancellation review</option>
              <option value="REFUND">Refund review</option>
            </select>
          </label>
          <label>
            Reason
            <textarea
              disabled={busy || !!uncertain}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              minLength={10}
              maxLength={2000}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {uncertain && (
            <p role="status">
              The original request and reference are retained for this session.
              Resuming uses the same request reference and does not request a
              new refund.
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !cases || comment.trim().length < 10}
            onClick={() => void submit()}
          >
            {busy
              ? "Working…"
              : uncertain
                ? "Resume same review request"
                : "Confirm review request"}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </ReviewDialog>
      )}
    </>
  );
}
