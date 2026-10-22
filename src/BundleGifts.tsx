import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  RefreshCw,
  X,
} from "lucide-react";
import { request, type Session } from "./api";
import { ReviewDialog } from "./ReviewDialog";
import {
  pendingReferenceKey,
  readPendingReference,
  savePendingReference,
  clearPendingReference,
} from "./pendingReferences";
import "./BundleGifts.css";

export type BundleOwner = {
  module: "profile";
  schema: "customer" | "enterprise";
  code: string;
};
type Action = "ACCEPT" | "DECLINE" | "CANCEL";
type GiftRow = {
  code: string;
  revision: number;
  status: string;
  decision: Action | "EXPIRE" | null;
  ownerRef: BundleOwner;
  recipientRef: BundleOwner;
  deadline: string | null;
  recoveryRequired: boolean;
  components: {
    kind: string;
    reference: { code: string };
    quantity: string;
    unitOfMeasure?: string;
  }[];
  allowedActions: Action[];
};
type Page = {
  contractVersion: number;
  ownerRef: BundleOwner;
  direction: "SENT" | "RECEIVED";
  items: GiftRow[];
  page: number;
  pageSize: number;
  total: number;
};
type Props = {
  session: Session;
  ownerRef: BundleOwner;
  onComplete?: () => void;
};
const DIGITAL = "/nodics/digitalCore/v0";
const labels: Record<Action, string> = {
  ACCEPT: "Accept gift",
  DECLINE: "Decline gift",
  CANCEL: "Cancel gift",
};
type GiftReference = { operationCode: string };
const giftReference = (value: unknown): value is GiftReference =>
  !!value &&
  typeof value === "object" &&
  Object.keys(value).join(",") === "operationCode" &&
  typeof (value as GiftReference).operationCode === "string" &&
  !!(value as GiftReference).operationCode;
type GiftStatus = {
  contractVersion: number;
  ownerRef: BundleOwner;
  operationCode: string;
  status: string;
  revision: number;
  decision: Action | "EXPIRE" | null;
  canResume: boolean;
};

/** Shows Digital-owned gift decisions; uncertain results are inspected, never replaced by a new command. */
export function BundleGifts(props: Props) {
  return (
    <GiftList
      key={JSON.stringify([
        props.session.token,
        props.session.loginId,
        props.session.kind,
        props.session.enterpriseCode,
        props.ownerRef,
      ])}
      {...props}
    />
  );
}
function GiftList({ session, ownerRef, onComplete }: Props) {
  const storageKey = pendingReferenceKey(session, "gift-decision", {
    ownerType: ownerRef.schema.toUpperCase(),
    ownerCode: ownerRef.code,
  });
  const [retained] = useState(() => {
    try {
      return {
        value: readPendingReference(storageKey, giftReference),
        error: "",
      };
    } catch (cause) {
      return {
        value: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Original gift reference unavailable.",
      };
    }
  });
  const [direction, setDirection] = useState<"SENT" | "RECEIVED">("RECEIVED"),
    [page, setPage] = useState(1);
  const [rows, setRows] = useState<Page | null>(null),
    [error, setError] = useState(retained.error);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [review, setReview] = useState<{
    gift: GiftRow;
    action: Action;
  } | null>(null);
  const [pending, setPending] = useState<GiftReference | null>(retained.value);
  const [observed, setObserved] = useState<GiftStatus | null>(null);
  const alive = useRef(true),
    dispatched = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setRows(null);
    request<Page>(
      `${DIGITAL}/gifts/query`,
      session,
      { ownerRef, direction, page },
      "POST",
      { signal: abort.signal },
    )
      .then((result) => {
        if (abort.signal.aborted) return;
        if (
          result.contractVersion !== 1 ||
          result.ownerRef?.module !== ownerRef.module ||
          result.ownerRef.schema !== ownerRef.schema ||
          result.ownerRef.code !== ownerRef.code ||
          result.direction !== direction ||
          !Array.isArray(result.items) ||
          !Number.isSafeInteger(result.total)
        )
          throw new Error("Gift list could not be confirmed.");
        setRows(result);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Gifts unavailable.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [session, ownerRef, direction, page, reload]);
  async function decide() {
    if (!review || dispatched.current || retained.error) return;
    const original = review;
    dispatched.current = true;
    setBusy(true);
    setError("");
    const reference = { operationCode: original.gift.code };
    try {
      savePendingReference(storageKey, reference, giftReference);
      setPending(reference);
      const receipt = await request<{
        code: string;
        status: string;
        evidence?: { decision?: Action };
      }>(`${DIGITAL}/gifts/decision`, session, {
        operationCode: original.gift.code,
        expectedRevision: original.gift.revision,
        decision: original.action,
        confirmed: true,
      });
      if (!alive.current) return;
      if (
        receipt.code !== original.gift.code ||
        receipt.status !==
          (original.action === "ACCEPT" ? "COMPLETED" : "RELEASED") ||
        receipt.evidence?.decision !== original.action
      )
        throw new Error(
          "Gift decision is not confirmed. Check its original reference.",
        );
      clearPendingReference(storageKey, reference, giftReference);
      setReview(null);
      setPending(null);
      dispatched.current = false;
      setReload((value) => value + 1);
      onComplete?.();
    } catch (cause) {
      if (alive.current) {
        setReview(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Gift decision is not confirmed.",
        );
      }
    } finally {
      dispatched.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function checkGift(resume = false) {
    if (!pending || dispatched.current || (resume && !observed?.canResume))
      return;
    dispatched.current = true;
    setBusy(true);
    setError("");
    try {
      if (resume) {
        if (
          !observed ||
          !["ACCEPT", "DECLINE", "CANCEL"].includes(String(observed.decision))
        )
          throw new Error("Original gift decision is unavailable.");
        await request(`${DIGITAL}/gifts/decision`, session, {
          operationCode: pending.operationCode,
          expectedRevision: observed.revision,
          decision: observed.decision,
          confirmed: true,
        });
        if (!alive.current) return;
      }
      const result = await request<GiftStatus>(
        `${DIGITAL}/gifts/inspect`,
        session,
        { ownerRef, operationCode: pending.operationCode },
      );
      if (!alive.current) return;
      if (
        result.contractVersion !== 1 ||
        result.operationCode !== pending.operationCode ||
        result.ownerRef?.module !== ownerRef.module ||
        result.ownerRef.schema !== ownerRef.schema ||
        result.ownerRef.code !== ownerRef.code ||
        !Number.isSafeInteger(result.revision) ||
        result.revision < 0 ||
        typeof result.canResume !== "boolean" ||
        ![
          "PENDING",
          "RESERVING",
          "TRANSFERRING",
          "TRANSFERRED",
          "RELEASING",
          "RELEASED",
          "COMPLETED",
        ].includes(result.status) ||
        ![null, "ACCEPT", "DECLINE", "CANCEL", "EXPIRE"].includes(
          result.decision,
        )
      )
        throw new Error("Original gift status could not be confirmed.");
      if (["COMPLETED", "RELEASED"].includes(result.status)) {
        if (
          result.canResume ||
          (result.status === "COMPLETED" && result.decision !== "ACCEPT") ||
          (result.status === "RELEASED" &&
            !["DECLINE", "CANCEL", "EXPIRE"].includes(String(result.decision)))
        )
          throw new Error("Original gift resolution could not be confirmed.");
        clearPendingReference(storageKey, pending, giftReference);
      }
      setObserved(result);
    } catch (cause) {
      if (alive.current) {
        setObserved(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Gift decision is not confirmed.",
        );
      }
    } finally {
      dispatched.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const confirmed =
    observed && ["COMPLETED", "RELEASED"].includes(observed.status);
  return (
    <section className="bundle-gifts" aria-label="Bundle gifts">
      <div className="gift-heading">
        <h1>Gifts</h1>
        <button
          className="icon-button"
          title="Refresh gifts"
          aria-label="Refresh gifts"
          disabled={busy || loading}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      <div role="tablist" aria-label="Gift direction" className="gift-tabs">
        {(["RECEIVED", "SENT"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={direction === value}
            disabled={busy || !!pending}
            onClick={() => {
              setDirection(value);
              setPage(1);
              setReview(null);
            }}
          >
            {value === "RECEIVED" ? "Received" : "Sent"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {pending && (
        <div role="status">
          <p>
            {confirmed
              ? "Gift decision confirmed."
              : "Gift decision awaiting confirmation."}
          </p>
          <p className="gift-reference">{pending.operationCode}</p>
          {confirmed ? (
            <button
              className="secondary"
              onClick={() => {
                setPending(null);
                setObserved(null);
                dispatched.current = false;
                setReload((value) => value + 1);
                onComplete?.();
              }}
            >
              Done
            </button>
          ) : (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void checkGift()}
              >
                <RefreshCw size={17} /> Check gift
              </button>
              {observed?.canResume && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void checkGift(true)}
                >
                  <RefreshCw size={17} /> Continue gift decision
                </button>
              )}
            </>
          )}
        </div>
      )}
      {loading ? (
        <p role="status">Loading gifts...</p>
      ) : rows && !rows.items.length ? (
        <p>No {direction.toLowerCase()} gifts.</p>
      ) : null}
      <ul className="gift-list">
        {rows?.items.map((gift) => (
          <li key={gift.code}>
            <Gift size={23} aria-hidden="true" />
            <div className="gift-body">
              <h2>
                {gift.components.length}{" "}
                {gift.components.length === 1 ? "holding" : "holdings"}
              </h2>
              <p>
                {direction === "RECEIVED"
                  ? "From " + gift.ownerRef.code
                  : "To " + gift.recipientRef.code}
              </p>
              <ul>
                {gift.components.map((component, i) => (
                  <li key={i}>
                    {component.kind === "CERTIFICATE"
                      ? "Certificate"
                      : "Realized carbon"}
                    : {component.reference.code}
                    {component.kind !== "CERTIFICATE" &&
                      ` - ${component.quantity} ${component.unitOfMeasure || ""}`}
                  </li>
                ))}
              </ul>
              <p>
                {gift.status.replaceAll("_", " ")}
                {gift.deadline
                  ? " / " + new Date(gift.deadline).toLocaleString()
                  : ""}
              </p>
              {gift.recoveryRequired && <p>Transfer reconciliation pending.</p>}
              <div className="gift-actions">
                {gift.allowedActions.map((action) => (
                  <button
                    key={action}
                    className={action === "ACCEPT" ? "primary" : "secondary"}
                    disabled={busy || !!pending || !!retained.error}
                    onClick={() => setReview({ gift, action })}
                  >
                    {action === "ACCEPT" ? (
                      <Check size={17} />
                    ) : (
                      <X size={17} />
                    )}
                    {labels[action]}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rows && (
        <nav className="gift-pagination" aria-label="Gift pages">
          <button
            className="icon-button"
            title="Previous page"
            aria-label="Previous page"
            disabled={page <= 1 || busy || !!pending}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>Page {page}</span>
          <button
            className="icon-button"
            title="Next page"
            aria-label="Next page"
            disabled={page * rows.pageSize >= rows.total || busy || !!pending}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      )}
      {review && (
        <ReviewDialog
          title={labels[review.action]}
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <p>
            {review.gift.components.length}{" "}
            {review.gift.components.length === 1 ? "holding" : "holdings"}
          </p>
          {review.action === "ACCEPT" && <p>Completed gifts are final.</p>}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void decide()}
          >
            {busy ? "Confirming..." : "Confirm"}
          </button>
        </ReviewDialog>
      )}
    </section>
  );
}
