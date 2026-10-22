import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Send } from "lucide-react";
import { commandKey, request, type Session } from "./api";
import {
  ParticipantSearch,
  type Participant as Recipient,
} from "./ParticipantSearch";
import {
  pendingReferenceKey,
  readPendingReference,
  savePendingReference,
  clearPendingReference,
} from "./pendingReferences";
import "./RewardTransfer.css";

const LOYALTY = "/nodics/loyaltyApi/v0";
type Balance = {
  programCode: string;
  rewardTypeCode: string;
  name: string;
  precision: number;
  available: string;
  transferEligible: boolean;
  transferFeeAmount: string;
};
type Projection = {
  owner: { ownerType: string; ownerCode: string };
  balances: Balance[];
};
type Receipt = { status: string; operationCode: string; amount?: string };
type Intent = {
  recipient: Recipient;
  programCode: string;
  rewardTypeCode: string;
  amount: string;
  confirmedFeeAmount: string;
  confirmed: true;
  idempotencyKey: string;
};
type TransferReference = { operationKey: string };
const transferReference = (value: unknown): value is TransferReference =>
  !!value &&
  typeof value === "object" &&
  Object.keys(value).join(",") === "operationKey" &&
  typeof (value as TransferReference).operationKey === "string" &&
  !!(value as TransferReference).operationKey;

/** Keeps reward transfers separate from bundle gifts and delegates eligibility and settlement to Loyalty. */
export function RewardTransfer({
  session,
  onComplete,
}: {
  session: Session;
  onComplete?: () => void;
}) {
  return (
    <TransferForm
      key={JSON.stringify([
        session.token,
        session.kind,
        session.loginId,
        session.enterpriseCode,
      ])}
      session={session}
      onComplete={onComplete}
    />
  );
}

function TransferForm({
  session,
  onComplete,
}: {
  session: Session;
  onComplete?: () => void;
}) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [selectedBalance, setSelectedBalance] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null),
    [amount, setAmount] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [pendingReference, setPendingReference] =
    useState<TransferReference | null>(null);
  const [storageError, setStorageError] = useState(false);
  const storageKey = useRef("");
  const active = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setProjection(null);
    setError("");
    request<Projection>(
      `${LOYALTY}/participant/wallet`,
      session,
      undefined,
      "GET",
      { signal: abort.signal },
    )
      .then((value) => {
        if (abort.signal.aborted) return;
        if (
          !value.owner?.ownerCode ||
          value.owner.ownerType !==
            (session.kind === "ENTERPRISE" ? "ENTERPRISE" : "CUSTOMER") ||
          (session.kind === "ENTERPRISE" &&
            value.owner.ownerCode !== session.enterpriseCode)
        )
          throw new Error("Wallet owner could not be confirmed.");
        storageKey.current = pendingReferenceKey(
          session,
          "reward-transfer",
          value.owner,
        );
        try {
          const saved = readPendingReference(
            storageKey.current,
            transferReference,
          );
          setPendingReference(saved);
          setAttempted(!!saved);
          setStorageError(false);
        } catch (cause) {
          setStorageError(true);
          throw cause;
        }
        setProjection(value);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Wallet unavailable.",
          );
      });
    return () => abort.abort();
  }, [session, revision]);
  const balances =
    projection?.balances.filter((value) => value.transferEligible) || [];
  const balance = balances.find(
    (value) =>
      JSON.stringify([value.programCode, value.rewardTypeCode]) ===
      selectedBalance,
  );
  const message = (cause: unknown) =>
    cause instanceof Error
      ? cause.message
      : "The operation could not be confirmed.";
  async function settle(reconcile: boolean) {
    const original =
      pendingReference ??
      (intent ? { operationKey: intent.idempotencyKey } : null);
    if (
      !original ||
      (!reconcile && !intent) ||
      inFlight.current ||
      storageError
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!reconcile) {
        savePendingReference(storageKey.current, original, transferReference);
        setPendingReference(original);
        setAttempted(true);
      }
      const result = await request<Receipt>(
        reconcile
          ? `${LOYALTY}/participant/reward-transfers/${encodeURIComponent(original.operationKey)}`
          : `${LOYALTY}/participant/reward-transfers`,
        session,
        reconcile ? undefined : intent,
        reconcile ? "GET" : "POST",
      );
      if (!active.current) return;
      if (
        result.status !== "COMPLETED" ||
        typeof result.operationCode !== "string" ||
        !result.operationCode
      ) {
        setError(
          "This transfer is not yet confirmed. Keep this reference and check again: " +
            original.operationKey,
        );
        return;
      }
      clearPendingReference(storageKey.current, original, transferReference);
      setReceipt(result);
      onComplete?.();
    } catch (cause) {
      if (active.current) setError(message(cause));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section
      className="reward-transfer"
      aria-labelledby="reward-transfer-heading"
    >
      <h2 id="reward-transfer-heading">Send rewards</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {receipt ? (
        <div role="status">
          <h3>Transfer complete</h3>
          {intent && (
            <p>
              {intent.amount} sent to {intent.recipient.displayName}.
            </p>
          )}
          <p className="transfer-reference">{receipt.operationCode}</p>
          <button
            className="secondary"
            onClick={() => {
              setReceipt(null);
              setIntent(null);
              setPendingReference(null);
              setAttempted(false);
              setRecipient(null);
              setAmount("");
              setSelectedBalance("");
              setRevision((value) => value + 1);
            }}
          >
            New transfer
          </button>
        </div>
      ) : pendingReference && !intent ? (
        <div role="status">
          <p>Transfer confirmation pending.</p>
          <p className="transfer-reference">{pendingReference.operationKey}</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void settle(true)}
          >
            <RefreshCw size={17} /> Check transfer
          </button>
        </div>
      ) : intent ? (
        <div>
          <dl className="transfer-summary">
            <dt>Recipient</dt>
            <dd>
              {intent.recipient.displayName}{" "}
              <small>{intent.recipient.ownerCode}</small>
            </dd>
            <dt>Rewards</dt>
            <dd>
              {intent.amount} {intent.rewardTypeCode}
            </dd>
            <dt>Fee</dt>
            <dd>{intent.confirmedFeeAmount}</dd>
          </dl>
          <p>Completed transfers are final.</p>
          {attempted && (
            <p className="transfer-reference">
              Reference: {intent.idempotencyKey}
            </p>
          )}
          <div className="transfer-actions">
            {!attempted && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setIntent(null)}
              >
                <ArrowLeft size={17} /> Back
              </button>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void settle(attempted)}
            >
              {attempted ? <RefreshCw size={17} /> : <Send size={17} />}
              {busy
                ? "Checking..."
                : attempted
                  ? "Check transfer"
                  : "Confirm transfer"}
            </button>
          </div>
        </div>
      ) : !projection ? (
        <>
          {!error && <p role="status">Loading available rewards...</p>}
          {error && (
            <button
              className="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={17} /> Retry
            </button>
          )}
        </>
      ) : !balances.length ? (
        <p>No transferable rewards are available.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!balance || !recipient) return;
            const pattern = balance.precision
              ? new RegExp(`^\\d+(\\.\\d{1,${balance.precision}})?$`)
              : /^\d+$/;
            if (!pattern.test(amount) || !/[1-9]/.test(amount)) {
              setError(
                "Enter a positive amount using the displayed reward precision.",
              );
              return;
            }
            setError("");
            setAttempted(false);
            setIntent({
              recipient,
              programCode: balance.programCode,
              rewardTypeCode: balance.rewardTypeCode,
              amount,
              confirmedFeeAmount: balance.transferFeeAmount,
              confirmed: true,
              idempotencyKey: commandKey(),
            });
          }}
        >
          <label>
            Reward balance
            <select
              required
              value={selectedBalance}
              onChange={(event) => setSelectedBalance(event.target.value)}
            >
              <option value="">Select rewards</option>
              {balances.map((value) => (
                <option
                  key={JSON.stringify([
                    value.programCode,
                    value.rewardTypeCode,
                  ])}
                  value={JSON.stringify([
                    value.programCode,
                    value.rewardTypeCode,
                  ])}
                >
                  {value.name} ({value.programCode}) - {value.available}{" "}
                  available
                </option>
              ))}
            </select>
          </label>
          <ParticipantSearch
            session={session}
            exclude={projection.owner}
            value={recipient}
            onChange={setRecipient}
            disabled={busy}
          />
          <label>
            Amount
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          {balance && (
            <p>
              Available: {balance.available}. Fee: {balance.transferFeeAmount}.
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !recipient || !balance || !amount}
          >
            <Send size={17} /> Review transfer
          </button>
        </form>
      )}
    </section>
  );
}
