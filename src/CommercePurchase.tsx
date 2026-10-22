import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import {
  commandKey,
  isCustomerIdentityError,
  request,
  type Offer,
  type Session,
} from "./api";
import type { JourneyHost } from "./channels/journeyHost";
import {
  CertificatePicker,
  type CertificateSelection,
} from "./CertificatePicker";
import { ReviewDialog } from "./ReviewDialog";
import {
  pendingReferenceKey,
  readPendingReference,
  savePendingReference,
  clearPendingReference,
} from "./pendingReferences";
import "./CommercePurchase.css";

type Binding = {
  storeCode: string;
  currency: string;
  jurisdiction: string;
  locale: string;
  programCode: string;
  rewardTypeCode: string;
  variantCode: string;
};
type PurchaseOffer = Offer & {
  commerce?: Binding;
  acquisitionRequirements?: {
    type: "REWARDS" | "CERTIFICATES" | "BOTH";
    certificates?: {
      quantity: number;
      categoryCode?: string;
      brandCodes?: string[];
      modelCodes?: string[];
      milestoneCode?: string;
    };
  } | null;
  ownerRef?: {
    module: "profile";
    schema: "customer" | "enterprise";
    code: string;
  };
  bundleRef?: { code: string };
};
type Wallet = {
  owner: { ownerType: string; ownerCode: string };
  wallet: { code: string } | null;
  balances: {
    programCode: string;
    rewardTypeCode: string;
    available: string;
  }[];
};
type Calculation = {
  code: string;
  totalAmount: string;
  currency: string;
  cartCode: string;
};
type CartResponse = {
  cart: { code: string; revision: number };
  entries: { code: string; productCode: string }[];
  calculation: Calculation | { calculation: Calculation };
};
type Review = {
  cartCode: string;
  orderCode: string;
  entryCode: string;
  revision: number;
  calculation: Calculation;
  certificates: string[];
  walletCode?: string;
  available?: string;
  key: string;
};
type PurchaseReference = Pick<Review, "key" | "cartCode" | "orderCode">;
function referenceKey(session: Session | null, offerCode: string) {
  return session
    ? pendingReferenceKey(session, "checkout", undefined, offerCode)
    : null;
}
function isPurchaseReference(value: unknown): value is PurchaseReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as PurchaseReference;
  return (
    Object.keys(reference).sort().join(",") === "cartCode,key,orderCode" &&
    [reference.key, reference.cartCode, reference.orderCode].every(
      (v) => typeof v === "string" && !!v,
    ) &&
    reference.orderCode === "purchase-" + reference.key &&
    reference.cartCode === reference.orderCode + "-cart"
  );
}
/** Browser references are recovery hints only; Checkout reauthorizes every original command. No credentials or balances are retained. */
function readReference(storageKey: string | null): {
  value?: PurchaseReference;
  error?: string;
} {
  if (!storageKey) return {};
  try {
    return {
      value: readPendingReference(storageKey, isPurchaseReference) || undefined,
    };
  } catch {
    return {
      error:
        "The saved purchase reference could not be read. Restore browser storage before purchasing.",
    };
  }
}
type Completion = {
  status: string;
  code?: string;
  orderCode?: string;
  cartCode?: string;
  commandCode?: string;
  scopeQualified?: boolean;
  recoveryAction?: string;
  evidence?: { orderCode?: string };
};
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;
function covers(available: string, price: string) {
  if (!DECIMAL.test(available) || !DECIMAL.test(price)) return false;
  const [whole, fraction = ""] = available.split("."),
    [cost, remainder = ""] = price.split(".");
  const scale = Math.max(fraction.length, remainder.length);
  return (
    BigInt(whole + fraction.padEnd(scale, "0")) >=
    BigInt(cost + remainder.padEnd(scale, "0"))
  );
}
type Props = {
  offer: PurchaseOffer;
  session: Session | null;
  onLogin: () => void;
  onComplete: () => void;
  accountUrl?: string;
  host?: JourneyHost;
  onBack?: () => void;
};

/** Uses standard Commerce Cart/Checkout for both purchasing owner kinds; UI never settles, prices or reverses value. */
export function CommercePurchase({
  offer,
  session,
  onLogin,
  onComplete,
  accountUrl = "/account/purchases",
  host,
  onBack,
}: Props) {
  return (
    <PurchaseForm
      key={JSON.stringify([
        session?.token,
        session?.loginId,
        session?.kind,
        session?.enterpriseCode,
        offer.code,
        offer.revision,
      ])}
      offer={offer}
      session={session}
      onLogin={onLogin}
      onComplete={onComplete}
      accountUrl={accountUrl}
      host={host}
      onBack={onBack}
    />
  );
}
function PurchaseForm({
  offer,
  session,
  onLogin,
  onComplete,
  accountUrl,
  host,
  onBack,
}: Props) {
  const storageKey = referenceKey(session, offer.code);
  const [retained] = useState(() => readReference(storageKey));
  const [pending, setPending] = useState<PurchaseReference | undefined>(
    retained.value,
  );
  const [certificates, setCertificates] = useState<CertificateSelection[]>([]),
    [review, setReview] = useState<Review>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(retained.error || ""),
    [attempted, setAttempted] = useState(!!retained.value);
  const [receipt, setReceipt] = useState<string>(),
    [own, setOwn] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recoveryAllowed, setRecoveryAllowed] = useState(false);
  const active = useRef(true),
    key = useRef("");
  if (!key.current) key.current = retained.value?.key || commandKey();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(
    () =>
      host?.bindBack?.(() => {
        if (busy) return;
        if (!reviewOpen) {
          onBack?.();
          return;
        }
        setReviewOpen(false);
        if (!attempted) {
          setReview(undefined);
          key.current = commandKey();
        }
      }),
    [host, onBack, busy, reviewOpen, attempted],
  );
  const binding = offer.commerce,
    requirement = offer.acquisitionRequirements;
  const needsCertificate =
    requirement?.type === "CERTIFICATES" || requirement?.type === "BOTH";
  const needsRewards =
    offer.kind !== "COUPON" ||
    requirement?.type === "REWARDS" ||
    requirement?.type === "BOTH";
  const requirementsKnown =
    offer.kind !== "COUPON" ||
    (requirement &&
      ["REWARDS", "CERTIFICATES", "BOTH"].includes(requirement.type) &&
      (!needsCertificate ||
        (Number.isSafeInteger(requirement.certificates?.quantity) &&
          requirement.certificates!.quantity > 0)));
  const availableBinding =
    requirementsKnown &&
    binding &&
    [
      binding.storeCode,
      binding.currency,
      binding.jurisdiction,
      binding.locale,
      binding.variantCode,
    ].every((v) => typeof v === "string" && v.length > 0) &&
    (!needsRewards ||
      [binding.programCode, binding.rewardTypeCode].every(
        (v) => typeof v === "string" && v.length > 0,
      ));
  const fail = (cause: unknown) =>
    cause instanceof Error
      ? cause.message
      : "The purchase could not be confirmed.";
  async function prepare() {
    if (
      !session ||
      !binding ||
      !availableBinding ||
      busy ||
      pending ||
      retained.error
    )
      return;
    setBusy(true);
    setError("");
    try {
      let wallet: Wallet | undefined;
      if (needsRewards) {
        wallet = await request<Wallet>(
          "/nodics/loyaltyApi/v0/participant/wallet",
          session,
        );
        if (!active.current) return;
        if (
          !wallet.owner?.ownerCode ||
          wallet.owner.ownerType !==
            (session.kind === "ENTERPRISE" ? "ENTERPRISE" : "CUSTOMER") ||
          (session.kind === "ENTERPRISE" &&
            wallet.owner.ownerCode !== session.enterpriseCode) ||
          !Array.isArray(wallet.balances) ||
          wallet.balances.some(
            (row) =>
              typeof row.available !== "string" || !DECIMAL.test(row.available),
          )
        )
          throw new Error("The wallet does not match the current account.");
        if (
          offer.ownerRef &&
          wallet.owner.ownerType === offer.ownerRef.schema.toUpperCase() &&
          wallet.owner.ownerCode === offer.ownerRef.code
        ) {
          setOwn(true);
          return;
        }
        if (!wallet.wallet?.code)
          throw new Error("No reward wallet is available for this account.");
      }
      const code = "purchase-" + key.current,
        cartCode = code + "-cart",
        entryCode = code + "-entry";
      await request("/nodics/cart/v0/carts", session, {
        cartCode,
        storeCode: binding.storeCode,
        currency: binding.currency,
        jurisdiction: binding.jurisdiction,
        locale: binding.locale,
        idempotencyKey: key.current + ":cart",
      });
      if (!active.current) return;
      const added = await request<CartResponse>(
        `/nodics/cart/v0/carts/${encodeURIComponent(cartCode)}/entries`,
        session,
        {
          productCode: offer.code,
          variantCode: binding.variantCode,
          quantity: 1,
          entryCode,
          idempotencyKey: key.current + ":entry",
        },
      );
      if (!active.current) return;
      const calculation =
        added.calculation && "calculation" in added.calculation
          ? added.calculation.calculation
          : added.calculation;
      if (
        added.cart?.code !== cartCode ||
        !Number.isSafeInteger(added.cart.revision) ||
        !Array.isArray(added.entries) ||
        added.entries.length !== 1 ||
        added.entries[0].code !== entryCode ||
        added.entries[0].productCode !== offer.code ||
        !calculation ||
        !calculation.code ||
        calculation.cartCode !== cartCode ||
        calculation.currency !== binding.currency ||
        !DECIMAL.test(String(calculation.totalAmount))
      )
        throw new Error(
          "The current checkout calculation could not be confirmed.",
        );
      if (!needsRewards && /[1-9]/.test(String(calculation.totalAmount)))
        throw new Error(
          "Certificate-only purchase has an unexpected rewards charge.",
        );
      const balance = wallet?.balances.find(
        (row) =>
          row.programCode === binding.programCode &&
          row.rewardTypeCode === binding.rewardTypeCode,
      );
      if (
        (wallet?.balances.filter(
          (row) =>
            row.programCode === binding.programCode &&
            row.rewardTypeCode === binding.rewardTypeCode,
        ).length || 0) > 1
      )
        throw new Error("The reward balance could not be confirmed.");
      if (
        needsRewards &&
        !covers(balance?.available || "0", String(calculation.totalAmount))
      )
        throw new Error("More points are needed for this purchase.");
      setReview({
        cartCode,
        orderCode: code,
        entryCode,
        revision: added.cart.revision,
        calculation,
        certificates: certificates.map((row) => row.code),
        walletCode: wallet?.wallet?.code,
        available: balance?.available,
        key: key.current,
      });
      setReviewOpen(true);
    } catch (cause) {
      if (active.current) {
        setError(fail(cause));
        if (isCustomerIdentityError(cause)) onLogin();
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function confirm() {
    if (
      !review ||
      !session ||
      !binding ||
      !storageKey ||
      busy ||
      attempted ||
      retained.error
    )
      return;
    setBusy(true);
    setError("");
    try {
      const reference = {
        key: review.key,
        cartCode: review.cartCode,
        orderCode: review.orderCode,
      };
      const previous = readReference(storageKey);
      if (previous.error || previous.value)
        throw new Error("Check the original purchase before placing another.");
      savePendingReference(storageKey, reference, isPurchaseReference);
      setPending(reference);
      setAttempted(true);
      const result = await request<Completion>(
        "/nodics/checkoutCore/v0/checkouts/place",
        session,
        {
          cartCode: review.cartCode,
          orderCode: review.orderCode,
          expectedCartRevision: review.revision,
          calculationCode: review.calculation.code,
          idempotencyKey: review.key,
          ...(needsRewards
            ? {
                paymentMethod: "LOYALTY_REWARD",
                walletCode: review.walletCode,
                programCode: binding.programCode,
                rewardTypeCode: binding.rewardTypeCode,
                rewardCurrency: review.calculation.currency,
                rewardAmount: String(review.calculation.totalAmount),
              }
            : {}),
          ...(needsCertificate
            ? {
                couponSelections: { [review.entryCode]: [review.certificates] },
              }
            : {}),
        },
      );
      if (!active.current) return;
      if (
        result.status !== "COMPLETED" ||
        result.code !== review.orderCode ||
        result.orderCode !== review.orderCode ||
        result.cartCode !== review.cartCode
      )
        throw new Error(
          "Purchase confirmation is pending. Check the original purchase reference.",
        );
      clearPendingReference(storageKey, reference, isPurchaseReference);
      setReceipt(review.orderCode);
      onComplete();
    } catch (cause) {
      if (active.current) setError(fail(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function readStatus() {
    const original = pending || review;
    if (!original || !session) return;
    setRecoveryAllowed(false);
    const result = await request<Completion>(
      `/nodics/checkoutCore/v0/checkouts/commands/${encodeURIComponent(original.key)}`,
      session,
    );
    if (!active.current) return;
    if (result.scopeQualified === true) {
      if (
        result.orderCode !== original.orderCode ||
        result.cartCode !== original.cartCode
      )
        throw new Error(
          "The original purchase reference does not match this order.",
        );
    }
    if (result.status === "COMPLETED" && result.scopeQualified === true) {
      const completed = await request<Completion>(
        `/nodics/checkoutCore/v0/checkouts/${encodeURIComponent(original.orderCode)}`,
        session,
      );
      if (!active.current) return;
      if (
        completed.status !== "COMPLETED" ||
        completed.code !== original.orderCode
      )
        throw new Error("The original order is not yet confirmed.");
      if (storageKey)
        clearPendingReference(
          storageKey,
          {
            key: original.key,
            cartCode: original.cartCode,
            orderCode: original.orderCode,
          },
          isPurchaseReference,
        );
      setReceipt(original.orderCode);
      onComplete();
    } else {
      setRecoveryAllowed(
        result.scopeQualified === true &&
          result.status === "COMPENSATION_REQUIRED" &&
          ["RESUME_BUNDLE_PURCHASE", "RESUME_COUPON_PURCHASE"].includes(
            result.recoveryAction || "",
          ),
      );
      setError(
        "Purchase status: " +
          result.status +
          ". Keep reference " +
          original.key +
          ".",
      );
    }
  }
  async function inspect() {
    if (!(pending || review) || !session || busy) return;
    setBusy(true);
    setError("");
    try {
      await readStatus();
    } catch (cause) {
      if (active.current) setError(fail(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function resume() {
    const original = pending || review;
    if (!original || !session || busy || !recoveryAllowed) return;
    setBusy(true);
    setError("");
    setRecoveryAllowed(false);
    try {
      await request(
        `/nodics/checkoutCore/v0/checkouts/${encodeURIComponent(original.key)}/recovery/resume`,
        session,
        { confirmed: true },
      );
      if (active.current) await readStatus();
    } catch (cause) {
      if (active.current) setError(fail(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="catalogue-purchase commerce-purchase">
      {receipt ? (
        <div className="purchase-receipt" role="status">
          <Check size={28} />
          <h2>
            {offer.kind === "COUPON"
              ? "Your coupon is ready."
              : "Your digital bundle is ready."}
          </h2>
          <p>Reference: {receipt}</p>
          <a className="primary" href={accountUrl}>
            Go to My Account
          </a>
        </div>
      ) : (
        <>
          {error && !review && <p role="alert">{error}</p>}
          {!session ? (
            <button className="primary" onClick={onLogin}>
              Sign in to continue
            </button>
          ) : (
            <>
              {needsCertificate && !pending && (
                <>
                  <p>
                    {requirement.certificates?.quantity} certificate(s)
                    required. Selected certificates are consumed when the
                    purchase completes.
                  </p>
                  <dl>
                    {requirement.certificates?.categoryCode && (
                      <>
                        <dt>Category</dt>
                        <dd>{requirement.certificates.categoryCode}</dd>
                      </>
                    )}
                    {!!requirement.certificates?.brandCodes?.length && (
                      <>
                        <dt>Brands</dt>
                        <dd>
                          {requirement.certificates.brandCodes.join(", ")}
                        </dd>
                      </>
                    )}
                    {!!requirement.certificates?.modelCodes?.length && (
                      <>
                        <dt>Models</dt>
                        <dd>
                          {requirement.certificates.modelCodes.join(", ")}
                        </dd>
                      </>
                    )}
                    {requirement.certificates?.milestoneCode && (
                      <>
                        <dt>Milestone</dt>
                        <dd>{requirement.certificates.milestoneCode}</dd>
                      </>
                    )}
                  </dl>
                  <CertificatePicker
                    session={session}
                    value={certificates}
                    onChange={setCertificates}
                    disabled={busy || !!review}
                  />
                </>
              )}
              {!availableBinding && (
                <p role="status">This offer is not ready for checkout.</p>
              )}
              {own ? (
                <p>You own this bundle.</p>
              ) : (
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !availableBinding ||
                    offer.available === false ||
                    !!review ||
                    !!pending ||
                    !!retained.error ||
                    (needsCertificate &&
                      certificates.length !==
                        requirement.certificates?.quantity)
                  }
                  onClick={() => void prepare()}
                >
                  {busy
                    ? "Checking purchase..."
                    : offer.kind === "COUPON"
                      ? "Review coupon purchase"
                      : "Review purchase"}
                  <ArrowRight size={17} />
                </button>
              )}
              {pending && !review && (
                <section aria-label="Original purchase">
                  <p className="purchase-command-reference">
                    Reference: {pending.key}
                  </p>
                  <button disabled={busy} onClick={() => void inspect()}>
                    <RefreshCw size={17} /> Check original purchase
                  </button>
                  {recoveryAllowed && (
                    <button disabled={busy} onClick={() => void resume()}>
                      <ArrowRight size={17} /> Continue original purchase
                    </button>
                  )}
                </section>
              )}
              {review && !reviewOpen && (
                <button
                  className="catalogue-secondary"
                  onClick={() => setReviewOpen(true)}
                >
                  View purchase status
                </button>
              )}
            </>
          )}
          {review && reviewOpen && (
            <ReviewDialog
              title="Review your purchase"
              onClose={() => {
                if (busy) return;
                setReviewOpen(false);
                if (!attempted) {
                  setReview(undefined);
                  key.current = commandKey();
                }
              }}
            >
              <h3>{offer.name}</h3>
              <dl>
                <dt>Rewards</dt>
                <dd>
                  {String(review.calculation.totalAmount)}{" "}
                  {review.calculation.currency}
                </dd>
                {review.available !== undefined && (
                  <>
                    <dt>Available balance</dt>
                    <dd>{review.available}</dd>
                  </>
                )}
                {!!review.certificates.length && (
                  <>
                    <dt>Certificates to consume</dt>
                    <dd>{review.certificates.join(", ")}</dd>
                  </>
                )}
                <dt>Purchase terms</dt>
                <dd>
                  Completed digital purchases are final. No returns or refunds.
                </dd>
              </dl>
              {error && <p role="alert">{error}</p>}
              {attempted && (
                <p className="purchase-command-reference">
                  Reference: {review.key}
                </p>
              )}
              <button
                className="primary"
                disabled={busy}
                onClick={() => void (attempted ? inspect() : confirm())}
              >
                {attempted && <RefreshCw size={17} />}
                {busy
                  ? "Checking..."
                  : attempted
                    ? "Check purchase"
                    : "Confirm purchase"}
              </button>
              {recoveryAllowed && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void resume()}
                >
                  <ArrowRight size={17} />
                  Continue original purchase
                </button>
              )}
            </ReviewDialog>
          )}
        </>
      )}
    </section>
  );
}
