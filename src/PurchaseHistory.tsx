/** Customer-owned purchase history; Commerce owns redemption state and evidence. */
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { API, request, type Session, type Offer } from "./api";
import { OrderReview } from "./OrderReview";
import "./purchaseReview.css";
type Entitlement = {
  status: string;
  evidence?: {
    merchantRedemption?: {
      receiptCode?: string;
      merchantReceiptReference?: string;
      code?: string;
      confirmedAt?: string;
      merchantCode?: string;
      storeRef?: { moduleName?: string; schemaName?: string; code?: string };
      storeRevision?: number;
    };
  };
  code: string;
  productCode: string;
  orderCode: string;
  claimStatus: string;
  purchasedAt: string;
  validTo?: string;
  purchaseTerms?: string[];
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
/** Keeps bounded display fields only; malformed owner reads never unlock coupon reveal. */
function purchases(value: Purchases): Purchases {
  const bounded = (item: unknown, maximum = 192): item is string =>
    typeof item === "string" && item.length > 0 && item.length <= maximum;
  if (
    !value ||
    !Array.isArray(value.orders) ||
    !Array.isArray(value.entitlements) ||
    value.orders.length > 1000 ||
    value.entitlements.length > 1000 ||
    value.orders.some(
      (item) =>
        !item ||
        !bounded(item.code) ||
        !bounded(item.totalAmount, 64) ||
        !bounded(item.currency, 32) ||
        !bounded(item.status, 64) ||
        !bounded(item.created, 64) ||
        !Number.isFinite(Date.parse(item.created)),
    ) ||
    value.entitlements.some(
      (item) =>
        !item ||
        !bounded(item.code) ||
        !bounded(item.productCode) ||
        !bounded(item.orderCode) ||
        !bounded(item.status, 64) ||
        !bounded(item.claimStatus, 64) ||
        !bounded(item.purchasedAt, 64) ||
        !Number.isFinite(Date.parse(item.purchasedAt)) ||
        (item.validTo !== undefined && !bounded(item.validTo, 64)) ||
        (item.purchaseTerms !== undefined &&
          (!Array.isArray(item.purchaseTerms) ||
            item.purchaseTerms.length > 100 ||
            item.purchaseTerms.some((term) => !bounded(term, 4000)))),
    ) ||
    new Set(value.orders.map((item) => item.code)).size !==
      value.orders.length ||
    new Set(value.entitlements.map((item) => item.code)).size !==
      value.entitlements.length
  )
    throw new Error(
      "Purchase history could not be confirmed. Refresh before using a coupon.",
    );
  return {
    orders: value.orders.map(
      ({ code, totalAmount, currency, created, status }) => ({
        code,
        totalAmount,
        currency,
        created,
        status,
      }),
    ),
    entitlements: value.entitlements.map((item) => {
      const evidence = item.evidence?.merchantRedemption;
      const merchantRedemption: NonNullable<
        Entitlement["evidence"]
      >["merchantRedemption"] = {};
      for (const field of [
        "receiptCode",
        "merchantReceiptReference",
        "code",
        "confirmedAt",
        "merchantCode",
      ] as const)
        if (bounded(evidence?.[field]))
          merchantRedemption[field] = evidence[field];
      if (
        evidence?.storeRef?.moduleName === "store" &&
        evidence.storeRef.schemaName === "store" &&
        bounded(evidence.storeRef.code) &&
        Number.isSafeInteger(evidence.storeRevision) &&
        Number(evidence.storeRevision) > 0
      ) {
        merchantRedemption.storeRef = {
          moduleName: "store",
          schemaName: "store",
          code: evidence.storeRef.code,
        };
        merchantRedemption.storeRevision = evidence.storeRevision;
      }
      return {
        code: item.code,
        productCode: item.productCode,
        orderCode: item.orderCode,
        status: item.status,
        claimStatus: item.claimStatus,
        purchasedAt: item.purchasedAt,
        ...(item.validTo === undefined ? {} : { validTo: item.validTo }),
        ...(item.purchaseTerms === undefined
          ? {}
          : { purchaseTerms: [...item.purchaseTerms] }),
        ...(evidence ? { evidence: { merchantRedemption } } : {}),
      };
    }),
  };
}
/** Displays owner-backed history; freshness controls never alter entitlement eligibility. */
export function PurchaseHistory({
  session,
  offers,
  headingLevel: Heading = "h2",
  refreshIntervalMs = 60000,
}: {
  session: Session;
  offers: Offer[];
  headingLevel?: "h1" | "h2";
  refreshIntervalMs?: number;
}) {
  const [snapshot, setSnapshot] = useState<{
      session: Session;
      data: Purchases;
    } | null>(null),
    [error, setError] = useState(""),
    [revealed, setRevealed] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const data = snapshot?.session === session ? snapshot.data : null;
  useEffect(() => {
    let active = true;
    generation.current++;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRevealed({});
    setBusy("");
    request<Purchases>(`${API}/purchases`, session, undefined, "GET", {
      signal: controller.signal,
    })
      .then((d) => {
        const data = purchases(d);
        if (active) setSnapshot({ session, data });
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      generation.current++;
      controller.abort();
    };
  }, [session, refresh]);
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !loading && !busy)
        setRefresh((value) => value + 1);
    };
    const interval =
      Number.isSafeInteger(refreshIntervalMs) &&
      refreshIntervalMs >= 15000 &&
      refreshIntervalMs <= 300000
        ? refreshIntervalMs
        : 60000;
    const timer = window.setInterval(refreshVisible, interval);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [session, loading, busy, refreshIntervalMs]);
  return (
    <section className="purchase-history">
      <Heading>Your purchases & coupons</Heading>
      <button
        className="secondary"
        disabled={loading || !!busy}
        onClick={() => setRefresh((value) => value + 1)}
      >
        <RefreshCw size={16} aria-hidden="true" />{" "}
        {loading ? "Refreshing…" : "Refresh purchases"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (loading || error) && (
        <p role="status">
          Displayed history may be out of date. Coupon availability requires a
          successful refresh.
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
                  {e.validTo && (
                    <p>
                      {Number.isFinite(Date.parse(e.validTo))
                        ? `${Date.parse(e.validTo) <= Date.now() ? "Expired" : "Valid until"} ${new Date(e.validTo).toLocaleDateString("en-GB")}`
                        : "Validity unavailable"}
                    </p>
                  )}
                  {!!e.purchaseTerms?.length && (
                    <details>
                      <summary>Purchase terms</summary>
                      <ul>
                        {e.purchaseTerms.map((term, index) => (
                          <li key={index}>{term}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {e.status === "ACTIVE" &&
                    e.claimStatus !== "REDEEMED" &&
                    (!e.validTo ||
                      (Number.isFinite(Date.parse(e.validTo)) &&
                        Date.parse(e.validTo) > Date.now())) &&
                    !loading &&
                    !error &&
                    (revealed[e.code] ? (
                      <p className="coupon-token">{revealed[e.code]}</p>
                    ) : (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={async () => {
                          const attempt = generation.current;
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
                              status?: string;
                            }>(
                              `${API}/coupons/${encodeURIComponent(e.code)}/reveal`,
                              session,
                              { confirmed: true },
                            );
                            const token =
                              result.token ||
                              result.couponToken ||
                              result.protectedToken;
                            if (
                              result.status !== "REVEALED" ||
                              typeof token !== "string" ||
                              !token ||
                              token.length > 2048
                            )
                              throw new Error(
                                "The coupon code is not available yet. Keep your purchase reference.",
                              );
                            if (attempt !== generation.current) return;
                            setRevealed((v) => ({ ...v, [e.code]: token }));
                          } catch (err) {
                            if (attempt !== generation.current) return;
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Could not reveal coupon.",
                            );
                          } finally {
                            if (attempt === generation.current) setBusy("");
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
                    <>
                      <p>
                        Merchant receipt:{" "}
                        <strong>
                          {e.evidence?.merchantRedemption
                            ?.merchantReceiptReference ||
                            e.evidence?.merchantRedemption?.receiptCode}
                        </strong>
                      </p>
                      {e.evidence?.merchantRedemption?.confirmedAt &&
                        Number.isFinite(
                          Date.parse(e.evidence.merchantRedemption.confirmedAt),
                        ) && (
                          <p>
                            Redeemed{" "}
                            <time
                              dateTime={
                                e.evidence.merchantRedemption.confirmedAt
                              }
                            >
                              {new Date(
                                e.evidence.merchantRedemption.confirmedAt,
                              ).toLocaleString("en-GB")}
                            </time>
                          </p>
                        )}
                      {e.evidence?.merchantRedemption?.merchantCode && (
                        <p>
                          Merchant: {e.evidence.merchantRedemption.merchantCode}
                        </p>
                      )}
                      {e.evidence?.merchantRedemption?.storeRef?.moduleName ===
                        "store" &&
                        e.evidence.merchantRedemption.storeRef.schemaName ===
                          "store" &&
                        /^[A-Za-z0-9_.:-]{1,128}$/.test(
                          e.evidence.merchantRedemption.storeRef.code || "",
                        ) &&
                        Number.isSafeInteger(
                          e.evidence.merchantRedemption.storeRevision,
                        ) &&
                        Number(e.evidence.merchantRedemption.storeRevision) >
                          0 && (
                          <p>
                            Outlet:{" "}
                            {e.evidence.merchantRedemption.storeRef.code}
                          </p>
                        )}
                    </>
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
