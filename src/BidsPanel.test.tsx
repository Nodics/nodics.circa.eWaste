/** Auction renderer and request-contract fixtures only; no live commerce, wallet or browser acceptance. */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BidComposer, BidHistory, type AuctionRound } from "./BidsPanel";
import { request, commandKey, type Offer } from "./api";
vi.mock("./api", () => ({ API: "/nodics/eWaste/v0", request: vi.fn(), commandKey: vi.fn() }));
const session = { token: "original", loginId: "buyer" };
const offer: Offer & { biddingMode: string; auction: { roundCode: string; storeCode: string } } = {
  code: "product", name: "Recovered device bundle", kind: "ASSET", rewardPrice: 10, revision: 1,
  biddingAvailable: true, biddingMode: "AUCTION", auction: { roundCode: "round", storeCode: "store" },
};
function round(changes: Partial<AuctionRound> = {}): AuctionRound {
  return { code: "round", publicationCode: "publication", productCode: "product", storeCode: "store", variantCode: "unit",
    revision: 7, status: "OPEN", participantRole: "VIEWER", floor: "10.00", currency: "POINTS", startsAt: null,
    endsAt: new Date(Date.now() + 3600000).toISOString(), graceEndsAt: new Date(Date.now() + 7200000).toISOString(),
    holdTiming: "RESERVE_ON_BID", highestAmount: "50.00", bidCount: 2, processing: false,
    allowedActions: ["PLACE"], bids: [], ...changes };
}
const own = { code: "own-bid", amount: "20.00", revision: 3, status: "OPEN", fundsStatus: "RESERVED", allowedActions: ["UPDATE", "WITHDRAW"] };
beforeEach(() => { let sequence = 0; vi.mocked(commandKey).mockImplementation(() => "command-" + ++sequence); });
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

it("permits independent equal and lower offers at the listing floor, never the highest-offer floor", async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockResolvedValueOnce(round({ revision: 8, participantRole: "BUYER", bids: [own] }));
  const user = userEvent.setup(); render(<BidComposer offer={offer} session={session} />);
  const amount = await screen.findByLabelText("Offer amount"), button = screen.getByRole("button", { name: "Review offer" });
  await user.type(amount, "9.99"); expect(button).toBeDisabled();
  await user.clear(amount); await user.type(amount, "50.00"); expect(button).toBeEnabled();
  await user.clear(amount); await user.type(amount, "10.00"); expect(button).toBeEnabled();
  expect(screen.getByText("50.00 POINTS")).toBeVisible();
  expect(screen.getByText("No private offers to display.")).toBeVisible();
  await user.click(button); await user.click(screen.getByRole("button", { name: "Confirm offer" }));
  await screen.findByText("Auction decision saved.");
  expect(request).toHaveBeenLastCalledWith("/nodics/bidding/v0/auctions/round/commands", session,
    { storeCode: "store", action: "PLACE", amount: "10.00", confirmed: true, expectedRevision: 7, idempotencyKey: "command-1" });
  expect(screen.getByRole("button", { name: "Review offer" })).toBeDisabled();
  await user.type(screen.getByLabelText("Offer amount"), "12.00");
  expect(screen.getByRole("button", { name: "Review offer" })).toBeEnabled();
});

it("updates only the returned own offer with both revisions and exact decimal amount", async () => {
  vi.mocked(request).mockResolvedValueOnce(round({ participantRole: "BUYER", bids: [own] }))
    .mockResolvedValueOnce(round({ revision: 8, participantRole: "BUYER", bids: [{ ...own, amount: "10.25", revision: 4 }] }));
  const user = userEvent.setup(); render(<BidComposer offer={offer} session={session} />);
  await user.click(await screen.findByRole("button", { name: "Update offer" }));
  const amount = screen.getByLabelText("Updated offer amount"); await user.clear(amount); await user.type(amount, "10.25");
  await user.click(screen.getByRole("button", { name: "Confirm update" }));
  await screen.findByText("10.25 POINTS");
  expect(vi.mocked(request).mock.lastCall?.[2]).toEqual({ storeCode: "store", action: "UPDATE", confirmed: true,
    expectedRevision: 7, bidCode: "own-bid", bidRevision: 3, amount: "10.25", idempotencyKey: "command-1" });
});

it("withdraws with original identity and renders backend release outcome", async () => {
  vi.mocked(request).mockResolvedValueOnce(round({ participantRole: "BUYER", bids: [own] }))
    .mockResolvedValueOnce(round({ revision: 8, participantRole: "BUYER", bids: [{ ...own, status: "WITHDRAWN", fundsStatus: "RELEASED", allowedActions: [] }] }));
  const user = userEvent.setup(); render(<BidComposer offer={offer} session={session} />);
  await user.click(await screen.findByRole("button", { name: "Withdraw offer" }));
  expect(screen.getByText("Withdraw this offer and release its remaining hold.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  await screen.findByText("Funds: released");
  expect(vi.mocked(request).mock.lastCall?.[2]).toEqual(expect.objectContaining({ action: "WITHDRAW", bidCode: "own-bid", bidRevision: 3 }));
});

it("grace permits seller selection of a lower offer but no placement, update, withdrawal or cancel", async () => {
  vi.mocked(request).mockResolvedValueOnce(round({ status: "GRACE", participantRole: "SELLER", endsAt: new Date(Date.now() - 1000).toISOString(),
    allowedActions: ["SELECT"], bids: [{ ...own, allowedActions: [] }, { ...own, code: "high", amount: "50.00", allowedActions: [] }] }))
    .mockResolvedValueOnce(round({ revision: 8, status: "SELECTED", allowedActions: [], bids: [],
      selection: { bidCode: "own-bid", amount: "20.00", status: "CHECKOUT_READY", orderCode: "original-order" } }));
  const user = userEvent.setup(); render(<BidComposer offer={offer} session={session} />);
  await screen.findByText("Seller decision period");
  expect(screen.getByText(/highest eligible offer is selected/)).toBeVisible();
  for (const name of ["Review offer", "Update offer", "Withdraw offer", "Cancel auction"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  await user.click(screen.getAllByRole("button", { name: "Select offer" })[0]);
  await user.click(screen.getByRole("button", { name: "Confirm selection" }));
  await screen.findByText("Order: original-order");
  expect(vi.mocked(request).mock.lastCall?.[2]).toEqual(expect.objectContaining({ action: "SELECT", bidCode: "own-bid" }));
  expect(screen.queryByRole("button", { name: "Select offer" })).toBeNull();
});

it("expired intake cannot retain stale update controls and the browser never selects the fallback", async () => {
  vi.mocked(request).mockResolvedValueOnce(round({ participantRole: "SELLER", endsAt: new Date(Date.now() - 1000).toISOString(),
    graceEndsAt: new Date(Date.now() - 1).toISOString(), allowedActions: ["PLACE", "SELECT", "CANCEL"], bids: [own] }));
  render(<BidComposer offer={offer} session={session} />);
  await screen.findByText("Auction intake closed");
  expect(screen.queryByRole("button", { name: /Select offer|Update offer|Withdraw offer|Cancel auction|Review offer/ })).toBeNull();
  expect(vi.mocked(request).mock.calls.every(call => call[2] === undefined)).toBe(true);
});

it("reserve-on-selection shows the server timing and blank-end rounds do not invent a deadline", async () => {
  vi.mocked(request).mockResolvedValueOnce(round({ endsAt: null, graceEndsAt: null, holdTiming: "RESERVE_ON_SELECTION" }));
  render(<BidComposer offer={offer} session={session} />);
  await screen.findByText("Funds are held only when selected.");
  expect(screen.getByText("No scheduled closing time")).toBeVisible();
  expect(screen.queryByText(/highest eligible offer is selected/)).toBeNull();
});

it("an uncertain confirmation retains its key and exact terms on retry", async () => {
  vi.mocked(request).mockResolvedValueOnce(round()).mockRejectedValueOnce(new Error("Outcome unavailable"))
    .mockResolvedValueOnce(round({ revision: 8, participantRole: "BUYER", bids: [own] }));
  const user = userEvent.setup(); render(<BidComposer offer={offer} session={session} />);
  await user.type(await screen.findByLabelText("Offer amount"), "20.00");
  await user.click(screen.getByRole("button", { name: "Review offer" }));
  await user.click(screen.getByRole("button", { name: "Confirm offer" }));
  await screen.findByRole("alert");
  const first = vi.mocked(request).mock.lastCall?.[2];
  await user.click(screen.getByRole("button", { name: "Confirm offer" }));
  await screen.findByText("Auction decision saved.");
  expect(vi.mocked(request).mock.lastCall?.[2]).toEqual(first);
  expect(commandKey).toHaveBeenCalledTimes(1);
});

it("auction mode missing round evidence cannot fall back to ordinary bids", async () => {
  render(<BidComposer offer={{ ...offer, auction: undefined }} session={session} />);
  await screen.findByText("The published auction round is unavailable.");
  expect(screen.queryByRole("button", { name: "Review bid" })).toBeNull(); expect(request).not.toHaveBeenCalled();
});

it("history uses participant projections even when the listing is no longer in the catalogue", async () => {
  vi.mocked(request).mockResolvedValueOnce({ bids: [], auctions: [round({ status: "FAILED", participantRole: "BUYER", bids: [own],
    allowedActions: [], selection: { bidCode: own.code, amount: own.amount, status: "FAILED_RECONCILED" } })] });
  render(<BidHistory session={session} customerCode="customer" offers={[]} assets={[]} wallet={null} onComplete={() => {}} />);
  await screen.findByText("Purchase failed and reconciled. This round will not be re-awarded.");
  expect(screen.getByText("Your private offers")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Select offer" })).toBeNull();
  expect(screen.queryByText("No bids yet. Open an asset to make an offer.")).toBeNull();
});

it("superseded legacy history is unavailable rather than a false empty auction list", async () => {
  vi.mocked(request).mockResolvedValueOnce({ bids: [] });
  render(<BidHistory session={session} customerCode="buyer" offers={[]} assets={[]} wallet={null} onComplete={() => {}} />);
  await screen.findByText("Auction history is unavailable.");
  expect(screen.queryByText("No bids yet. Open an auction to make an offer.")).toBeNull();
});

it("changing session clears private history and ignores a late previous-session read", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce({ bids: [], auctions: [] });
  const props = { customerCode: "customer", offers: [], assets: [], wallet: null, onComplete: vi.fn() };
  const view = render(<BidHistory {...props} session={session} />);
  view.rerender(<BidHistory {...props} session={{ token: "other", loginId: "other" }} />);
  await screen.findByText("No bids yet. Open an auction to make an offer.");
  await act(async () => resolve({ bids: [], auctions: [round({ bids: [{ ...own, amount: "777.00" }] })] }));
  expect(screen.queryByText("777.00 POINTS")).toBeNull();
});

it("Circa no longer submits superseded negotiation commands", () => {
  render(<BidComposer offer={{ ...offer, biddingMode: "NEGOTIATION", auction: undefined }} session={session} />);
  expect(screen.getByText("This listing is not available for auction offers.")).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});

for (const kind of ["CUSTOMER", "ENTERPRISE"] as const) it(`starts a reviewed fresh publication round for the backend-admitted ${kind} seller`, async () => {
  const signed = { ...session, kind, enterpriseCode: "owner" };
  const publication = { publicationCode: "publication", productCode: "product", storeCode: "store", variantCodes: ["unit"],
    floor: "10.00", currency: "POINTS", startsAt: null, endsAt: null, participantRole: "SELLER", allowedActions: ["OPEN"] };
  vi.mocked(request).mockResolvedValueOnce(publication).mockRejectedValueOnce(Error("Outcome unknown"))
    .mockResolvedValueOnce(round({ participantRole: "SELLER", allowedActions: ["CANCEL"] }));
  const user = userEvent.setup(); render(<BidComposer session={signed} offer={{ ...offer, auction: undefined,
    commerce: { storeCode: "store", variantCode: "unit", currency: "POINTS", jurisdiction: "AE", locale: "en", programCode: "program", rewardTypeCode: "points" } }} />);
  await user.click(await screen.findByRole("button", { name: "Start new auction round" }));
  await user.click(screen.getByRole("button", { name: "Confirm new round" }));
  await screen.findByText(/Retry this original confirmation/);
  const original = vi.mocked(request).mock.lastCall;
  await user.click(screen.getByRole("button", { name: "Confirm new round" }));
  await screen.findByText("Received offers");
  expect(vi.mocked(request).mock.lastCall).toEqual(original);
  expect(original).toEqual(["/nodics/bidding/v0/auctions", signed, {
    productCode: "product", storeCode: "store", variantCode: "unit", publicationCode: "publication", confirmed: true, idempotencyKey: "command-1" }]);
});

it("selected buyer hands the original immutable checkout DTO to common purchase without creating a cart", async () => {
  const purchase = { kind: "AUCTION" as const, roundCode: "round", bidCode: "own-bid", productCode: "product", storeCode: "store",
    variantCode: "unit", cartCode: "original-cart", orderCode: "original-order", priceQuoteCode: "quote", amount: "20", currency: "POINTS",
    expiresAt: new Date(Date.now() + 10000).toISOString() };
  vi.mocked(request).mockResolvedValueOnce(round({ status: "SELECTED", participantRole: "BUYER", allowedActions: [],
    selection: { bidCode: "own-bid", amount: "20", status: "CHECKOUT_READY", purchase } }));
  const consume = vi.fn(), user = userEvent.setup(); render(<BidComposer offer={offer} session={session} onSelectedPurchase={consume} />);
  await user.click(await screen.findByRole("button", { name: "Review selected purchase" }));
  expect(consume).toHaveBeenCalledWith(purchase); expect(request).toHaveBeenCalledTimes(1);
});

it("selected buyer has a stable re-read link when the parent purchase callback is not mounted", async () => {
  const purchase = { kind: "AUCTION" as const, roundCode: "round", bidCode: "own-bid", productCode: "product", storeCode: "store",
    variantCode: "unit", cartCode: "cart", orderCode: "order", priceQuoteCode: "quote", amount: "20", currency: "POINTS", expiresAt: "2999-01-01" };
  vi.mocked(request).mockResolvedValueOnce(round({ status: "SELECTED", participantRole: "BUYER", allowedActions: [],
    selection: { bidCode: "own-bid", amount: "20", status: "CHECKOUT_READY", purchase } }));
  render(<BidComposer offer={offer} session={session} />);
  expect(await screen.findByRole("link", { name: "Review selected purchase" })).toHaveAttribute("href", "/shop/product?auctionRound=round&storeCode=store");
});
