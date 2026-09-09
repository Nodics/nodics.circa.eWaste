import { useEffect, useRef, useState } from "react";
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
export type Bid = {
  code: string;
  buyerId: string;
  sellerId: string;
  productCode: string;
  displayName?: string;
  sourceRef?: { code: string };
  amount: string;
  currency: string;
  status: string;
  revision: number;
  expiresAt: string;
  orderCode?: string;
  purchaseStatus?: string;
};
/** Collects proposed terms without reserving funds; Commerce confirms the participant and published offer. */
export function BidComposer({
  offer,
  session,
}: {
  offer: Offer;
  session: Session;
}) {
  const [amount, setAmount] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Bid | null>(null);
  const key = useRef(commandKey());
  const valid = /^[1-9]\d*$/.test(amount) && Number(amount) <= 100000;
  return (
    <section className="bid-composer">
      <h2>Make an offer</h2>
      <p>
        Propose a price for digital ownership. Points are reserved only when you
        check out after the seller accepts. Acceptance does not guarantee
        availability.
      </p>
      {result ? (
        <div role="status">
          <p>Your bid of {result.amount} points is awaiting the seller.</p>
          <a className="text-link" href="/account">
            Manage your bids in My Account
          </a>
        </div>
      ) : (
        <>
          <label>
            Bid in reward points
            <input
              inputMode="numeric"
              type="number"
              min="1"
              max="100000"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={!valid || busy}
            onClick={() => {
              setError("");
              setReview(true);
            }}
          >
            Review bid
          </button>
        </>
      )}
      {review && (
        <ReviewDialog
          title="Review your bid"
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <h3>{offer.name}</h3>
          <p>
            You are offering <strong>{amount} reward points</strong>.
          </p>
          <p>
            No points move now. You can withdraw before acceptance. The bid
            expires after the configured validity period.
          </p>
          {error && (
            <p className="error" role="alert">
              {error} Check My Account before starting another bid.
            </p>
          )}
          <button
            className="primary full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const bid = await request<Bid>(
                  `${API}/marketplace/${encodeURIComponent(offer.code)}/bids`,
                  session,
                  { amount, confirmed: true, idempotencyKey: key.current },
                );
                setResult(bid);
                setReview(false);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not submit the bid.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Submitting…" : "Confirm bid"}
          </button>
        </ReviewDialog>
      )}
    </section>
  );
}
/** Displays only Commerce-returned participant bids; reviewed actions use durable identities and owning APIs. */
export function BidHistory({
  session,
  customerCode,
  offers,
  assets,
  wallet,
  onComplete,
}: {
  session: Session;
  customerCode: string;
  offers: Offer[];
  assets: Asset[];
  wallet: Wallet | null;
  onComplete: () => void;
}) {
  const [data, setData] = useState<Bid[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<{
      bid: Bid;
      action: string;
      key: string;
    } | null>(null),
    [receipt, setReceipt] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    request<{ bids: Bid[] }>(`${API}/bids`, session)
      .then((result) => {
        if (active) setData(result.bids);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session, refresh]);
  const available = Number(
    wallet?.balances.find((item) => item.rewardTypeCode === "points")
      ?.available || 0,
  );
  function review(bid: Bid, action: string) {
    setSelected({
      bid,
      action,
      key:
        action === "PURCHASE"
          ? bid.code + ":checkout"
          : bid.code + ":" + action,
    });
    setError("");
    setReceipt("");
  }
  return (
    <section className="purchase-history">
      <div className="filter-toolbar">
        <h2>Your bids</h2>
        <button
          className="text-button"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh bids
        </button>
      </div>
      <p>
        Incoming offers and your proposed purchases. Digital ownership only;
        physical delivery is not included.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {receipt && <p role="status">{receipt}</p>}
      {!data && !error ? (
        <p role="status">Loading bids…</p>
      ) : (
        <div className="submission-grid">
          {data?.map((bid) => {
            const seller = bid.sellerId === customerCode,
              offer = offers.find((item) => item.code === bid.productCode),
              owned = assets.some(
                (asset) => asset.code === bid.sourceRef?.code,
              );
            return (
              <article className="conversation-card" key={bid.code}>
                <span className="eyebrow">
                  {seller ? "Incoming bid" : "Your offer"} ·{" "}
                  {bid.purchaseStatus === "COMPLETED"
                    ? "Purchased"
                    : bid.status.toLowerCase()}
                </span>
                <h3>
                  {bid.displayName || offer?.name || "Digital asset offer"}
                </h3>
                <p>
                  <strong>{bid.amount} points</strong>
                </p>
                <p>
                  Valid until {new Date(bid.expiresAt).toLocaleString("en-GB")}
                </p>
                {["OPEN", "ACCEPTING"].includes(bid.status) &&
                  (seller ? (
                    <div className="bid-actions">
                      <button
                        className="primary"
                        onClick={() => review(bid, "ACCEPT")}
                      >
                        Review acceptance
                      </button>
                      <button
                        className="secondary"
                        disabled={bid.status === "ACCEPTING"}
                        onClick={() => review(bid, "REJECT")}
                      >
                        Review rejection
                      </button>
                    </div>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => review(bid, "WITHDRAW")}
                    >
                      Review withdrawal
                    </button>
                  ))}
                {!seller &&
                  bid.status === "ACCEPTED" &&
                  bid.purchaseStatus !== "COMPLETED" &&
                  (offer ? (
                    <>
                      <p>Available: {wallet ? available : "…"} points</p>
                      <button
                        className="primary"
                        disabled={!wallet || available < Number(bid.amount)}
                        onClick={() => review(bid, "PURCHASE")}
                      >
                        Review accepted purchase
                      </button>
                    </>
                  ) : (
                    <p>
                      The offer is unavailable. Refresh before attempting a
                      purchase.
                    </p>
                  ))}
                {!seller && bid.purchaseStatus === "COMPLETED" && !owned && (
                  <button
                    className="secondary"
                    onClick={() => review(bid, "PURCHASE")}
                  >
                    Complete ownership transfer
                  </button>
                )}
                {bid.orderCode && bid.purchaseStatus === "COMPLETED" && (
                  <small>Order: {bid.orderCode}</small>
                )}
                {offer && (
                  <a
                    className="text-link"
                    href={"/shop/" + encodeURIComponent(bid.productCode)}
                  >
                    View asset details
                  </a>
                )}
              </article>
            );
          })}
          {data?.length === 0 && (
            <p>No bids yet. Open an asset to make an offer.</p>
          )}
        </div>
      )}
      {selected && (
        <ReviewDialog
          title={
            selected.action === "PURCHASE"
              ? "Review accepted purchase"
              : "Review bid decision"
          }
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <h3>{selected.bid.displayName || "Digital asset offer"}</h3>
          <p>{selected.bid.amount} reward points</p>
          <p>
            {selected.action === "PURCHASE"
              ? "Checkout pays the seller and transfers the asset with its attached illustrative carbon. Original approval rewards stay with the contributor."
              : selected.action === "ACCEPT"
                ? "Accept this offered price. No points move until the buyer completes Checkout."
                : selected.action === "WITHDRAW"
                  ? "Withdraw this unaccepted bid. No points have been reserved."
                  : "Reject this bid. No points have been reserved."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (selected.action === "PURCHASE") {
                  const offer = offers.find(
                    (item) => item.code === selected.bid.productCode,
                  );
                  const result = await request<{ message: string }>(
                    `${API}/marketplace/${encodeURIComponent(selected.bid.productCode)}/purchase`,
                    session,
                    {
                      bidCode: selected.bid.code,
                      confirmed: true,
                      expectedRevision: offer?.revision || 0,
                      idempotencyKey: selected.key,
                    },
                  );
                  setReceipt(result.message);
                  onComplete();
                } else {
                  await request(
                    `${API}/bids/${encodeURIComponent(selected.bid.code)}/decisions`,
                    session,
                    {
                      action: selected.action,
                      confirmed: true,
                      expectedRevision: selected.bid.revision,
                      idempotencyKey: selected.key,
                    },
                  );
                  setReceipt("Your bid decision was saved.");
                }
                setSelected(null);
                setRefresh((n) => n + 1);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "The request could not be completed. Refresh bids before starting another request.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Saving…"
              : selected.action === "PURCHASE"
                ? "Confirm accepted purchase"
                : "Confirm bid decision"}
          </button>
        </ReviewDialog>
      )}
    </section>
  );
}
