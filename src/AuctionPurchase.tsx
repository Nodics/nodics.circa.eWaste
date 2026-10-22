import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import type { AuctionRound, SelectedAuctionPurchase } from "./BidsPanel";
import { request, type Offer, type Session } from "./api";
import type { JourneyHost } from "./channels/journeyHost";
import { ReviewDialog } from "./ReviewDialog";
import { readPendingReference, savePendingReference, clearPendingReference } from "./pendingReferences";
import "./CommercePurchase.css";

type Selector = Pick<SelectedAuctionPurchase, "roundCode" | "storeCode">;
export type AuctionPurchaseProps = { offer: Pick<Offer, "code" | "name">; session: Session; purchase: Selector | SelectedAuctionPurchase;
  onComplete: () => void; accountUrl?: string; host?: JourneyHost; onBack?: () => void };
type Props = AuctionPurchaseProps;
type Cart = { cart: { code: string; storeCode: string; currency: string; revision: number };
  entries: { code: string; productCode: string; variantCode: string; priceQuoteCode: string; quantity: string | number }[] };
type Calculation = { code: string; cartCode: string; totalAmount: string; currency: string };
type Status = { status: string; scopeQualified?: boolean; cartCode?: string; orderCode?: string;
  code?: string; originalPaymentRecordCount?: number; recoveryAction?: string; cancellationKey?: string; placementKey?: string };
type Review = { purchase: SelectedAuctionPurchase; revision: number; calculation?: Calculation; key: string; cancellationKey?: string };
type CancellationReference = { cancellationKey: string; cartCode: string; orderCode: string };
const CHECKOUT = "/nodics/checkoutCore/v0";
const decimal = (value: unknown): value is string => typeof value === "string" && value.length <= 64 && /^\d+(\.\d+)?$/.test(value);
function equalAmount(left: string, right: string) {
  if (!decimal(left) || !decimal(right)) return false;
  const [a, b = ""] = left.split("."), [c, d = ""] = right.split("."), scale = Math.max(b.length, d.length);
  return BigInt(a + b.padEnd(scale, "0")) === BigInt(c + d.padEnd(scale, "0"));
}
function failure(cause: unknown) { return cause instanceof Error ? cause.message : "The original auction purchase could not be confirmed."; }
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:@|\-]{0,255}$/.test(value);
function cancellationValidator(purchase: Pick<SelectedAuctionPurchase, "cartCode" | "orderCode">) {
  return (value: unknown): value is CancellationReference => {
    if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "cancellationKey,cartCode,orderCode") return false;
    const hint = value as CancellationReference;
    return hint.cartCode === purchase.cartCode && hint.orderCode === purchase.orderCode && identifier(hint.cancellationKey);
  };
}
function completedReceipt(value: Status, current: Review) {
  return value.status === "COMPLETED" && value.code === current.purchase.orderCode &&
    value.orderCode === current.purchase.orderCode && value.cartCode === current.purchase.cartCode;
}

/** Isolates private state by participant and selected commitment; no fixed-price flow or browser funding authority. */
export function AuctionPurchase(props: Props) {
  return <SelectedPurchase key={JSON.stringify([props.session.token, props.session.enterpriseCode,
    props.offer.code, props.purchase.roundCode, props.purchase.storeCode])} {...props} />;
}

/** Revalidates the selected buyer, reads the retained Cart and uses only its original Checkout command. */
function SelectedPurchase({ offer, session, purchase: selector, onComplete, accountUrl = "/account/purchases", host, onBack }: Props) {
  const [review, setReview] = useState<Review>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false), [resumable, setResumable] = useState(false);
  const [cancellationPending, setCancellationPending] = useState(false);
  const [terminal, setTerminal] = useState<"COMPLETED" | "CANCELLED">(), [dialog, setDialog] = useState<"BUY" | "CANCEL">();
  const active = useRef(true), inFlight = useRef(false);
  const retainedCancellation = useRef<CancellationReference | null>(null);
  // Keep the established namespace so existing unresolved hints remain recoverable.
  const storageKey = "circa.auction.cancellation:" + JSON.stringify([session.kind || "CUSTOMER", session.loginId,
    session.enterpriseCode || null, selector.roundCode, selector.storeCode, offer.code]);
  function clearCancellationHint() {
    const expected = retainedCancellation.current;
    if (!expected) return;
    try {
      clearPendingReference(storageKey, expected, cancellationValidator(expected));
      retainedCancellation.current = null;
    } catch { /* Owner status remains authoritative; a changed hint must not be cleared. */ }
  }
  function cancellationStatus(state: Status, current: Review) {
    if (!["CANCELLATION_PENDING", "CANCELLED"].includes(state.status)) return false;
    if (!identifier(state.cancellationKey) || current.cancellationKey && current.cancellationKey !== state.cancellationKey)
      throw new Error("The original cancellation reference could not be confirmed.");
    current.cancellationKey = state.cancellationKey; setReview({ ...current }); setCancellationPending(true);
    if (state.status === "CANCELLED") { setTerminal("CANCELLED"); setDialog(undefined); clearCancellationHint(); }
    return true;
  }
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => host?.bindBack?.(() => { if (!inFlight.current) { if (dialog) setDialog(undefined); else onBack?.(); } }), [host, onBack, dialog]);
  const expired = review ? Date.parse(review.purchase.expiresAt) <= Date.now() : false;
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await action(); } catch (cause) { if (active.current) setError(failure(cause)); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  async function inspect(current: Review, initial = false) {
    const state = await request<Status>(`${CHECKOUT}/checkouts/commands/${encodeURIComponent(current.key)}`, session);
    if (!active.current) return true;
    setResumable(false);
    if (initial && state.status === "UNCONFIRMED" && state.scopeQualified === false && state.originalPaymentRecordCount === 0) return false;
    setAttempted(true);
    if (state.scopeQualified !== true || state.cartCode !== current.purchase.cartCode || state.orderCode !== current.purchase.orderCode)
      throw new Error("The original purchase status is unconfirmed. Keep its reference and retry status.");
    if (cancellationStatus(state, current)) { setAttempted(false); return true; }
    setCancellationPending(false); current.cancellationKey = undefined;
    if (state.status === "COMPLETED") {
      const receipt = await request<Status>(`${CHECKOUT}/checkouts/${encodeURIComponent(current.purchase.orderCode)}`, session);
      if (!active.current) return true;
      if (!completedReceipt(receipt, current)) throw new Error("The original order is not yet confirmed.");
      setTerminal("COMPLETED"); setDialog(undefined); clearCancellationHint(); onComplete();
    } else if (state.status === "CANCELLED") { setTerminal("CANCELLED"); setDialog(undefined); }
    else {
      setResumable(state.status === "RECOVERY_REQUIRED" && state.recoveryAction === "RESUME_ORIGINAL_PLACEMENT");
      setError("Purchase status: " + state.status + ".");
    }
    return true;
  }
  async function load() {
    setReview(undefined); setResumable(false);
    const round = await request<AuctionRound>(`/nodics/bidding/v0/auctions/${encodeURIComponent(selector.roundCode)}?storeCode=${encodeURIComponent(selector.storeCode)}`, session);
    if (!active.current) return;
    const p = round.selection?.purchase;
    if (round.code !== selector.roundCode || round.storeCode !== selector.storeCode || round.productCode !== offer.code ||
        round.participantRole !== "BUYER" || round.status !== "SELECTED" || round.selection?.status !== "CHECKOUT_READY" ||
        !p || p.kind !== "AUCTION" || p.roundCode !== round.code || p.storeCode !== round.storeCode || p.productCode !== round.productCode ||
        p.bidCode !== round.selection.bidCode || !decimal(p.amount) || !equalAmount(p.amount, round.selection.amount) ||
        p.currency !== round.currency || p.variantCode !== round.variantCode || !Number.isFinite(Date.parse(p.expiresAt)) ||
        [p.cartCode, p.orderCode, p.priceQuoteCode].some(v => typeof v !== "string" || !v || v.length > 192) ||
        "cartCode" in selector && ["cartCode", "orderCode", "bidCode", "priceQuoteCode"].some(key => p[key as keyof SelectedAuctionPurchase] !== selector[key as keyof SelectedAuctionPurchase]))
      throw new Error("This selected purchase is unavailable to the current account.");
    const current: Review = { purchase: p, revision: 0, key: "auction-purchase:" + p.orderCode };
    // Non-secret browser intent survives a lost request before the owner journal is visible; it is never payment authority.
    const hint = readPendingReference(storageKey, cancellationValidator(p));
    retainedCancellation.current = hint;
    if (hint) {
      current.cancellationKey = hint.cancellationKey; setCancellationPending(true);
    }
    setReview(current);
    if (await inspect(current, true)) return;
    const owner = await request<Status>(`${CHECKOUT}/checkouts/${encodeURIComponent(p.orderCode)}`, session);
    if (!active.current) return;
    if (owner.scopeQualified !== true || owner.code !== p.orderCode || owner.orderCode !== p.orderCode || owner.cartCode !== p.cartCode)
      throw new Error("The original auction purchase binding is unconfirmed.");
    if (cancellationStatus(owner, current)) return;
    if (owner.placementKey) {
      if (!identifier(owner.placementKey)) throw new Error("The original placement reference is invalid.");
      current.key = owner.placementKey; setReview({ ...current }); await inspect(current); return;
    }
    if (owner.status !== "READY") throw new Error("The original auction purchase requires owner recovery.");
    if (current.cancellationKey) return;
    const cart = await request<Cart>(`/nodics/cart/v0/carts/${encodeURIComponent(p.cartCode)}`, session);
    if (!active.current) return;
    const entry = cart.entries?.[0];
    if (cart.cart?.code !== p.cartCode || cart.cart.storeCode !== p.storeCode || cart.cart.currency !== p.currency ||
        !Number.isSafeInteger(cart.cart.revision) || cart.cart.revision < 0 || cart.entries?.length !== 1 ||
        !entry || entry.productCode !== p.productCode || entry.variantCode !== p.variantCode || entry.priceQuoteCode !== p.priceQuoteCode ||
        !equalAmount(String(entry.quantity), "1")) throw new Error("The retained auction Cart does not match the selected offer.");
    current.revision = cart.cart.revision;
    if (Date.parse(p.expiresAt) > Date.now()) {
      const result = await request<Calculation | { calculation: Calculation }>(`/nodics/cart/v0/carts/${encodeURIComponent(p.cartCode)}/calculations`, session,
        { expectedRevision: current.revision, calculationCode: p.cartCode + ":review", idempotencyKey: current.key + ":calculation" });
      if (!active.current) return;
      const calculation = "calculation" in result ? result.calculation : result;
      if (!calculation.code || calculation.cartCode !== p.cartCode || calculation.currency !== p.currency || !equalAmount(calculation.totalAmount, p.amount))
        throw new Error("The retained auction calculation does not match the selected amount.");
      current.calculation = calculation;
    }
    setAttempted(false); setReview({ ...current });
  }
  useEffect(() => { void run(load); }, []);
  async function confirm() {
    if (!review || attempted || cancellationPending || !review.calculation || Date.parse(review.purchase.expiresAt) <= Date.now()) return;
    await run(async () => {
      setAttempted(true); setDialog(undefined);
      const result = await request<Status>(`${CHECKOUT}/checkouts/place`, session, {
        cartCode: review.purchase.cartCode, orderCode: review.purchase.orderCode,
        expectedCartRevision: review.revision, calculationCode: review.calculation!.code,
        paymentMethod: "LOYALTY_REWARD", idempotencyKey: review.key,
      });
      if (!active.current) return;
      if (completedReceipt(result, review)) {
        setTerminal("COMPLETED"); onComplete();
      } else if (result.status === "COMPLETED") throw new Error("The completion receipt does not match the original Cart and Order. Check purchase status.");
      else await inspect(review);
    });
  }
  async function resume() {
    if (!review || !resumable) return;
    await run(async () => {
      setResumable(false);
      await request(`${CHECKOUT}/checkouts/${encodeURIComponent(review.key)}/recovery/resume`, session, { confirmed: true });
      if (active.current) await inspect(review);
    });
  }
  async function cancel() {
    if (!review || attempted) return;
    await run(async () => {
      const cancellationKey = review.cancellationKey || review.key + ":cancel";
      const hint = retainedCancellation.current || { cancellationKey, cartCode: review.purchase.cartCode, orderCode: review.purchase.orderCode };
      savePendingReference(storageKey, hint, cancellationValidator(review.purchase));
      retainedCancellation.current = hint;
      review.cancellationKey = cancellationKey;
      setCancellationPending(true);
      const result = await request<Status>(`${CHECKOUT}/checkout/auction/cancel`, session, {
        cartCode: review.purchase.cartCode, orderCode: review.purchase.orderCode,
        confirmed: true, idempotencyKey: cancellationKey,
      });
      if (!active.current) return;
      if (result.status !== "CANCELLED" || result.orderCode !== review.purchase.orderCode || result.cartCode !== review.purchase.cartCode ||
          result.cancellationKey !== cancellationKey) throw new Error("Cancellation is not yet confirmed.");
      setTerminal("CANCELLED"); setDialog(undefined); clearCancellationHint();
    });
  }
  return <section className="catalogue-purchase commerce-purchase" aria-label="Selected auction purchase">
    <h2>{offer.name}</h2>
    {error && <p role="alert">{error}</p>}
    {terminal ? <div role="status"><Check size={24} /><h3>{terminal === "COMPLETED" ? "Your auction purchase is complete." : "The selected purchase is cancelled."}</h3>
      <a href={accountUrl}>Go to My Account</a></div> : <>
      {busy && <p role="status">Checking the original purchase...</p>}
      {review && <><dl><dt>Selected offer</dt><dd>{review.purchase.amount} {review.purchase.currency}</dd>
        <dt>Purchase deadline</dt><dd>{new Date(review.purchase.expiresAt).toLocaleString()}</dd></dl>
        <p className="purchase-command-reference">Reference: {review.key}</p>
        {expired && !attempted && <p role="status">The purchase deadline has passed.</p>}
        {cancellationPending ? <button disabled={busy} onClick={() => void cancel()}><RefreshCw size={16} /> Retry original cancellation</button>
        : attempted ? <><button disabled={busy} onClick={() => void run(() => inspect(review).then(() => {}))}><RefreshCw size={16} /> Check purchase status</button>
          {resumable && <button className="primary" disabled={busy} onClick={() => void resume()}>Resume original purchase</button>}</> : <>
          <button className="primary" disabled={busy || !review.calculation || expired || !!error} onClick={() => setDialog("BUY")}>Review selected purchase</button>
          <button disabled={busy || !!error} onClick={() => setDialog("CANCEL")}><X size={16} /> Cancel selected purchase</button></>}
      </>}
      {!attempted && !cancellationPending && <button disabled={busy} onClick={() => void run(load)}><RefreshCw size={16} /> Refresh selected purchase</button>}
    </>}
    {dialog && !terminal && <ReviewDialog title={dialog === "BUY" ? "Confirm selected purchase" : "Cancel selected purchase"} onClose={() => { if (!busy) setDialog(undefined); }}>
      <p>{offer.name}: {review?.purchase.amount} {review?.purchase.currency}</p>
      <button className="primary" disabled={busy} onClick={() => void (dialog === "BUY" ? confirm() : cancel())}>
        {dialog === "BUY" ? "Confirm purchase" : "Confirm cancellation"}</button>
    </ReviewDialog>}
  </section>;
}
