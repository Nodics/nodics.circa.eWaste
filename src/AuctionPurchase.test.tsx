/** Selected commitment UI contracts only; no live Cart, Loyalty, provider or browser acceptance. */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuctionPurchase } from "./AuctionPurchase";
import { AuctionJourney } from "./AuctionJourney";
import { request, type Offer, type Session } from "./api";
import type { AuctionRound, SelectedAuctionPurchase } from "./BidsPanel";
import { BidHistory } from "./BidsPanel";
import { TransactionPage } from "./CircaApp";
import { webJourneyHost } from "./channels/journeyHost";
vi.mock("./api", async original => ({ ...(await original<typeof import("./api")>()), request: vi.fn(), commandKey: vi.fn() }));
vi.mock("./CollectionMap", () => ({ CollectionMap: () => null }));
const session: Session = { token: "original", loginId: "buyer", enterpriseCode: "owner" };
const offer: Offer = { code: "product", name: "Recovered bundle", kind: "ASSET", rewardPrice: 10, revision: 1,
  biddingAvailable: true, biddingMode: "AUCTION", auction: { roundCode: "round", storeCode: "store" } };
const purchase: SelectedAuctionPurchase = { kind: "AUCTION", roundCode: "round", bidCode: "bid", storeCode: "store",
  productCode: "product", variantCode: "unit", cartCode: "retained-cart", orderCode: "reserved-order", priceQuoteCode: "private-quote",
  amount: "20.00", currency: "POINTS", expiresAt: "2999-01-01T00:00:00.000Z" };
const key = "auction-purchase:reserved-order";
const checkout = "/nodics/checkoutCore/v0";
const round = (): AuctionRound => ({ code: "round", storeCode: "store", productCode: "product", variantCode: "unit",
  publicationCode: "publication", revision: 1, status: "SELECTED", participantRole: "BUYER", currency: "POINTS", floor: "10",
  startsAt: null, endsAt: null, graceEndsAt: null, holdTiming: "RESERVE_ON_BID", highestAmount: "20", bidCount: 1,
  processing: false, allowedActions: [], bids: [], selection: { bidCode: "bid", amount: "20", status: "CHECKOUT_READY", purchase: { ...purchase } } });
const cart = () => ({ cart: { code: purchase.cartCode, storeCode: "store", currency: "POINTS", revision: 4 },
  entries: [{ code: "entry", productCode: "product", variantCode: "unit", priceQuoteCode: "private-quote", quantity: "1.00" }] });
const calculation = () => ({ code: "calculation", cartCode: purchase.cartCode, currency: "POINTS", totalAmount: "20" });
const qualified = (status: string, extra = {}) => ({ status, scopeQualified: true, cartCode: purchase.cartCode, orderCode: purchase.orderCode, ...extra });
function ready(r = round(), c = cart(), calc = calculation()) {
  vi.mocked(request).mockResolvedValueOnce(r).mockResolvedValueOnce({ status: "UNCONFIRMED", scopeQualified: false, originalPaymentRecordCount: 0 })
    .mockResolvedValueOnce(qualified("READY", { code: purchase.orderCode })).mockResolvedValueOnce(c).mockResolvedValueOnce(calc);
}
async function buy() {
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Review selected purchase" }));
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  return user;
}
beforeEach(() => { sessionStorage.clear(); window.history.replaceState({}, "", "/shop/product"); });
afterEach(() => vi.resetAllMocks());

for (const kind of ["CUSTOMER", "ENTERPRISE"] as const) it(`${kind} reviews retained Cart and places only its selected original command without funding selectors`, async () => {
  ready(); vi.mocked(request).mockResolvedValueOnce(qualified("COMPLETED", { code: purchase.orderCode }));
  const onComplete = vi.fn(), signed = { ...session, kind };
  render(<AuctionPurchase offer={offer} session={signed} purchase={purchase} onComplete={onComplete} />);
  await buy(); await screen.findByText("Your auction purchase is complete.");
  expect(onComplete).toHaveBeenCalledOnce();
  expect(vi.mocked(request).mock.calls.every(call => call[1] === signed)).toBe(true);
  expect(vi.mocked(request).mock.calls[3]).toEqual(["/nodics/cart/v0/carts/retained-cart", signed]);
  expect(vi.mocked(request).mock.calls[4][2]).toEqual({ expectedRevision: 4, calculationCode: "retained-cart:review", idempotencyKey: key + ":calculation" });
  expect(vi.mocked(request).mock.lastCall).toEqual([checkout + "/checkouts/place", signed, {
    cartCode: purchase.cartCode, orderCode: purchase.orderCode, expectedCartRevision: 4, calculationCode: "calculation",
    paymentMethod: "LOYALTY_REWARD", idempotencyKey: key,
  }]);
  expect(vi.mocked(request).mock.calls.some(call => /wallet|\/entries|\/carts$/.test(call[0]))).toBe(false);
});

it("uncertain placement permits status and owner-qualified original recovery, never a replacement placement", async () => {
  ready(); vi.mocked(request).mockRejectedValueOnce(Error("Lost placement response"))
    .mockResolvedValueOnce(qualified("RECOVERY_REQUIRED", { recoveryAction: "RESUME_ORIGINAL_PLACEMENT" }))
    .mockResolvedValueOnce({ status: "COMPLETED" }).mockResolvedValueOnce(qualified("COMPLETED"))
    .mockResolvedValueOnce(qualified("COMPLETED", { code: purchase.orderCode }));
  const complete = vi.fn(); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={complete} />);
  const user = await buy(); await screen.findByText("Lost placement response");
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Resume original purchase" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check purchase status" }));
  await user.click(await screen.findByRole("button", { name: "Resume original purchase" }));
  await screen.findByText("Your auction purchase is complete.");
  expect(vi.mocked(request).mock.calls.filter(call => call[0].endsWith("/checkouts/place"))).toHaveLength(1);
  expect(vi.mocked(request).mock.calls.find(call => call[0].endsWith("/recovery/resume")))
    .toEqual([checkout + "/checkouts/" + encodeURIComponent(key) + "/recovery/resume", session, { confirmed: true }]);
  expect(complete).toHaveBeenCalledOnce();
});

it("remount recovers the deterministic original key before any Cart calculation or placement", async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce(qualified("RECOVERY_REQUIRED", { recoveryAction: "RESUME_ORIGINAL_PLACEMENT" }));
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByRole("button", { name: "Resume original purchase" });
  expect(vi.mocked(request).mock.lastCall?.[0]).toBe(checkout + "/checkouts/commands/" + encodeURIComponent(key));
  expect(request).toHaveBeenCalledTimes(2);
});

for (const status of [qualified("RECOVERY_REQUIRED", { recoveryAction: "RESUME_ORIGINAL_PLACEMENT", cartCode: "foreign" }),
  qualified("RECOVERY_REQUIRED", { recoveryAction: "RESUME_ORIGINAL_PLACEMENT", scopeQualified: false }),
  qualified("RECOVERY_REQUIRED", { recoveryAction: "NEW_PAYMENT" })]) it("does not resume from unqualified, foreign or unsupported owner status", async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce(status);
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Resume original purchase" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
});

it("unknown cancellation fences purchase and retries exactly the original cancellation", async () => {
  ready(); vi.mocked(request).mockRejectedValueOnce(Error("Cancellation response lost"))
    .mockResolvedValueOnce(qualified("CANCELLED", { cancellationKey: key + ":cancel" }));
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Cancel selected purchase" }));
  await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await screen.findByText("Cancellation response lost");
  const original = vi.mocked(request).mock.lastCall;
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Refresh selected purchase" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Retry original cancellation" }));
  await screen.findByText("The selected purchase is cancelled.");
  expect(vi.mocked(request).mock.lastCall).toEqual(original);
  expect(original?.[2]).toEqual({ cartCode: purchase.cartCode, orderCode: purchase.orderCode, confirmed: true, idempotencyKey: key + ":cancel" });
});

it("expired selection allows original cancellation without calculation or placement", async () => {
  const r = round(); r.selection!.purchase!.expiresAt = "2000-01-01T00:00:00.000Z";
  ready(r); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel selected purchase" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeDisabled();
  expect(vi.mocked(request).mock.calls).toHaveLength(4);
});

it("rejects foreign selected identity and stale incoming commitment before reading Cart", async () => {
  const r = round(); r.participantRole = "SELLER"; vi.mocked(request).mockResolvedValueOnce(r);
  const view = render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByRole("alert"); expect(request).toHaveBeenCalledTimes(1); view.unmount();
  vi.mocked(request).mockResolvedValueOnce(round());
  render(<AuctionPurchase offer={offer} session={session} purchase={{ ...purchase, cartCode: "other" }} onComplete={vi.fn()} />);
  await screen.findByRole("alert"); expect(request).toHaveBeenCalledTimes(2);
});

for (const mismatch of ["cart", "quote", "amount"]) it(`rejects mismatched retained ${mismatch} without placement`, async () => {
  const c = cart(), calc = calculation();
  if (mismatch === "cart") c.cart.code = "foreign";
  if (mismatch === "quote") c.entries[0].priceQuoteCode = "foreign";
  if (mismatch === "amount") calc.totalAmount = "21";
  ready(round(), c, calc); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeDisabled();
  expect(vi.mocked(request).mock.calls.some(call => call[0].endsWith("/place"))).toBe(false);
});

it("drops late previous-session private reads", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockRejectedValueOnce(Error("Current account unavailable"));
  const view = render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  view.rerender(<AuctionPurchase offer={offer} session={{ ...session, token: "new" }} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByText("Current account unavailable"); await act(async () => resolve(round()));
  expect(screen.queryByText("20.00 POINTS")).toBeNull(); expect(request).toHaveBeenCalledTimes(2);
});

it("the parent mount revalidates a selected deep link and owns the BidComposer callback", async () => {
  ready(); window.history.replaceState({}, "", "/shop/product?auctionRound=round&storeCode=store");
  const props = { offer, session, onComplete: vi.fn(), onLogin: vi.fn() };
  const view = render(<AuctionJourney {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeEnabled());
  expect(vi.mocked(request).mock.calls[0][0]).toBe("/nodics/bidding/v0/auctions/round?storeCode=store");
  view.unmount(); window.history.replaceState({}, "", "/shop/product"); vi.mocked(request).mockReset();
  vi.mocked(request).mockResolvedValueOnce(round()); ready();
  render(<AuctionJourney {...props} />);
  const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Review selected purchase" }));
  await screen.findByRole("region", { name: "Selected auction purchase" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeEnabled());
  expect(request).toHaveBeenCalledTimes(6);
});

it("private account history opens selected Checkout even without a public offer", async () => {
  vi.mocked(request).mockResolvedValueOnce({ auctions: [round()] }); ready();
  render(<BidHistory session={session} customerCode="buyer" offers={[]} assets={[]} wallet={null} onComplete={vi.fn()} />);
  const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Review selected purchase" }));
  await screen.findByRole("region", { name: "Selected auction purchase" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeEnabled());
  expect(screen.getByRole("heading", { name: "Selected auction" })).toBeVisible();
  expect(vi.mocked(request).mock.calls[1][0]).toBe("/nodics/bidding/v0/auctions/round?storeCode=store");
  expect(vi.mocked(request).mock.calls.some(call => /marketplace|catalogue/.test(call[0]))).toBe(false);
});

it("actual TransactionPage mounts selected auction review, never fixed purchase or another Cart", async () => {
  ready(); window.history.replaceState({}, "", "/shop/product?auctionRound=round&storeCode=store");
  render(<TransactionPage offer={offer} session={session} wallet={null} onLogin={vi.fn()} onComplete={vi.fn()} />);
  await screen.findByRole("region", { name: "Selected auction purchase" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Review selected purchase" })).toBeEnabled());
  expect(vi.mocked(request).mock.calls.some(call => call[0].endsWith("/carts"))).toBe(false);
});

it("the mounted selected journey owns native Back and blocks navigation during the original command", async () => {
  ready(); let finish!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const handlers = new Set<() => void>(), back = vi.fn();
  const host = { ...webJourneyHost, bindBack: (handler: () => void) => { handlers.add(handler); return () => { handlers.delete(handler); }; } };
  window.history.replaceState({}, "", "/shop/product?auctionRound=round&storeCode=store");
  render(<TransactionPage offer={offer} session={session} wallet={null} host={host} onBack={back} onLogin={vi.fn()} onComplete={vi.fn()} />);
  const user = await buy(); expect(handlers.size).toBe(1);
  await act(async () => { for (const handler of handlers) handler(); });
  expect(back).not.toHaveBeenCalled();
  await act(async () => finish(qualified("COMPLETED", { code: purchase.orderCode })));
  await screen.findByText("Your auction purchase is complete.");
  await act(async () => { for (const handler of handlers) handler(); });
  expect(back).toHaveBeenCalledOnce(); expect(user).toBeDefined();
});

for (const receipt of [
  { status: "COMPLETED", code: purchase.orderCode },
  qualified("COMPLETED", { code: purchase.orderCode, cartCode: "foreign" }),
  qualified("COMPLETED", { code: purchase.orderCode, orderCode: "foreign" }),
]) it("rejects incomplete or contradictory completed placement receipts without claiming payment", async () => {
  ready(); vi.mocked(request).mockResolvedValueOnce(receipt);
  const complete = vi.fn(); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={complete} />);
  await buy(); await screen.findByText(/completion receipt does not match/);
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Check purchase status" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
});

it("recovery status cannot complete using a contradictory Order receipt", async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce(qualified("COMPLETED"))
    .mockResolvedValueOnce(qualified("COMPLETED", { code: purchase.orderCode, cartCode: "foreign" }));
  const complete = vi.fn(); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={complete} />);
  await screen.findByText("The original order is not yet confirmed."); expect(complete).not.toHaveBeenCalled();
});

for (const status of ["READY", "CANCELLATION_PENDING"] as const) it(`reload after unknown cancellation retains the original intent when owner reports ${status}`, async () => {
  ready(); vi.mocked(request).mockRejectedValueOnce(Error("Cancellation response lost"));
  const props = { offer, session, purchase, onComplete: vi.fn() }, user = userEvent.setup();
  const view = render(<AuctionPurchase {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel selected purchase" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Cancel selected purchase" }));
  await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await screen.findByText("Cancellation response lost");
  const original = vi.mocked(request).mock.lastCall; view.unmount();
  const hint = sessionStorage.getItem(sessionStorage.key(0)!);
  expect(JSON.parse(hint!)).toEqual({ cancellationKey: key + ":cancel", cartCode: purchase.cartCode, orderCode: purchase.orderCode });
  expect(hint).not.toContain(session.token);
  expect(sessionStorage.key(0)).not.toContain(session.token);
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce({ status: "UNCONFIRMED", scopeQualified: false, originalPaymentRecordCount: 0 })
    .mockResolvedValueOnce(qualified(status, { code: purchase.orderCode, ...(status === "CANCELLATION_PENDING" ? { cancellationKey: key + ":cancel" } : {}) }))
    .mockResolvedValueOnce(qualified("CANCELLED", { cancellationKey: key + ":cancel" }));
  const refreshedSession = { ...session, token: "refreshed-bearer" };
  render(<AuctionPurchase {...props} session={refreshedSession} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry original cancellation" })).toBeEnabled());
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Retry original cancellation" }));
  await screen.findByText("The selected purchase is cancelled.");
  expect(vi.mocked(request).mock.lastCall).toEqual([original![0], refreshedSession, original![2]]); expect(sessionStorage.length).toBe(0);
  expect(vi.mocked(request).mock.calls.filter(call => call[0].endsWith("/calculations"))).toHaveLength(1);
});

for (const status of ["CANCELLATION_PENDING", "CANCELLED"]) it(`owner ${status} survives absent browser storage without new purchase intake`, async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce({ status: "UNCONFIRMED", scopeQualified: false, originalPaymentRecordCount: 0 })
    .mockResolvedValueOnce(qualified(status, { code: purchase.orderCode, cancellationKey: "original-owner-cancellation" }));
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  if (status === "CANCELLED") await screen.findByText("The selected purchase is cancelled.");
  else await waitFor(() => expect(screen.getByRole("button", { name: "Retry original cancellation" })).toBeEnabled());
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(3);
  if (status === "CANCELLATION_PENDING") {
    vi.mocked(request).mockResolvedValueOnce(qualified("CANCELLED", { cancellationKey: "original-owner-cancellation" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry original cancellation" }));
    await screen.findByText("The selected purchase is cancelled.");
    expect(vi.mocked(request).mock.lastCall?.[2]).toEqual({ cartCode: purchase.cartCode, orderCode: purchase.orderCode,
      confirmed: true, idempotencyKey: "original-owner-cancellation" });
  }
});

it("reload adopts the retained placement key rather than generating a replacement command", async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce({ status: "UNCONFIRMED", scopeQualified: false, originalPaymentRecordCount: 0 })
    .mockResolvedValueOnce(qualified("RECOVERY_REQUIRED", { code: purchase.orderCode, placementKey: "previous-original-key" }))
    .mockResolvedValueOnce(qualified("RECOVERY_REQUIRED", { recoveryAction: "RESUME_ORIGINAL_PLACEMENT" }));
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByRole("button", { name: "Resume original purchase" });
  expect(vi.mocked(request).mock.lastCall?.[0]).toBe(checkout + "/checkouts/commands/previous-original-key");
  expect(vi.mocked(request).mock.calls.some(call => /\/calculations|\/place$|wallet/.test(call[0]))).toBe(false);
});

it("unavailable cancellation-reference storage prevents sending an unretainable command", async () => {
  ready(); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  const user = userEvent.setup(); await waitFor(() => expect(screen.getByRole("button", { name: "Cancel selected purchase" })).toBeEnabled());
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage unavailable"); });
  await user.click(screen.getByRole("button", { name: "Cancel selected purchase" }));
  await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await screen.findByText("The original operation reference cannot be saved. Nothing new was sent.");
  expect(vi.mocked(request).mock.calls.some(call => call[0].endsWith("/cancel"))).toBe(false); storage.mockRestore();
});

it("authoritative original placement recovery takes precedence over a delayed local cancellation hint", async () => {
  const storageKey = "circa.auction.cancellation:" + JSON.stringify(["CUSTOMER", session.loginId, session.enterpriseCode,
    purchase.roundCode, purchase.storeCode, offer.code]);
  sessionStorage.setItem(storageKey, JSON.stringify({ cartCode: purchase.cartCode, orderCode: purchase.orderCode, cancellationKey: key + ":cancel" }));
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce(qualified("RECOVERY_REQUIRED", { recoveryAction: "RESUME_ORIGINAL_PLACEMENT" }));
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  await screen.findByRole("button", { name: "Resume original purchase" });
  expect(screen.queryByRole("button", { name: "Retry original cancellation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Review selected purchase" })).toBeNull();
});

it("a silently discarded cancellation hint prevents dispatch through shared verified retention", async () => {
  ready(); render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  const user = userEvent.setup(); await waitFor(() => expect(screen.getByRole("button", { name: "Cancel selected purchase" })).toBeEnabled());
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Cancel selected purchase" }));
  await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await screen.findByText("The original operation reference cannot be saved. Nothing new was sent.");
  expect(vi.mocked(request).mock.calls.some(call => call[0].endsWith("/cancel"))).toBe(false); storage.mockRestore();
});

it("a late confirmed cancellation cannot clear a changed original reference", async () => {
  ready(); let finish!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<AuctionPurchase offer={offer} session={session} purchase={purchase} onComplete={vi.fn()} />);
  const user = userEvent.setup(); await waitFor(() => expect(screen.getByRole("button", { name: "Cancel selected purchase" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Cancel selected purchase" }));
  await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  const storageKey = sessionStorage.key(0)!;
  const newer = JSON.stringify({ cancellationKey: "another-owner-command", cartCode: purchase.cartCode, orderCode: purchase.orderCode });
  sessionStorage.setItem(storageKey, newer);
  await act(async () => { finish(qualified("CANCELLED", { cancellationKey: key + ":cancel" })); });
  await screen.findByText("The selected purchase is cancelled.");
  expect(sessionStorage.getItem(storageKey)).toBe(newer);
});
