import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { request, type Session } from "./api";
import { carbonLabel } from "./holdingPresentation";
import "./CarbonHoldings.css";

const CARBON = "/nodics/wasteCarbon/v0/carbon/holdings";
const MATERIAL = "/nodics/wasteReward/v0/waste/material-value/allocations";

type SourceRef = { module: string; schema: string; code: string };
type OwnerRef = SourceRef & {
  module: "profile";
  schema: "customer" | "enterprise";
};
type Page<T> = {
  ownerRef: OwnerRef;
  items: T[];
  total: number;
  page: number;
  limit: number;
};
type Lot = {
  lotCode: string;
  revision: number;
  unitOfMeasure: string;
  scale: number;
  synthetic: boolean;
  issuanceRef: SourceRef;
  programRef: SourceRef;
  state: "PROSPECTIVE" | "REALIZED";
  total: string;
  totalSpendable: false;
  prospective: string;
  realized: string;
  reserved: string;
  available: string;
  eligibility: "NOT_CHECKED";
  transferable: null;
  allocationRefs: {
    allocationRef: SourceRef;
    contributionRef?: SourceRef;
    quantity: string;
  }[];
  acquisitionRefs: {
    operationKey: string;
    manifestRef: SourceRef;
    quantity: string;
    status: "TRANSFERRED" | "COMPLETED";
    destinationHold: "HELD" | "RELEASED";
    finalizedAt: string | null;
  }[];
};
type Allocation = {
  code: string;
  contributionRef: SourceRef;
  receiptRef: SourceRef;
  attributedValue: string;
  beneficiaryValue: string;
  rewardAmount: string;
  status: "AWAITING_PAYMENT" | "CREDIT_PENDING" | "COMPLETED";
  spendableHere: false;
  paymentStatus: "NOT_CONFIRMED" | "CONFIRMED";
  paymentRef: SourceRef | null;
  ledgerRef: SourceRef | null;
  completedAt: string | null;
};
type Material = {
  batchCode: string;
  sourceLabel: "Material value";
  currency: string;
  currencyScale: number;
  rewardScale: number;
  synthetic: boolean;
  valuationRef: SourceRef;
  policyRef: { code: string; version: string };
  programCode: string;
  rewardTypeCode: string;
  allocations: Allocation[];
};

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 500;
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const scale = (value: unknown): value is number => integer(value);
const decimal = (value: unknown, precision: number): value is string =>
  typeof value === "string" &&
  value.length <= 110 &&
  /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) &&
  (value.split(".")[1] || "").length <= precision;
const reference = (value: unknown): value is SourceRef =>
  record(value) &&
  ["module", "schema", "code"].every((key) => text(value[key]));

/** Validates display evidence only; the browser neither calculates nor certifies holdings. */
function isLot(value: unknown): value is Lot {
  if (
    !record(value) ||
    !text(value.lotCode) ||
    !integer(value.revision) ||
    !text(value.unitOfMeasure) ||
    !scale(value.scale) ||
    typeof value.synthetic !== "boolean" ||
    !reference(value.issuanceRef) ||
    !reference(value.programRef) ||
    !["PROSPECTIVE", "REALIZED"].includes(String(value.state)) ||
    value.totalSpendable !== false ||
    value.eligibility !== "NOT_CHECKED" ||
    value.transferable !== null
  )
    return false;
  const precision = value.scale;
  return (
    ["total", "prospective", "realized", "reserved", "available"].every((key) =>
      decimal(value[key], precision),
    ) &&
    Array.isArray(value.allocationRefs) &&
    value.allocationRefs.every(
      (row) =>
        record(row) &&
        reference(row.allocationRef) &&
        (row.contributionRef === undefined || reference(row.contributionRef)) &&
        decimal(row.quantity, precision),
    ) &&
    Array.isArray(value.acquisitionRefs) &&
    value.acquisitionRefs.every(
      (row) =>
        record(row) &&
        text(row.operationKey) &&
        reference(row.manifestRef) &&
        decimal(row.quantity, precision) &&
        (row.status === "TRANSFERRED"
          ? row.destinationHold === "HELD" && row.finalizedAt === null
          : row.status === "COMPLETED" &&
            row.destinationHold === "RELEASED" &&
            typeof row.finalizedAt === "string" &&
            Number.isFinite(Date.parse(row.finalizedAt))),
    )
  );
}

/** Requires explicit payment and credit states; malformed evidence never becomes a reward balance. */
function isMaterial(value: unknown): value is Material {
  if (
    !record(value) ||
    !text(value.batchCode) ||
    value.sourceLabel !== "Material value" ||
    !text(value.currency) ||
    !scale(value.currencyScale) ||
    !scale(value.rewardScale) ||
    typeof value.synthetic !== "boolean" ||
    !reference(value.valuationRef) ||
    !record(value.policyRef) ||
    !text(value.policyRef.code) ||
    !text(value.policyRef.version) ||
    !text(value.programCode) ||
    !text(value.rewardTypeCode) ||
    !Array.isArray(value.allocations)
  )
    return false;
  const currencyScale = value.currencyScale,
    rewardScale = value.rewardScale;
  return value.allocations.every(
    (row) =>
      record(row) &&
      text(row.code) &&
      reference(row.contributionRef) &&
      reference(row.receiptRef) &&
      decimal(row.attributedValue, currencyScale) &&
      decimal(row.beneficiaryValue, currencyScale) &&
      decimal(row.rewardAmount, rewardScale) &&
      row.spendableHere === false &&
      ["AWAITING_PAYMENT", "CREDIT_PENDING", "COMPLETED"].includes(
        String(row.status),
      ) &&
      (row.completedAt === null ||
        (typeof row.completedAt === "string" &&
          Number.isFinite(Date.parse(row.completedAt)))) &&
      (row.status === "AWAITING_PAYMENT"
        ? row.paymentStatus === "NOT_CONFIRMED" &&
          row.paymentRef === null &&
          row.ledgerRef === null &&
          row.completedAt === null
        : row.paymentStatus === "CONFIRMED" &&
          reference(row.paymentRef) &&
          (row.status === "COMPLETED"
            ? reference(row.ledgerRef) && row.completedAt !== null
            : row.ledgerRef === null && row.completedAt === null)),
  );
}

function pageOf<T>(
  value: unknown,
  page: number,
  validate: (item: unknown) => item is T,
  identity: (item: T) => string,
): Page<T> {
  if (
    !record(value) ||
    !reference(value.ownerRef) ||
    value.ownerRef.module !== "profile" ||
    !["customer", "enterprise"].includes(value.ownerRef.schema) ||
    !integer(value.total) ||
    value.page !== page ||
    !integer(value.limit) ||
    value.limit < 1 ||
    value.limit > 100000 ||
    !Array.isArray(value.items) ||
    value.items.length > value.limit ||
    value.items.length > value.total ||
    !value.items.every(validate)
  )
    throw new Error("Owner projection is incomplete");
  if (new Set(value.items.map(identity)).size !== value.items.length)
    throw new Error("Owner projection contains duplicate identities");
  return value as Page<T>;
}
const carbonPage = (value: unknown, page: number) =>
  pageOf(value, page, isLot, (row) => row.lotCode);
const materialPage = (value: unknown, page: number) => {
  if (!record(value) || value.source !== "PERSISTED_ASSESSMENTS")
    throw new Error("Unknown material source");
  return pageOf(value, page, isMaterial, (row) => row.batchCode);
};
const sessionKey = (session: Session) =>
  JSON.stringify([
    session.token,
    session.loginId,
    session.kind,
    session.enterpriseCode,
  ]);

/** Aborts obsolete reads and keeps data keyed to the session, page and explicit refresh generation. */
function useOwnerPage<T>(
  session: Session,
  path: string,
  parse: (value: unknown, page: number) => Page<T>,
) {
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const key = JSON.stringify([sessionKey(session), path, page, revision]);
  const [result, setResult] = useState<{
    key: string;
    data?: Page<T>;
    failed?: boolean;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    request<unknown>(path, session, { page }, "POST", { signal: abort.signal })
      .then((value) => {
        if (abort.signal.aborted) return;
        const data = parse(value, page);
        if (
          session.kind === "ENTERPRISE"
            ? data.ownerRef.schema !== "enterprise" ||
              data.ownerRef.code !== session.enterpriseCode
            : data.ownerRef.schema !== "customer"
        )
          throw new Error("Owner projection scope mismatch");
        setResult({ key, data });
      })
      .catch(() => {
        if (!abort.signal.aborted) setResult({ key, failed: true });
      });
    return () => abort.abort();
  }, [key, path, parse]); // key includes every session and read selector.
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    failed: current?.failed === true,
    loading: !current,
    page,
    refresh: () => setRevision((value) => value + 1),
    previous: () => setPage((value) => Math.max(1, value - 1)),
    next: () => setPage((value) => value + 1),
  };
}

function Ref({ value }: { value: SourceRef }) {
  return (
    <span className="carbon-holdings-reference">
      {value.module}/{value.schema}/{value.code}
    </span>
  );
}

function PageControls({
  page,
  total,
  limit,
  previous,
  next,
  label,
}: {
  page: number;
  total: number;
  limit: number;
  previous: () => void;
  next: () => void;
  label: string;
}) {
  if (total <= limit && page === 1) return null;
  return (
    <nav className="carbon-holdings-pages" aria-label={label}>
      <button
        type="button"
        onClick={previous}
        disabled={page <= 1}
        aria-label={"Previous " + label}
        title={"Previous " + label}
      >
        <ArrowLeft size={18} />
      </button>
      <span>
        Page {page} of {Math.max(1, Math.ceil(total / limit))}
      </span>
      <button
        type="button"
        onClick={next}
        disabled={page * limit >= total}
        aria-label={"Next " + label}
        title={"Next " + label}
      >
        <ArrowRight size={18} />
      </button>
    </nav>
  );
}

/** Standalone session-bound read surface. No wallet/reward data or inferred owner selectors enter this component. */
export function CarbonHoldings({ session }: { session: Session }) {
  return (
    <div className="carbon-holdings" key={sessionKey(session)}>
      <CarbonLots session={session} />
      <MaterialEntitlements session={session} />
    </div>
  );
}

function CarbonLots({ session }: { session: Session }) {
  const view = useOwnerPage(session, CARBON, carbonPage),
    heading = useId();
  return (
    <section
      className="carbon-holdings-section"
      aria-labelledby={heading}
      aria-busy={view.loading}
    >
      <header>
        <h2 id={heading}>Carbon holdings</h2>
        <button
          type="button"
          onClick={view.refresh}
          disabled={view.loading}
          aria-label={
            view.failed ? "Retry carbon holdings" : "Refresh carbon holdings"
          }
          title={
            view.failed ? "Retry carbon holdings" : "Refresh carbon holdings"
          }
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {view.loading && <p role="status">Loading carbon holdings...</p>}
      {view.failed && <p role="alert">Carbon holdings could not be loaded.</p>}
      {view.data && (
        <>
          <p className="carbon-holdings-owner">
            {view.data.ownerRef.schema === "enterprise"
              ? "Enterprise"
              : "Customer"}
            : {view.data.ownerRef.code}
          </p>
          {!view.data.items.length && <p>No carbon holdings recorded.</p>}
          {view.data.items.map((lot) => (
            <article className="carbon-holdings-lot" key={lot.lotCode}>
              <header>
                <h3>{carbonLabel(lot.lotCode)}</h3>
                <span className="carbon-holdings-state">
                  {lot.state === "REALIZED" ? "Realized" : "Prospective"}
                </span>
              </header>
              <details>
                <summary>Holding reference</summary>
                <code>{lot.lotCode}</code>
              </details>
              {lot.synthetic && (
                <p className="carbon-holdings-synthetic">Synthetic record</p>
              )}
              <dl className="carbon-holdings-amounts">
                {(
                  [
                    ["Prospective", lot.prospective],
                    ["Realized", lot.realized],
                    ["Available (unreserved)", lot.available],
                    ["Reserved", lot.reserved],
                    ["Total (not spendable)", lot.total],
                  ] as const
                ).map(([label, quantity]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {quantity} <small>{lot.unitOfMeasure}</small>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="carbon-holdings-muted">Eligibility not checked</p>
              <details>
                <summary>Provenance</summary>
                <dl className="carbon-holdings-evidence">
                  <dt>Issuance</dt>
                  <dd>
                    <Ref value={lot.issuanceRef} />
                  </dd>
                  <dt>Program</dt>
                  <dd>
                    <Ref value={lot.programRef} />
                  </dd>
                  <dt>Record revision</dt>
                  <dd>{lot.revision}</dd>
                </dl>
                {lot.allocationRefs.map((row, index) => (
                  <div className="carbon-holdings-source" key={index}>
                    <strong>
                      Allocation: {row.quantity} {lot.unitOfMeasure}
                    </strong>
                    <Ref value={row.allocationRef} />
                    {row.contributionRef && (
                      <p>
                        Original contribution:{" "}
                        <Ref value={row.contributionRef} />
                      </p>
                    )}
                  </div>
                ))}
                {lot.acquisitionRefs.map((row) => (
                  <div
                    className="carbon-holdings-source"
                    key={row.operationKey}
                  >
                    <strong>
                      Acquired: {row.quantity} {lot.unitOfMeasure}
                    </strong>
                    <p>
                      {row.destinationHold === "HELD"
                        ? "Held for bundle completion"
                        : "Bundle transfer finalized"}
                    </p>
                    <Ref value={row.manifestRef} />
                    <span className="carbon-holdings-reference">
                      {row.operationKey}
                    </span>
                  </div>
                ))}
              </details>
            </article>
          ))}
          <PageControls
            {...view.data}
            previous={view.previous}
            next={view.next}
            label="carbon pages"
          />
        </>
      )}
    </section>
  );
}

/** Displays attributed monetary entitlement independently of Loyalty's spendable wallet and participation rewards. */
export function MaterialEntitlements({ session }: { session: Session }) {
  return <MaterialValues key={sessionKey(session)} session={session} />;
}

function MaterialValues({ session }: { session: Session }) {
  const view = useOwnerPage(session, MATERIAL, materialPage),
    heading = useId();
  const labels = {
    AWAITING_PAYMENT: "Awaiting recycler payment",
    CREDIT_PENDING: "Credit reconciliation pending",
    COMPLETED: "Credited in Loyalty",
  };
  return (
    <section
      className="carbon-holdings-section material-entitlements"
      aria-labelledby={heading}
      aria-busy={view.loading}
    >
      <header>
        <h2 id={heading}>Material value entitlements</h2>
        <button
          type="button"
          onClick={view.refresh}
          disabled={view.loading}
          aria-label={
            view.failed
              ? "Retry material entitlements"
              : "Refresh material entitlements"
          }
          title={
            view.failed
              ? "Retry material entitlements"
              : "Refresh material entitlements"
          }
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {view.loading && <p role="status">Loading material entitlements...</p>}
      {view.failed && (
        <p role="alert">Material entitlements could not be loaded.</p>
      )}
      {view.data && (
        <>
          <p className="carbon-holdings-owner">
            {view.data.ownerRef.schema === "enterprise"
              ? "Original Enterprise contributor"
              : "Original customer contributor"}
            : {view.data.ownerRef.code}
          </p>
          {!view.data.items.length && (
            <p>No material value entitlements recorded.</p>
          )}
          {view.data.items.map((batch) => (
            <div key={batch.batchCode}>
              {batch.allocations.map((allocation) => (
                <article className="carbon-holdings-lot" key={allocation.code}>
                  <header>
                    <h3>{allocation.contributionRef.code}</h3>
                    <span className="carbon-holdings-state">
                      {labels[allocation.status]}
                    </span>
                  </header>
                  {batch.synthetic && (
                    <p className="carbon-holdings-synthetic">
                      Synthetic record
                    </p>
                  )}
                  <dl className="carbon-holdings-amounts">
                    <div>
                      <dt>Attributed material value</dt>
                      <dd>
                        {allocation.attributedValue}{" "}
                        <small>{batch.currency}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Contributor entitlement</dt>
                      <dd>
                        {allocation.beneficiaryValue}{" "}
                        <small>{batch.currency}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Calculated rewards (not a balance)</dt>
                      <dd>
                        {allocation.rewardAmount}{" "}
                        <small>{batch.rewardTypeCode}</small>
                      </dd>
                    </div>
                  </dl>
                  <p className="carbon-holdings-muted">
                    {allocation.paymentStatus === "CONFIRMED"
                      ? "Recycler payment confirmed"
                      : "Recycler payment not confirmed"}
                  </p>
                  <details>
                    <summary>Allocation evidence</summary>
                    <dl className="carbon-holdings-evidence">
                      <dt>Original contribution</dt>
                      <dd>
                        <Ref value={allocation.contributionRef} />
                      </dd>
                      <dt>Physical receipt</dt>
                      <dd>
                        <Ref value={allocation.receiptRef} />
                      </dd>
                      <dt>Valuation</dt>
                      <dd>
                        <Ref value={batch.valuationRef} />
                      </dd>
                      <dt>Policy</dt>
                      <dd>
                        {batch.policyRef.code} / {batch.policyRef.version}
                      </dd>
                      <dt>Reward program</dt>
                      <dd>{batch.programCode}</dd>
                      <dt>Batch / allocation</dt>
                      <dd>
                        {batch.batchCode} / {allocation.code}
                      </dd>
                      {allocation.paymentRef && (
                        <>
                          <dt>Payment reference</dt>
                          <dd>
                            <Ref value={allocation.paymentRef} />
                          </dd>
                        </>
                      )}
                      {allocation.ledgerRef && (
                        <>
                          <dt>Loyalty entry</dt>
                          <dd>
                            <Ref value={allocation.ledgerRef} />
                          </dd>
                        </>
                      )}
                      {allocation.completedAt && (
                        <>
                          <dt>Credit confirmed at</dt>
                          <dd>
                            <time dateTime={allocation.completedAt}>
                              {new Date(
                                allocation.completedAt,
                              ).toLocaleString()}
                            </time>
                          </dd>
                        </>
                      )}
                    </dl>
                  </details>
                </article>
              ))}
            </div>
          ))}
          <PageControls
            {...view.data}
            previous={view.previous}
            next={view.next}
            label="material pages"
          />
        </>
      )}
    </section>
  );
}
