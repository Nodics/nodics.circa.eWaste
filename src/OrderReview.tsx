import { useState } from "react";
import { API, request, commandKey, type Session } from "./api";
import { ReviewDialog } from "./ReviewDialog";
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
export function OrderReview({
  code,
  session,
}: {
  code: string;
  session: Session;
}) {
  const [open, setOpen] = useState(false),
    [cases, setCases] = useState<Case[]>([]),
    [resolution, setResolution] = useState("DISPUTE"),
    [comment, setComment] = useState(""),
    [key, setKey] = useState(commandKey),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const data = await request<{ cases: Case[] }>(
      `${API}/purchases/${encodeURIComponent(code)}/reviews`,
      session,
    );
    setCases(data.cases);
  };
  return (
    <>
      <button
        className="text-button"
        onClick={async () => {
          setError("");
          setOpen(true);
          try {
            await load();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Review history unavailable",
            );
          }
        }}
      >
        Request order review
      </button>
      {open && (
        <ReviewDialog
          title="Order review"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            Request a cancellation, refund review or help with a disputed
            purchase. A moderator reviews the case. Submitting this request does
            not move points, change ownership or issue a refund.
          </p>
          {cases.map((item) => (
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
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            >
              <option value="DISPUTE">Purchase dispute</option>
              <option value="CANCELLATION">Cancellation review</option>
              <option value="REFUND">Refund review</option>
            </select>
          </label>
          <label>
            Reason
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              minLength={10}
              maxLength={2000}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || comment.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await request(
                  `${API}/purchases/${encodeURIComponent(code)}/reviews`,
                  session,
                  {
                    confirmed: true,
                    requestedResolution: resolution,
                    comment,
                    idempotencyKey: key,
                  },
                );
                setComment("");
                setKey(commandKey());
                await load();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Review could not be submitted",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Submitting…" : "Confirm review request"}
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
