import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { commandKey, request, type Session } from "./api";
import { ReviewDialog } from "./ReviewDialog";
import { pendingReferenceKey, readPendingReference, savePendingReference, clearPendingReference } from "./pendingReferences";
import "./RewardTransfer.css";

type Owner = { ownerType: "CUSTOMER" | "ENTERPRISE"; ownerCode: string };
type Route = {
  integrationCode: string;
  partnerEnterpriseCode: string;
  accountLinkCode: string;
  programCode: string;
  rewardTypeCode: string;
  sourceScale: number;
  termsReference: string;
  termsRevision: string;
};
type Choices = {
  enabled: boolean;
  owner: Owner;
  walletCode: string | null;
  options: Route[];
};
type Quote = Route & {
  owner: Owner;
  conversionCode: string;
  walletCode: string;
  status: string;
  sourceAmount: string;
  targetAmount: string;
  targetScale: number;
  targetUnit: string;
  quoteExpiresAt: string;
};
type QuoteIntent = {
  integrationCode: string; accountLinkCode: string; walletCode: string;
  programCode: string; rewardTypeCode: string; amount: string; idempotencyKey: string;
};
type ConversionReference = { conversionCode: string };
type ConfirmationReference = ConversionReference & { attempted: true };
const base = "/nodics/loyaltyApi/v0/participant/partner-conversions/";
const decimal = /^(0|[1-9]\d*)(\.\d+)?$/;
const terminal = (status: string) => ["COMPLETED", "REJECTED", "EXPIRED"].includes(status);
/** Only original public command selectors are retained, never credentials, external account details or quoted rates. */
function intentValid(value: unknown): value is QuoteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const keys = ["integrationCode", "accountLinkCode", "walletCode", "programCode", "rewardTypeCode", "amount", "idempotencyKey"];
  return Object.keys(row).length === keys.length && keys.every(key => typeof row[key] === "string" &&
    (key === "amount" ? decimal.test(row[key] as string) : /^[A-Za-z0-9][A-Za-z0-9_.:@|\-]{0,191}$/.test(row[key] as string)));
}
function referenceValid(value: unknown): value is ConversionReference {
  return !!value && typeof value === "object" && Object.keys(value).join() === "conversionCode" &&
    typeof (value as ConversionReference).conversionCode === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:@|\-]{0,191}$/.test((value as ConversionReference).conversionCode);
}
function confirmationValid(value: unknown): value is ConfirmationReference {
  if (!value || typeof value !== "object" || Object.keys(value).sort().join() !== "attempted,conversionCode") return false;
  const row = value as ConfirmationReference;
  return row.attempted === true && referenceValid({ conversionCode: row.conversionCode });
}
const states = [
  "QUOTED",
  "HOLDING",
  "HELD",
  "SUBMITTED",
  "CREDIT_CONFIRMED",
  "NO_CREDIT_CONFIRMED",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
];
const exact = (value: string) =>
  value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
function sameOwner(value: Owner, session: Session) {
  return (
    !!value &&
    !!value.ownerCode &&
    value.ownerType ===
      (session.kind === "ENTERPRISE" ? "ENTERPRISE" : "CUSTOMER") &&
    (session.kind !== "ENTERPRISE" ||
      value.ownerCode === session.enterpriseCode)
  );
}
function routeValid(row: Route) {
  return (
    row &&
    [
      row.integrationCode,
      row.partnerEnterpriseCode,
      row.accountLinkCode,
      row.programCode,
      row.rewardTypeCode,
      row.termsReference,
      row.termsRevision,
    ].every((v) => typeof v === "string" && !!v) &&
    Number.isSafeInteger(row.sourceScale) &&
    row.sourceScale >= 0
  );
}

/** Thin participant consumer: rates, eligibility, accounting and external reconciliation remain with Loyalty. */
export function PartnerRewardConversion(props: {
  session: Session;
  onComplete?: () => void;
}) {
  return (
    <Conversion
      key={JSON.stringify([props.session.token, props.session.loginId, props.session.kind, props.session.enterpriseCode])}
      {...props}
    />
  );
}
function Conversion({
  session,
  onComplete,
}: {
  session: Session;
  onComplete?: () => void;
}) {
  const [choices, setChoices] = useState<Choices>(),
    [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(""),
    [reference, setReference] = useState("");
  const [quote, setQuote] = useState<Quote>(),
    [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [confirmedQuoted, setConfirmedQuoted] = useState(false);
  const [restoring, setRestoring] = useState(true),
    [pendingIntent, setPendingIntent] = useState<QuoteIntent | null>(null),
    [pendingCode, setPendingCode] = useState<string | null>(null);
  const storage = useRef<{ intent: string; reference: string; confirmation: string } | null>(null);
  const hints = useRef<{ intent: QuoteIntent | null; reference: ConversionReference | null; confirmation: ConfirmationReference | null }>(
    { intent: null, reference: null, confirmation: null });
  const active = useRef(true),
    completed = useRef(new Set<string>());
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    request<Choices>(base + "options", session, {}, "POST", {
      signal: abort.signal,
    })
      .then(async (value) => {
        if (abort.signal.aborted) return;
        if (
          typeof value.enabled !== "boolean" ||
          !sameOwner(value.owner, session) ||
          !Array.isArray(value.options) ||
          value.options.some((row) => !routeValid(row)) ||
          (value.options.length > 0 && (!value.enabled || !value.walletCode))
        )
          throw new Error("Partner choices could not be confirmed.");
        setChoices(value);
        const key = (scope: string) => pendingReferenceKey(session, "partner-reward-conversion", value.owner, scope);
        storage.current = { intent: key("quote"), reference: key("conversion"), confirmation: key("confirmation") };
        const retained = readPendingReference(storage.current.intent, intentValid);
        const original = readPendingReference(storage.current.reference, referenceValid);
        const confirmation = readPendingReference(storage.current.confirmation, confirmationValid);
        if (confirmation && confirmation.conversionCode !== original?.conversionCode)
          throw new Error("The original confirmation reference is incomplete. Check the original conversion before continuing.");
        hints.current = { intent: retained, reference: original, confirmation };
        setPendingIntent(retained); setPendingCode(original?.conversionCode || null);
        setAttempted(!!confirmation);
        if (original || retained) {
          setBusy(true);
          try {
            if (original) {
              setReference(original.conversionCode);
              const result = await request<Quote>(base + "status", session, original);
              if (abort.signal.aborted) return;
              const restored = checked(result, undefined, value);
              if (restored.conversionCode !== original.conversionCode) throw new Error("The original conversion reference does not match.");
              if (retained) checkIntent(restored, retained);
              receive(restored);
            } else if (retained) {
              const result = await request<Quote>(base + "quote", session, retained);
              if (abort.signal.aborted) return;
              const restored = checked(result, undefined, value);
              checkIntent(restored, retained); receive(restored);
            }
          } finally { if (!abort.signal.aborted) setBusy(false); }
        }
        if (!abort.signal.aborted) setRestoring(false);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Partner rewards unavailable.",
          );
      });
    return () => {
      active.current = false;
      abort.abort();
    };
  }, [session]);
  function checked(value: Quote, original?: Quote, ownerChoices = choices) {
    if (
      !routeValid(value) ||
      !sameOwner(value.owner, session) ||
      !value.conversionCode ||
      !value.walletCode ||
      !states.includes(value.status) ||
      !decimal.test(value.sourceAmount) ||
      !decimal.test(value.targetAmount) ||
      !Number.isSafeInteger(value.targetScale) ||
      value.targetScale < 0 ||
      !value.targetUnit ||
      !Number.isFinite(Date.parse(value.quoteExpiresAt)) ||
      (ownerChoices &&
        (value.owner.ownerType !== ownerChoices.owner.ownerType ||
          value.owner.ownerCode !== ownerChoices.owner.ownerCode)) ||
      (original &&
        [
          "conversionCode",
          "walletCode",
          "integrationCode",
          "partnerEnterpriseCode",
          "accountLinkCode",
          "programCode",
          "rewardTypeCode",
          "sourceAmount",
          "sourceScale",
          "targetAmount",
          "targetScale",
          "targetUnit",
          "termsReference",
          "termsRevision",
          "quoteExpiresAt",
        ].some(
          (key) => value[key as keyof Quote] !== original[key as keyof Quote],
        ))
    )
      throw new Error("The original conversion could not be confirmed.");
    return value;
  }
  /** A recovered quote must still describe the exact original command, never the currently edited form. */
  function checkIntent(value: Quote, intent: QuoteIntent) {
    if (["integrationCode", "accountLinkCode", "walletCode", "programCode", "rewardTypeCode"].some(
      key => value[key as keyof Quote] !== intent[key as keyof QuoteIntent]) || exact(value.sourceAmount) !== exact(intent.amount))
      throw new Error("The quote does not match the selected rewards.");
  }
  /** Resolution clears only these exact hints; a changed hint or storage failure keeps the form blocked. */
  function clearHints() {
    const keys = storage.current;
    if (!keys) throw new Error("The original conversion owner is unavailable.");
    const expected = hints.current;
    if (JSON.stringify(readPendingReference(keys.intent, intentValid)) !== JSON.stringify(expected.intent) ||
      JSON.stringify(readPendingReference(keys.reference, referenceValid)) !== JSON.stringify(expected.reference) ||
      JSON.stringify(readPendingReference(keys.confirmation, confirmationValid)) !== JSON.stringify(expected.confirmation))
      throw new Error("The original operation reference changed. Check its status before continuing.");
    if (expected.confirmation) { clearPendingReference(keys.confirmation, expected.confirmation, confirmationValid); hints.current.confirmation = null; }
    if (expected.intent) { clearPendingReference(keys.intent, expected.intent, intentValid); hints.current.intent = null; }
    if (expected.reference) { clearPendingReference(keys.reference, expected.reference, referenceValid); hints.current.reference = null; }
    setPendingIntent(null); setPendingCode(null);
  }
  function receive(value: Quote) {
    if (!storage.current) throw new Error("The original conversion owner is unavailable.");
    savePendingReference(storage.current.reference, { conversionCode: value.conversionCode }, referenceValid);
    hints.current.reference = { conversionCode: value.conversionCode };
    setPendingCode(value.conversionCode);
    setQuote(value);
    setReference(value.conversionCode);
    setOpen(true);
    setAttempted(!!hints.current.confirmation || value.status !== "QUOTED");
    setConfirmedQuoted(value.status === "QUOTED");
    setRestoring(false);
    if (terminal(value.status)) clearHints();
    if (
      value.status === "COMPLETED" &&
      !completed.current.has(value.conversionCode)
    ) {
      completed.current.add(value.conversionCode);
      onComplete?.();
    }
  }
  async function prepare() {
    const route = choices?.options[Number(selected)];
    if (
      busy ||
      restoring || pendingIntent || pendingCode ||
      selected === "" ||
      !route ||
      !choices?.walletCode ||
      !decimal.test(amount) ||
      exact(amount) === "0"
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!storage.current) throw new Error("The original conversion owner is unavailable.");
      const intent: QuoteIntent = { integrationCode: route.integrationCode, accountLinkCode: route.accountLinkCode,
        walletCode: choices.walletCode, programCode: route.programCode, rewardTypeCode: route.rewardTypeCode,
        amount, idempotencyKey: commandKey() };
      savePendingReference(storage.current.intent, intent, intentValid);
      hints.current.intent = intent;
      setPendingIntent(intent);
      const value = checked(
        await request<Quote>(base + "quote", session, intent),
      );
      if (!active.current) return;
      if (
        value.status !== "QUOTED" ||
        value.walletCode !== choices.walletCode ||
        [
          "integrationCode",
          "accountLinkCode",
          "programCode",
          "rewardTypeCode",
          "sourceScale",
        ].some(
          (key) => value[key as keyof Quote] !== route[key as keyof Route],
        ) ||
        exact(value.sourceAmount) !== exact(amount)
      )
        throw new Error("The quote does not match the selected rewards.");
      receive(value);
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : "Quote unavailable.");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  /** Retries only the retained quote command; quoting itself cannot move value or confirm a conversion. */
  async function recoverQuote() {
    if (busy || !pendingIntent) return;
    setBusy(true); setError("");
    try {
      const result = await request<Quote>(base + "quote", session, pendingIntent);
      if (!active.current) return;
      const value = checked(result); checkIntent(value, pendingIntent); receive(value);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "Original quote unavailable.");
    } finally { if (active.current) setBusy(false); }
  }
  async function operate(confirm: boolean) {
    const code = pendingCode || quote?.conversionCode || reference.trim();
    if (
      !code ||
      busy ||
      (confirm && (!quote || quote.status !== "QUOTED" || attempted && !confirmedQuoted))
    )
      return;
    setBusy(true);
    setError("");
    if (confirm) { setAttempted(true); setConfirmedQuoted(false); }
    try {
      if (!storage.current) throw new Error("The original conversion owner is unavailable.");
      savePendingReference(storage.current.reference, { conversionCode: code }, referenceValid);
      hints.current.reference = { conversionCode: code };
      setPendingCode(code);
      if (confirm) {
        savePendingReference(storage.current.confirmation, { conversionCode: code, attempted: true }, confirmationValid);
        hints.current.confirmation = { conversionCode: code, attempted: true };
      }
      const value = checked(
        await request<Quote>(base + (confirm ? "confirm" : "status"), session, {
          conversionCode: code,
        }),
        quote,
      );
      if (!active.current) return;
      if (value.conversionCode !== code)
        throw new Error("The original conversion reference does not match.");
      if (pendingIntent) checkIntent(value, pendingIntent);
      receive(value);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Conversion outcome unavailable.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="reward-transfer">
      <h2>Partner rewards</h2>
      {error && !open && <p role="alert">{error}</p>}
      {!choices && !error && <p role="status">Loading partner rewards...</p>}
      {choices && (!choices.enabled || !choices.options.length) && (
        <p>No eligible partner accounts are available.</p>
      )}
      {!!choices?.options.length && !quote && !restoring && !pendingIntent && !pendingCode && (
        <>
          <label>
            Partner account
            <select
              value={selected}
              disabled={busy}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Select an account</option>
              {choices.options.map((row, index) => (
                <option
                  key={JSON.stringify([
                    row.integrationCode,
                    row.accountLinkCode,
                    row.programCode,
                    row.rewardTypeCode,
                  ])}
                  value={index}
                >
                  {row.partnerEnterpriseCode} / {row.accountLinkCode} /{" "}
                  {row.rewardTypeCode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rewards
            <input
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={
              busy ||
              selected === "" ||
              !decimal.test(amount) ||
              exact(amount) === "0"
            }
            onClick={() => void prepare()}
          >
            Review conversion <ArrowRight size={17} />
          </button>
        </>
      )}
      {!quote && pendingIntent && !pendingCode && <button className="secondary" disabled={busy} onClick={() => void recoverQuote()}>
        <RefreshCw size={17} /> Recover original quote
      </button>}
      {!quote && (
        <div>
          <label>
            Conversion reference
            <input
              value={reference}
              disabled={busy || !!pendingCode}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || (!pendingCode && !reference.trim())}
            onClick={() => void operate(false)}
          >
            <RefreshCw size={17} />
            Check conversion
          </button>
        </div>
      )}
      {quote && !open && (
        <button className="secondary" onClick={() => setOpen(true)}>
          View conversion
        </button>
      )}
      {quote && open && (
        <ReviewDialog
          title="Partner reward conversion"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <dl className="transfer-summary">
            <dt>Partner</dt>
            <dd>{quote.partnerEnterpriseCode}</dd>
            <dt>Account</dt>
            <dd>{quote.accountLinkCode}</dd>
            <dt>Rewards to spend</dt>
            <dd>
              {quote.sourceAmount} {quote.rewardTypeCode}
            </dd>
            <dt>Partner rewards</dt>
            <dd>
              {quote.targetAmount} {quote.targetUnit}
            </dd>
            <dt>Terms</dt>
            <dd>
              {quote.termsReference} / {quote.termsRevision}
            </dd>
            <dt>Quote valid until</dt>
            <dd>{new Date(quote.quoteExpiresAt).toLocaleString()}</dd>
            <dt>Status</dt>
            <dd>{quote.status}</dd>
            <dt>Reference</dt>
            <dd>{quote.conversionCode}</dd>
          </dl>
          {error && <p role="alert">{error}</p>}
          {quote.status === "QUOTED" && (!attempted || confirmedQuoted) ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void operate(true)}
            >
              {attempted ? "Confirm original conversion" : "Confirm conversion"}
            </button>
          ) : (
            !terminal(quote.status) && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void operate(false)}
              >
                <RefreshCw size={17} />
                Check conversion
              </button>
            )
          )}
          {((quote.status === "QUOTED" && !attempted) || terminal(quote.status)) && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                try {
                  clearHints(); setOpen(false); setQuote(undefined); setAttempted(false); setReference("");
                } catch (cause) { setError(cause instanceof Error ? cause.message : "Original reference could not be cleared."); }
              }}
            >
              Close conversion
            </button>
          )}
        </ReviewDialog>
      )}
    </section>
  );
}
