import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gift,
  Gavel,
  Plus,
  RefreshCw,
  Tag,
} from "lucide-react";
import { commandKey, type Session } from "../../api";
import { carbonLabel } from "../../holdingPresentation";
import {
  CertificatePicker,
  type CertificateSelection,
} from "../../CertificatePicker";
import { ParticipantSearch, type Participant } from "../../ParticipantSearch";
import { ReviewDialog } from "../../ReviewDialog";
import {
  pendingReferenceKey,
  readPendingReference,
  savePendingReference,
  clearPendingReference,
} from "../../pendingReferences";
import {
  carbonComponent,
  certificateComponent,
  createManifest,
  listingTerms,
  positive,
  readCarbonHoldings,
  sameOwner,
  submitIntent,
  validateOwner,
  recoverBundle,
  bundleReference,
  type BundleReference,
  type BundleOwner,
  type CarbonLot,
  type Intent,
  type ListingContext,
  type Manifest,
  type Outcome,
  type Page,
} from "./bundleClient";
import "./BundleComposer.css";

export type BundleComposerProps = {
  session: Session;
  ownerRef: BundleOwner;
  listingContext?: ListingContext;
  destinationName?: string;
  onComplete?: () => void;
  onLockedChange?: (locked: boolean) => void;
  initialCertificateCode?: string;
  initialMode?: "FIXED" | "AUCTION" | "GIFT";
};
type CarbonSelection = { lot: CarbonLot; quantity: string };
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The owner could not confirm this operation.";

/** Owner/session changes retire all private drafts and pending replies, without replaying a command. */
export function BundleComposer(props: BundleComposerProps) {
  try {
    validateOwner(props.ownerRef, props.session);
  } catch {
    return <p role="alert">Bundle owner is unavailable.</p>;
  }
  return (
    <Composer
      key={JSON.stringify([
        props.session.token,
        props.session.loginId,
        props.session.kind,
        props.session.enterpriseCode,
        props.ownerRef,
        props.listingContext,
        props.destinationName,
      ])}
      {...props}
    />
  );
}
function Composer({
  session,
  ownerRef,
  listingContext,
  destinationName,
  onComplete,
  onLockedChange,
  initialCertificateCode,
  initialMode,
}: BundleComposerProps) {
  const storageKey = pendingReferenceKey(session, "bundle-composer", {
    ownerType: ownerRef.schema.toUpperCase(),
    ownerCode: ownerRef.code,
  });
  const [retained] = useState(() => {
    try {
      return {
        value: readPendingReference(storageKey, bundleReference),
        error: "",
      };
    } catch (cause) {
      return { value: null, error: message(cause) };
    }
  });
  const [pendingReference, setPendingReference] =
    useState<BundleReference | null>(retained.value);
  const [canResume, setCanResume] = useState(false);
  const [certificates, setCertificates] = useState<CertificateSelection[]>([]);
  const [carbon, setCarbon] = useState<CarbonSelection[]>([]),
    [showCarbon, setShowCarbon] = useState(false);
  const [mode, setMode] = useState<"" | "FIXED" | "AUCTION" | "GIFT">(
    initialMode || "",
  );
  const [name, setName] = useState(""),
    [amount, setAmount] = useState("");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [recipient, setRecipient] = useState<Participant | null>(null);
  const [review, setReview] = useState<Intent | null>(null),
    [pending, setPending] = useState<Intent | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null),
    [error, setError] = useState(retained.error);
  const [busy, setBusy] = useState(false),
    [reset, setReset] = useState(0);
  const alive = useRef(true),
    inFlight = useRef(false),
    manifest = useRef<Manifest | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const locked =
    busy || !!review || !!pending || !!pendingReference || !!retained.error;
  useEffect(() => {
    onLockedChange?.(locked);
  }, [locked, onLockedChange]);
  function prepare() {
    try {
      if (!mode) throw new Error("Choose fixed price, auction or gift.");
      const components = [
        ...certificates.map(certificateComponent),
        ...carbon.map((row) => carbonComponent(row.lot, row.quantity)),
      ];
      if (!components.length)
        throw new Error(
          "Select at least one certificate or realized carbon holding.",
        );
      const base = {
        manifest: {
          ownerRef: { ...ownerRef },
          components,
          idempotencyKey: commandKey(),
        },
        operationKey: commandKey(),
      };
      let intent: Intent;
      if (mode === "GIFT") {
        if (
          !recipient ||
          !["CUSTOMER", "ENTERPRISE"].includes(recipient.ownerType) ||
          !recipient.ownerCode
        )
          throw new Error("Select an existing recipient.");
        const recipientRef: BundleOwner = {
          module: "profile",
          schema:
            recipient.ownerType === "CUSTOMER" ? "customer" : "enterprise",
          code: recipient.ownerCode,
        };
        if (sameOwner(recipientRef, ownerRef))
          throw new Error("Choose a different recipient.");
        intent = {
          ...base,
          mode,
          recipientRef,
          recipientName: recipient.displayName,
        };
      } else {
        if (!listingContext)
          throw new Error("Listing placement is unavailable.");
        intent = {
          ...base,
          mode,
          terms: listingTerms(listingContext, mode, name, amount, start, end),
        };
      }
      manifest.current = undefined;
      setError("");
      setReview(intent);
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function submit(original: Intent) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let completed = false;
    try {
      const reference = { manifestKey: original.manifest.idempotencyKey };
      savePendingReference(storageKey, reference, bundleReference);
      setPendingReference(reference);
      setPending(original);
      const saved =
        manifest.current ??
        (await createManifest(session, {
          ...original.manifest,
          composition:
            original.mode === "GIFT"
              ? {
                  mode: original.mode,
                  operationKey: original.operationKey,
                  recipientRef: original.recipientRef,
                }
              : {
                  mode: original.mode,
                  operationKey: original.operationKey,
                  terms: original.terms,
                },
        }));
      if (!alive.current) return;
      manifest.current = saved;
      const result = await submitIntent(session, original, saved);
      if (!alive.current) return;
      clearPendingReference(storageKey, reference, bundleReference);
      setOutcome(result);
      completed = true;
    } catch (cause) {
      if (alive.current) setError(message(cause));
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setBusy(false);
        setReview(null);
      }
    }
    if (completed && alive.current) onComplete?.();
  }
  async function recover(resume: boolean) {
    if (!pendingReference || inFlight.current || (resume && !canResume)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setCanResume(false);
    try {
      const result = await recoverBundle(
        session,
        ownerRef,
        pendingReference,
        resume,
      );
      if (!alive.current) return;
      if (result.outcome) {
        clearPendingReference(storageKey, pendingReference, bundleReference);
        setOutcome(result.outcome);
        onComplete?.();
      } else {
        setCanResume(result.canResume);
        setError("Bundle status: " + result.status + ".");
      }
    } catch (cause) {
      if (alive.current) setError(message(cause));
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function newBundle() {
    setCertificates([]);
    setCarbon([]);
    setRecipient(null);
    setMode("");
    setName("");
    setAmount("");
    setStart("");
    setEnd("");
    setReview(null);
    setPending(null);
    setPendingReference(null);
    setCanResume(false);
    setOutcome(null);
    setError("");
    manifest.current = undefined;
    setReset((value) => value + 1);
  }
  return (
    <section className="bundle-composer" aria-label="Create bundle">
      <header className="bundle-composer-heading">
        <h2>Create bundle</h2>
        <span>
          {ownerRef.schema === "enterprise" ? "Enterprise" : "Customer"}:{" "}
          {ownerRef.code}
        </span>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {outcome ? (
        <div role="status" className="bundle-composer-result">
          <Check size={24} aria-hidden="true" />
          <h3>
            {outcome.status === "PENDING"
              ? "Gift awaiting acceptance"
              : outcome.status === "COMPLETED"
                ? "Gift completed"
                : outcome.status === "RELEASED"
                  ? "Bundle operation closed"
                  : "Bundle published"}
          </h3>
          <p className="bundle-composer-reference">{outcome.code}</p>
          {outcome.deadline && (
            <p>
              Acceptance deadline:{" "}
              <time dateTime={outcome.deadline}>
                {new Date(outcome.deadline).toLocaleString()}
              </time>
            </p>
          )}
          {outcome.productCode && <p>Product: {outcome.productCode}</p>}
          {outcome.roundCode && <p>Auction: {outcome.roundCode}</p>}
          <button type="button" className="secondary" onClick={newBundle}>
            <Plus size={17} /> Create another bundle
          </button>
        </div>
      ) : pendingReference && !pending ? (
        <div className="bundle-composer-pending" role="status">
          <h3>Bundle confirmation pending</h3>
          <p className="bundle-composer-reference">
            {pendingReference.manifestKey}
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void recover(false)}
          >
            <RefreshCw size={17} /> Check original bundle
          </button>
          {canResume && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void recover(true)}
            >
              <ArrowRight size={17} /> Continue original bundle
            </button>
          )}
        </div>
      ) : pending ? (
        <div className="bundle-composer-pending">
          <h3>{busy ? "Confirming bundle..." : "Confirmation pending"}</h3>
          <Summary intent={pending} destinationName={destinationName} />
          <p className="bundle-composer-reference">
            Manifest command: {pending.manifest.idempotencyKey}
          </p>
          <p className="bundle-composer-reference">
            Operation command: {pending.operationKey}
          </p>
          {!busy && (
            <button
              type="button"
              className="secondary"
              onClick={() => void submit(pending)}
            >
              <RefreshCw size={17} /> Resume original command
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            prepare();
          }}
        >
          <CertificatePicker
            key={reset}
            session={session}
            value={certificates}
            onChange={setCertificates}
            disabled={locked}
            preferredCode={initialCertificateCode}
          />
          {!showCarbon ? (
            <button
              type="button"
              className="secondary"
              disabled={locked}
              onClick={() => setShowCarbon(true)}
            >
              <Plus size={17} /> Add carbon
            </button>
          ) : (
            <CarbonPicker
              key={reset}
              session={session}
              ownerRef={ownerRef}
              value={carbon}
              onChange={setCarbon}
              disabled={locked}
            />
          )}
          {carbon.length > 0 && (
            <ul className="bundle-composer-selected">
              {carbon.map((row) => (
                <li key={row.lot.lotCode}>
                  {carbonLabel(row.lot.lotCode)}:{" "}
                  {row.quantity || "No quantity"} {row.lot.unitOfMeasure}
                </li>
              ))}
            </ul>
          )}
          <fieldset disabled={locked}>
            <legend>Offer type</legend>
            <div
              className="bundle-composer-modes"
              role="group"
              aria-label="Offer type"
            >
              {(
                [
                  { value: "FIXED", label: "Fixed price", Icon: Tag },
                  { value: "AUCTION", label: "Auction", Icon: Gavel },
                  { value: "GIFT", label: "Gift", Icon: Gift },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={mode === option.value}
                  disabled={
                    locked || (option.value !== "GIFT" && !listingContext)
                  }
                  onClick={() => {
                    setMode(option.value);
                    setError("");
                  }}
                >
                  <option.Icon size={18} />
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          {!listingContext && (
            <p role="status">Listing placement is unavailable.</p>
          )}
          {(mode === "FIXED" || mode === "AUCTION") && (
            <fieldset disabled={locked} className="bundle-composer-fields">
              <legend>{mode === "AUCTION" ? "Auction" : "Fixed price"}</legend>
              <label>
                Bundle name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                {mode === "AUCTION" ? "Price (minimum bid)" : "Price"}
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p>{listingContext?.currency}</p>
              <div className="bundle-composer-dates">
                <label>
                  Starts at
                  <input
                    type="datetime-local"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label>
                  Ends at
                  <input
                    type="datetime-local"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
            </fieldset>
          )}
          {mode === "GIFT" && (
            <ParticipantSearch
              session={session}
              value={recipient}
              onChange={setRecipient}
              disabled={locked}
              exclude={{
                ownerType: ownerRef.schema.toUpperCase(),
                ownerCode: ownerRef.code,
              }}
            />
          )}
          <button
            type="submit"
            className="primary"
            disabled={
              locked || !mode || (!certificates.length && !carbon.length)
            }
          >
            <Check size={17} /> Review bundle
          </button>
        </form>
      )}
      {review && (
        <ReviewDialog
          title="Review bundle"
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <Summary intent={review} destinationName={destinationName} />
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void submit(review)}
          >
            {busy ? "Confirming..." : "Confirm bundle"}
          </button>
        </ReviewDialog>
      )}
    </section>
  );
}
function Summary({
  intent,
  destinationName,
}: {
  intent: Intent;
  destinationName?: string;
}) {
  return (
    <div className="bundle-composer-summary">
      <ul>
        {intent.manifest.components.map((component) => (
          <li key={JSON.stringify(component.reference)}>
            {component.kind === "CERTIFICATE"
              ? "Certificate"
              : "Realized carbon"}
            : {component.reference.code} / {component.quantity}
            {component.unitOfMeasure ? " " + component.unitOfMeasure : ""}
          </li>
        ))}
      </ul>
      {intent.mode === "GIFT" ? (
        <>
          <p>
            Recipient: {intent.recipientName} ({intent.recipientRef.schema}:{" "}
            {intent.recipientRef.code})
          </p>
          <p>Recipient acceptance required. Completed gifts are final.</p>
        </>
      ) : (
        <>
          <h3>{intent.terms.name}</h3>
          <p>
            {intent.mode === "FIXED" ? "Fixed price" : "Auction minimum bid"}:{" "}
            {intent.terms.amount} {intent.terms.currency}
          </p>
          {destinationName && <p>Destination: {destinationName}</p>}
          <p>
            Starts:{" "}
            {intent.terms.startsAt
              ? new Date(intent.terms.startsAt).toLocaleString()
              : "Immediately"}
          </p>
          <p>
            Ends:{" "}
            {intent.terms.endsAt
              ? new Date(intent.terms.endsAt).toLocaleString()
              : "No expiry"}
          </p>
          <p>
            Holdings are reserved on publication. Completed purchases are final.
          </p>
        </>
      )}
    </div>
  );
}
function CarbonPicker({
  session,
  ownerRef,
  value,
  onChange,
  disabled,
}: {
  session: Session;
  ownerRef: BundleOwner;
  value: CarbonSelection[];
  onChange: (value: CarbonSelection[]) => void;
  disabled: boolean;
}) {
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Page<CarbonLot> | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError("");
    readCarbonHoldings(session, ownerRef, page, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(message(cause));
      });
    return () => abort.abort();
  }, [session, ownerRef, page, refresh]);
  return (
    <fieldset disabled={disabled} className="bundle-composer-carbon">
      <legend>Carbon holdings</legend>
      <button
        type="button"
        className="icon-button"
        title="Refresh carbon holdings"
        aria-label="Refresh carbon holdings"
        onClick={() => {
          onChange([]);
          setRefresh((current) => current + 1);
        }}
      >
        <RefreshCw size={18} />
      </button>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Loading carbon holdings...</p>
      ) : !data.items.length ? (
        <p>No carbon holdings.</p>
      ) : null}
      {data?.items.map((lot) => {
        const selected = value.find((row) => row.lot.lotCode === lot.lotCode);
        const available = lot.state === "REALIZED" && positive(lot.available);
        return (
          <div className="bundle-composer-lot" key={lot.lotCode}>
            <label className="bundle-composer-lot-choice">
              <input
                type="checkbox"
                aria-label={"Select carbon " + lot.lotCode}
                checked={!!selected}
                disabled={disabled || !available}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [
                          ...value.filter(
                            (row) => row.lot.lotCode !== lot.lotCode,
                          ),
                          { lot, quantity: "" },
                        ]
                      : value.filter((row) => row.lot.lotCode !== lot.lotCode),
                  )
                }
              />
              <span>
                {carbonLabel(lot.lotCode)}
                <small>
                  {lot.state === "REALIZED" ? "Realized" : "Prospective"} /{" "}
                  {lot.available} {lot.unitOfMeasure} available
                  {lot.synthetic ? " / Synthetic record" : ""}
                </small>
              </span>
            </label>
            <details>
              <summary>Holding reference</summary>
              <code>{lot.lotCode}</code>
            </details>
            {selected && (
              <label>
                Quantity · {carbonLabel(lot.lotCode)}
                <input
                  inputMode="decimal"
                  aria-label={"Quantity " + lot.lotCode}
                  value={selected.quantity}
                  onChange={(event) =>
                    onChange(
                      value.map((row) =>
                        row.lot.lotCode === lot.lotCode
                          ? { ...row, quantity: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
            )}
          </div>
        );
      })}
      {data && (
        <nav aria-label="Carbon pages" className="bundle-composer-pages">
          <button
            type="button"
            className="icon-button"
            title="Previous carbon page"
            aria-label="Previous carbon page"
            disabled={disabled || page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ArrowLeft size={18} />
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            className="icon-button"
            title="Next carbon page"
            aria-label="Next carbon page"
            disabled={disabled || page * data.limit >= data.total}
            onClick={() => setPage((current) => current + 1)}
          >
            <ArrowRight size={18} />
          </button>
        </nav>
      )}
    </fieldset>
  );
}
