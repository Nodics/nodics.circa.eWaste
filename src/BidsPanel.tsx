import { useEffect, useRef, useState } from "react";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import {
  API,
  commandKey,
  request,
  type Asset,
  type Offer,
  type Session,
  type Wallet,
} from "./api";
import { ReviewDialog } from "./ReviewDialog";
import { AuctionPurchase } from "./AuctionPurchase";
/** Bidding's participant projection, never a browser-owned ranking or authorization model. */
export type SelectedAuctionPurchase = {
  kind: "AUCTION"; roundCode: string; bidCode: string; storeCode: string; productCode: string; variantCode: string;
  cartCode: string; orderCode: string; priceQuoteCode: string; amount: string; currency: string; expiresAt: string;
};
export type AuctionRound = {
  code: string;
  publicationCode: string;
  productCode: string;
  storeCode: string;
  variantCode: string;
  revision: number;
  status: string;
  participantRole: "SELLER" | "BUYER" | "VIEWER";
  floor: string;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  graceEndsAt: string | null;
  holdTiming: "RESERVE_ON_BID" | "RESERVE_ON_SELECTION";
  highestAmount: string | null;
  bidCount: number;
  processing: boolean;
  allowedActions: string[];
  bids: {
    code: string; amount: string; revision: number; status: string;
    fundsStatus: string; allowedActions: string[];
  }[];
  selection?: { bidCode: string; amount: string; status: string; orderCode?: string; cartCode?: string; expiresAt?: string; purchase?: SelectedAuctionPurchase };
};
type AuctionOffer = Offer & { biddingMode?: string; auction?: { roundCode: string; storeCode: string } };
const BIDDING_API = "/nodics/bidding/v0";

/** Exact decimal comparison is only presentation validation; Loyalty owns reward precision and affordability. */
function meetsFloor(value: string, floor: string) {
  if (value.length > 32 || !/^\d+(\.\d+)?$/.test(value) || !/^\d+(\.\d+)?$/.test(floor)) return false;
  const [whole, fraction = ""] = value.split("."), [minimum, digits = ""] = floor.split(".");
  const scale = Math.max(fraction.length, digits.length);
  const amount = BigInt(whole + fraction.padEnd(scale, "0"));
  return amount > 0n && amount >= BigInt(minimum + digits.padEnd(scale, "0"));
}

/** Displays only returned private offers and submits reviewed revision-bound commands. */
function AuctionRoundPanel({ round: initial, session, name, onChanged, onSelectedPurchase }: {
  round: AuctionRound; session: Session; name: string; onChanged?: () => void;
  onSelectedPurchase?: (purchase: SelectedAuctionPurchase) => void;
}) {
  const [round, setRound] = useState(initial), [amount, setAmount] = useState(""), [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState(""),
    [stale, setStale] = useState(false), [selected, setSelected] = useState<{
      action: string; amount?: string; bidCode?: string; bidRevision?: number; expectedRevision: number; key: string;
    } | null>(null);
  const active = useRef(true), refreshing = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setRound(initial); setStale(false); }, [initial]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const intake = round.status === "OPEN" && (round.startsAt === null || Date.parse(round.startsAt) <= now) &&
    (round.endsAt === null || now < Date.parse(round.endsAt));
  const can = (action: string, actions = round.allowedActions) => !busy && !stale && !round.processing && actions.includes(action) &&
    (["PLACE", "UPDATE", "WITHDRAW", "CANCEL"].includes(action) ? intake
      : action === "SELECT" ? ["OPEN", "GRACE"].includes(round.status) &&
        (round.startsAt === null || Date.parse(round.startsAt) <= now) &&
        (round.graceEndsAt === null || now < Date.parse(round.graceEndsAt)) : false);
  const date = (value: string) => new Date(value).toLocaleString("en-GB");
  function review(action: string, bid?: AuctionRound["bids"][number]) {
    setError(""); setReceipt("");
    setSelected({ action, expectedRevision: round.revision, key: commandKey(),
      ...(bid ? { bidCode: bid.code, bidRevision: bid.revision } : {}),
      ...(action === "PLACE" ? { amount } : action === "UPDATE" ? { amount: bid?.amount } : {}) });
  }
  async function refresh() {
    if (refreshing.current || busy || selected) return;
    refreshing.current = true; setBusy(true); setStale(true); setError("");
    try {
      const result = await request<AuctionRound>(`${BIDDING_API}/auctions/${encodeURIComponent(round.code)}?storeCode=${encodeURIComponent(round.storeCode)}`, session);
      if (active.current) { setRound(result); setStale(false); }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Auction could not be refreshed."); }
    finally { refreshing.current = false; if (active.current) setBusy(false); }
  }
  const confirmation = selected?.action === "PLACE" ? "Confirm offer" : selected?.action === "UPDATE" ? "Confirm update"
    : selected?.action === "WITHDRAW" ? "Confirm withdrawal" : selected?.action === "SELECT" ? "Confirm selection" : "Confirm cancellation";
  return <section className="bid-composer" aria-label={`${name} auction`}>
    <div className="filter-toolbar"><h3>{name}</h3>
      <button type="button" className="text-button" aria-label={`Refresh ${name} auction`} title="Refresh auction"
        disabled={busy || !!selected} onClick={refresh}><RefreshCw size={18} aria-hidden="true" /></button></div>
    <p role="status">{round.processing ? "Operation awaiting confirmation" : round.status === "GRACE" ? "Seller decision period"
      : !intake && round.status === "OPEN" ? "Auction intake closed" : round.status.toLowerCase().replaceAll("_", " ")}</p>
    <dl><dt>Minimum offer</dt><dd>{round.floor} {round.currency}</dd>
      <dt>Highest offer</dt><dd>{round.highestAmount === null ? "No active offers" : `${round.highestAmount} ${round.currency}`}</dd>
      <dt>Active offers</dt><dd>{round.bidCount}</dd></dl>
    {round.startsAt && now < Date.parse(round.startsAt) && <p>Opens {date(round.startsAt)}</p>}
    <p>{round.endsAt ? `Offers close ${date(round.endsAt)}` : "No scheduled closing time"}</p>
    {round.graceEndsAt && <p>Seller selection until {date(round.graceEndsAt)}. Afterward, the highest eligible offer is selected;
      equal offers use the earliest successful submission.</p>}
    <p>{round.holdTiming === "RESERVE_ON_BID" ? "The full offer is held when submitted." : "Funds are held only when selected."}</p>
    {stale && <p role="status">Auction information is not current. Refresh before another decision.</p>}
    {error && !selected && <p className="error" role="alert">{error}</p>}
    {receipt && <p role="status">{receipt}</p>}
    {can("PLACE") && <div className="bid-actions"><label>Offer amount
      <input type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <button className="secondary" disabled={!meetsFloor(amount, round.floor)} onClick={() => review("PLACE")}>Review offer</button></div>}
    <h4>{round.participantRole === "SELLER" ? "Received offers" : "Your private offers"}</h4>
    <ul className="bid-offers">{round.bids.map(bid => <li key={bid.code}>
      <strong>{bid.amount} {round.currency}</strong> <span>{bid.status.toLowerCase()}</span>
      <p>Funds: {bid.fundsStatus.toLowerCase().replaceAll("_", " ")}</p>
      <div className="bid-actions">
        {can("UPDATE", bid.allowedActions) && <button className="secondary" onClick={() => review("UPDATE", bid)}><Pencil size={16} aria-hidden="true" /> Update offer</button>}
        {can("WITHDRAW", bid.allowedActions) && <button className="secondary" onClick={() => review("WITHDRAW", bid)}><X size={16} aria-hidden="true" /> Withdraw offer</button>}
        {can("SELECT") && bid.status === "OPEN" && <button className="primary" onClick={() => review("SELECT", bid)}><Check size={16} aria-hidden="true" /> Select offer</button>}
      </div></li>)}</ul>
    {!round.bids.length && <p>No private offers to display.</p>}
    {can("CANCEL") && <button className="secondary" onClick={() => review("CANCEL")}>Cancel auction</button>}
    {round.selection && <div role="status"><p>Selected offer: {round.selection.amount} {round.currency}</p>
      <p>{round.selection.status === "FAILED_RECONCILED" ? "Purchase failed and reconciled. This round will not be re-awarded."
        : round.selection.status === "CHECKOUT_READY" ? "Selected purchase ready" : "Selected purchase is being prepared"}</p>
      {round.selection.orderCode && <p>Order: {round.selection.orderCode}</p>}
      {round.participantRole === "BUYER" && round.selection.status === "CHECKOUT_READY" && round.selection.purchase &&
        (onSelectedPurchase ? <button className="primary" disabled={busy || stale || !!selected}
          onClick={() => onSelectedPurchase(round.selection!.purchase!)}>Review selected purchase</button>
          : <a className="text-link" href={`/shop/${encodeURIComponent(round.productCode)}?auctionRound=${encodeURIComponent(round.code)}&storeCode=${encodeURIComponent(round.storeCode)}`}>Review selected purchase</a>)}
    </div>}
    {selected && <ReviewDialog title={`Review ${selected.action.toLowerCase()}`} onClose={() => { if (!busy && !error) setSelected(null); }}>
      <h3>{name}</h3>
      {selected.action === "UPDATE" ? <label>Updated offer amount<input type="text" inputMode="decimal" value={selected.amount || ""}
        disabled={busy || !!error} onChange={event => setSelected({ ...selected, amount: event.target.value })} /></label>
        : selected.amount && <p>{selected.amount} {round.currency}</p>}
      <p>{selected.action === "PLACE" || selected.action === "UPDATE"
        ? round.holdTiming === "RESERVE_ON_BID" ? "Confirmation reserves the full new amount on this offer's original hold." : "Funds are checked now and held if this offer is selected."
        : selected.action === "WITHDRAW" ? "Withdraw this offer and release its remaining hold."
          : selected.action === "SELECT" ? "Select this offer once. Other offers are released. A failed purchase will not select another bidder."
            : "Cancel this round and release its holds. Edited listings require a fresh round."}</p>
      {error && <p role="alert" className="error">{error} Retry this same confirmation to recover its original outcome.</p>}
      <button className="primary full" disabled={busy || (!error && !can(selected.action,
        ["UPDATE", "WITHDRAW"].includes(selected.action) ? round.bids.find(bid => bid.code === selected.bidCode)?.allowedActions || [] : round.allowedActions)) ||
        ((selected.action === "PLACE" || selected.action === "UPDATE") && !meetsFloor(selected.amount || "", round.floor))}
        onClick={async () => {
          setBusy(true); setError("");
          try {
            const result = await request<AuctionRound>(`${BIDDING_API}/auctions/${encodeURIComponent(round.code)}/commands`, session,
              { storeCode: round.storeCode, action: selected.action, confirmed: true, expectedRevision: selected.expectedRevision,
                idempotencyKey: selected.key, ...(selected.amount !== undefined ? { amount: selected.amount } : {}),
                ...(selected.bidCode ? { bidCode: selected.bidCode, bidRevision: selected.bidRevision } : {}) });
            if (!active.current) return;
            if (result.code !== round.code || !Number.isSafeInteger(result.revision)) throw new Error("Auction outcome could not be confirmed.");
            setRound(result); setSelected(null); setAmount(""); setStale(false);
            setReceipt(result.processing ? "Original operation is awaiting confirmation." : "Auction decision saved."); onChanged?.();
          } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Auction outcome could not be confirmed."); }
          finally { if (active.current) setBusy(false); }
        }}>{busy ? "Saving..." : confirmation}</button>
    </ReviewDialog>}
  </section>;
}

/** Loads the exact published round reference; missing auction identity never falls back to a negotiation. */
function AuctionComposer({ offer, session, onSelectedPurchase }: { offer: AuctionOffer; session: Session;
  onSelectedPurchase?: (purchase: SelectedAuctionPurchase) => void }) {
  const [round, setRound] = useState<AuctionRound | null>(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const reference = offer.auction;
  useEffect(() => {
    let active = true;
    setRound(null); setError("");
    if (!reference?.roundCode || !reference.storeCode) return;
    request<AuctionRound>(`${BIDDING_API}/auctions/${encodeURIComponent(reference.roundCode)}?storeCode=${encodeURIComponent(reference.storeCode)}`, session)
      .then(result => { if (active) {
        if (result.code !== reference.roundCode || result.storeCode !== reference.storeCode || result.productCode !== offer.code)
          throw new Error("The published auction round could not be confirmed.");
        setRound(result);
      } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Auction is unavailable."); });
    return () => { active = false; };
  }, [reference?.roundCode, reference?.storeCode, offer.code, session, refresh]);
  if (!reference?.roundCode || !reference.storeCode) return <AuctionRoundStart offer={offer} session={session} onSelectedPurchase={onSelectedPurchase} />;
  return round ? <AuctionRoundPanel key={round.code} round={round} session={session} name={offer.name} onSelectedPurchase={onSelectedPurchase} />
    : <section className="bid-composer"><h2>Auction offers</h2>{error ? <><p role="alert" className="error">{error}</p>
      <button className="text-button" title="Retry auction" aria-label="Retry auction" onClick={() => setRefresh(n => n + 1)}><RefreshCw size={18} aria-hidden="true" /></button></>
      : <p role="status">Loading auction...</p>}</section>;
}

/** A fresh published listing is the only source of round terms; customer and Enterprise authority stay with Bidding. */
function AuctionRoundStart({ offer, session, onSelectedPurchase }: { offer: AuctionOffer; session: Session;
  onSelectedPurchase?: (purchase: SelectedAuctionPurchase) => void }) {
  type Publication = { round?: AuctionRound; publicationCode: string; productCode: string; storeCode: string;
    variantCodes: string[]; floor: string; currency: string; startsAt: string | null; endsAt: string | null;
    participantRole: string; allowedActions: string[] };
  const [publication, setPublication] = useState<Publication | null>(null), [round, setRound] = useState<AuctionRound | null>(null),
    [error, setError] = useState(""), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0),
    [review, setReview] = useState<{ key: string; variantCode: string } | null>(null), [variant, setVariant] = useState("");
  const active = useRef(true), storeCode = offer.commerce?.storeCode;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true; setPublication(null); setError("");
    if (!storeCode) { setError("The published auction round is unavailable."); return; }
    request<Publication>(`${BIDDING_API}/auction-publications/${encodeURIComponent(offer.code)}?storeCode=${encodeURIComponent(storeCode)}`, session)
      .then(value => {
        if (!current) return;
        if (value.round) {
          if (value.round.productCode !== offer.code || value.round.storeCode !== storeCode) throw Error("Publication does not match this listing.");
          setRound(value.round); return;
        }
        if (value.productCode !== offer.code || value.storeCode !== storeCode || !Array.isArray(value.variantCodes)) throw Error("Publication could not be confirmed.");
        setPublication(value); setVariant(value.variantCodes.length === 1 ? value.variantCodes[0] : "");
      }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : "Publication is unavailable."); });
    return () => { current = false; };
  }, [offer.code, storeCode, session, attempt]);
  if (round) return <AuctionRoundPanel round={round} session={session} name={offer.name} onSelectedPurchase={onSelectedPurchase} />;
  return <section className="bid-composer"><h2>Auction round</h2>
    {error && <p role="alert">{error}</p>}
    {!publication && !error && <p role="status">Loading auction publication...</p>}
    {publication && <><p>Minimum offer: {publication.floor} {publication.currency}</p>
      <p>{publication.startsAt ? `Opens ${new Date(publication.startsAt).toLocaleString("en-GB")}` : "Opens immediately"}</p>
      <p>{publication.endsAt ? `Closes ${new Date(publication.endsAt).toLocaleString("en-GB")}` : "No scheduled closing time"}</p>
      {publication.participantRole === "SELLER" && publication.allowedActions.includes("OPEN") ? <>
        {publication.variantCodes.length > 1 && <label>Published variant<select value={variant} onChange={event => setVariant(event.target.value)}>
          <option value="">Choose a variant</option>{publication.variantCodes.map(code => <option key={code} value={code}>{code}</option>)}
        </select></label>}
        <button className="primary" disabled={!variant || busy || !!review} onClick={() => { setError(""); setReview({ key: commandKey(), variantCode: variant }); }}>Start new auction round</button>
      </> : <p>A new auction round requires a fresh published listing and completed prior-round releases.</p>}</>}
    {!review && error && <button className="text-button" aria-label="Retry auction publication" title="Retry auction publication"
      onClick={() => setAttempt(value => value + 1)}><RefreshCw size={18} aria-hidden="true" /></button>}
    {review && publication && <ReviewDialog title="Review new auction round" onClose={() => { if (!busy && !error) setReview(null); }}>
      <h3>{offer.name}</h3><p>Minimum offer: {publication.floor} {publication.currency}</p>
      <p>The published dates and price apply to this round. Previous offers do not carry forward.</p>
      {error && <p role="alert">{error} Retry this original confirmation.</p>}
      <button className="primary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try {
          const result = await request<AuctionRound>(`${BIDDING_API}/auctions`, session, { productCode: offer.code,
            storeCode, variantCode: review.variantCode, publicationCode: publication.publicationCode, confirmed: true, idempotencyKey: review.key });
          if (!active.current) return;
          if (result.productCode !== offer.code || result.storeCode !== storeCode || result.publicationCode !== publication.publicationCode)
            throw Error("The new round could not be confirmed.");
          setRound(result); setReview(null);
        } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "The new round could not be confirmed."); }
        finally { if (active.current) setBusy(false); }
      }}>{busy ? "Starting..." : "Confirm new round"}</button>
    </ReviewDialog>}
  </section>;
}

/** Keeps explicitly published auctions separate from the unchanged negotiation workflow. */
export function BidComposer({ offer, session, onSelectedPurchase }: { offer: AuctionOffer; session: Session;
  onSelectedPurchase?: (purchase: SelectedAuctionPurchase) => void }) {
  return offer.biddingMode === "AUCTION" || offer.saleMode === "AUCTION" || offer.auction
    ? <AuctionComposer key={`${session.token}:${offer.code}`} offer={offer} session={session} onSelectedPurchase={onSelectedPurchase} />
    : <p role="status">This listing is not available for auction offers.</p>;
}
/** Auction-only Circa history; legacy negotiation rows never become purchase actions. */
function ParticipantBidHistory({
  session, offers, onComplete, onSelectedPurchase, headingLevel: Heading = "h2",
}: {
  session: Session; customerCode: string; offers: Offer[]; assets: Asset[]; wallet: Wallet | null;
  onComplete: () => void; onSelectedPurchase?: (purchase: SelectedAuctionPurchase) => void;
  headingLevel?: "h1" | "h2";
}) {
  const [auctions, setAuctions] = useState<AuctionRound[] | null>(null), [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<SelectedAuctionPurchase>();
  useEffect(() => {
    let active = true; setAuctions(null); setError("");
    request<{ auctions: AuctionRound[] }>(`${API}/bids`, session)
      .then(result => {
        if (!Array.isArray(result.auctions)) throw new Error("Auction history is unavailable.");
        if (active) setAuctions(result.auctions);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Auctions are unavailable."); });
    return () => { active = false; };
  }, [session, refresh]);
  if (selected) return <AuctionPurchase session={session} purchase={selected}
    offer={{ code: selected.productCode, name: offers.find(offer => offer.code === selected.productCode)?.name || "Selected auction" }}
    onComplete={onComplete} />;
  return <section className="purchase-history">
    <div className="filter-toolbar"><Heading>Your bids</Heading>
      <button className="text-button" onClick={() => setRefresh(n => n + 1)}>Refresh bids</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {!auctions && !error && <p role="status">Loading bids...</p>}
    {auctions?.map(round => <AuctionRoundPanel key={round.code} round={round} session={session}
      name={offers.find(offer => offer.code === round.productCode)?.name || "Auction"}
      onChanged={onComplete} onSelectedPurchase={onSelectedPurchase || setSelected} />)}
    {auctions?.length === 0 && <p>No bids yet. Open an auction to make an offer.</p>}
  </section>;
}

/** Session changes unmount all private offer state and outstanding review identities. */
export function BidHistory(props: Parameters<typeof ParticipantBidHistory>[0]) {
  return <ParticipantBidHistory key={JSON.stringify([props.session.token, props.session.enterpriseCode, props.customerCode])} {...props} />;
}
