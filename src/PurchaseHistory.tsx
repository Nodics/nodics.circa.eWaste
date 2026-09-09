import { useEffect, useState } from "react";
import { API, request, type Session, type Offer } from "./api";
import { OrderReview } from "./OrderReview";
type Entitlement = {
  status: string;
  evidence?: {
    merchantRedemption?: {
      receiptCode?: string;
      merchantReceiptReference?: string;
      code?: string;
      confirmedAt?: string;
    };
  };
  code: string;
  productCode: string;
  orderCode: string;
  claimStatus: string;
  purchasedAt: string;
};
type Purchases = {
  orders: {
    code: string;
    totalAmount: string;
    currency: string;
    created: string;
    status: string;
  }[];
  entitlements: Entitlement[];
};
export function PurchaseHistory({
  session,
  offers,
}: {
  session: Session;
  offers: Offer[];
}) {
  const [data, setData] = useState<Purchases | null>(null),
    [error, setError] = useState(""),
    [revealed, setRevealed] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    request<Purchases>(`${API}/purchases`, session)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session, refresh]);
  return (
    <section className="purchase-history">
      <h2>Your purchases & coupons</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error ? (
        <p role="status">Loading purchases…</p>
      ) : (
        data && (
          <>
            <div className="submission-grid">
              {data.entitlements.map((e) => (
                <article className="conversation-card" key={e.code}>
                  <span className="eyebrow">
                    Owned coupon · {e.claimStatus.toLowerCase()}
                  </span>
                  <h3>
                    {offers.find((o) => o.code === e.productCode)?.name ||
                      e.productCode}
                  </h3>
                  <p>
                    Purchased{" "}
                    {new Date(e.purchasedAt).toLocaleDateString("en-GB")}
                  </p>
                  {e.status === "ACTIVE" &&
                    (revealed[e.code] ? (
                      <p className="coupon-token">{revealed[e.code]}</p>
                    ) : (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy(e.code);
                          setError("");
                          try {
                            const result = await request<{
                              token?: string;
                              code?: string;
                              couponToken?: string;
                              protectedToken?: string;
                              tokenAvailable?: boolean;
                              reasonCode?: string;
                            }>(
                              `${API}/coupons/${encodeURIComponent(e.code)}/reveal`,
                              session,
                              { confirmed: true },
                            );
                            const token =
                              result.token ||
                              result.couponToken ||
                              result.protectedToken;
                            if (!token)
                              throw new Error(
                                "The coupon code is not available yet. Keep your purchase reference.",
                              );
                            setRevealed((v) => ({ ...v, [e.code]: token }));
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Could not reveal coupon.",
                            );
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        {busy === e.code ? "Opening…" : "Show coupon code"}
                      </button>
                    ))}
                  {e.claimStatus === "CLAIMED" && (
                    <p role="status">
                      Awaiting merchant fulfillment confirmation. Reference:{" "}
                      {e.evidence?.merchantRedemption?.code}
                    </p>
                  )}
                  {e.claimStatus === "REDEEMED" && (
                    <p>
                      Merchant receipt:{" "}
                      <strong>
                        {e.evidence?.merchantRedemption
                          ?.merchantReceiptReference ||
                          e.evidence?.merchantRedemption?.receiptCode}
                      </strong>
                    </p>
                  )}
                  <small>
                    Local sample offer. Use only with the sample partner
                    journey.
                  </small>
                </article>
              ))}
            </div>
            <div className="activity-list">
              {data.orders.map((o) => (
                <div key={o.code}>
                  <span>
                    <strong>
                      {o.totalAmount} {o.currency.toLowerCase()}
                    </strong>
                    <small>{o.code}</small>
                    <OrderReview code={o.code} session={session} />
                  </span>
                  <time>{new Date(o.created).toLocaleDateString("en-GB")}</time>
                </div>
              ))}
              {!data.orders.length && (
                <p>Your completed purchases will appear here.</p>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}
