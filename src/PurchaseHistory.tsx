/** Shared participant history via Order/Digital. Enterprise ownerRef, ownerId and
 * participantEnterpriseCode bind the buyer independently of merchant enterpriseCode.
 * Reveal consumes only canonical REVEALED/token evidence for the listed providerCode;
 * Commerce owns eligibility, redemption and secret retention, not this renderer. */
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { request, type Session, type Offer } from "./api";
import {
  OrderReview,
  reviewEligibility,
  type ReviewEligibility,
} from "./OrderReview";
import "./purchaseReview.css";
type Entitlement = {
  ownerRef?: { type: "CUSTOMER" | "ENTERPRISE"; code: string };
  ownerId?: string;
  participantEnterpriseCode?: string;
  providerCode?: string;
  digitalDeliveryType: string;
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
  productName?: string;
  orderCode: string;
  claimStatus: string;
  purchasedAt: string;
  validTo?: string;
  purchaseTerms?: string[];
};
type Purchases = {
  orders: {
    reviewEligibility?: ReviewEligibility;
    evidence?: {
      ownerRef?: {
        module: "profile";
        schema: "customer" | "enterprise";
        code: string;
      };
    };
    code: string;
    totalAmount: string;
    currency: string;
    created: string;
    status: string;
  }[];
  entitlements: Entitlement[];
};
/** Keeps bounded display fields only; malformed owner reads never unlock coupon reveal. */
function purchases(value: Purchases, session: Session): Purchases {
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
        (item.productName !== undefined &&
          (!bounded(item.productName, 4000) ||
            /[\u0000-\u001f\u007f]/.test(item.productName))) ||
        !bounded(item.orderCode) ||
        !bounded(item.status, 64) ||
        !bounded(item.digitalDeliveryType, 64) ||
        (item.digitalDeliveryType === "COUPON_CODE" &&
          !bounded(item.providerCode)) ||
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
  // Merchant enterpriseCode is storage namespace, never evidence of the buyer.
  if (
    session.kind === "ENTERPRISE" &&
    (value.entitlements.some(
      (item) =>
        item.ownerRef?.type !== "ENTERPRISE" ||
        item.ownerRef.code !== session.enterpriseCode ||
        item.ownerId !== session.enterpriseCode ||
        item.participantEnterpriseCode !== session.enterpriseCode,
    ) ||
      value.orders.some(
        (item) =>
          item.evidence?.ownerRef?.module !== "profile" ||
          item.evidence.ownerRef.schema !== "enterprise" ||
          item.evidence.ownerRef.code !== session.enterpriseCode,
      ))
  )
    throw new Error("Enterprise purchase ownership could not be confirmed.");
  if (
    session.kind !== "ENTERPRISE" &&
    (value.entitlements.some((item) => item.ownerRef?.type === "ENTERPRISE") ||
      value.orders.some(
        (item) => item.evidence?.ownerRef?.schema === "enterprise",
      ))
  )
    throw new Error("Personal purchase ownership could not be confirmed.");
  return {
    orders: value.orders.map(
      ({
        code,
        totalAmount,
        currency,
        created,
        status,
        reviewEligibility: decision,
      }) => ({
        code,
        totalAmount,
        currency,
        created,
        status,
        reviewEligibility: reviewEligibility(decision),
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
        ...(item.productName === undefined
          ? {}
          : { productName: item.productName }),
        orderCode: item.orderCode,
        status: item.status,
        digitalDeliveryType: item.digitalDeliveryType,
        providerCode: item.providerCode,
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
    Promise.all([
      request<Purchases["orders"]>(
        "/nodics/order/v0/orders?limit=100",
        session,
        undefined,
        "GET",
        { signal: controller.signal },
      ),
      request<Pick<Purchases, "entitlements">>(
        "/nodics/digitalCore/v0/entitlements",
        session,
        undefined,
        "GET",
        { signal: controller.signal },
      ),
    ])
      .then(([orders, issued]) => {
        const data = purchases(
          { orders, entitlements: issued?.entitlements },
          session,
        );
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
                    {e.digitalDeliveryType === "COUPON_CODE"
                      ? "Owned coupon"
                      : "Digital entitlement"}{" "}
                    · {e.claimStatus.toLowerCase()}
                  </span>
                  <h3>
                    {e.productName ||
                      offers.find((o) => o.code === e.productCode)?.name ||
                      (e.digitalDeliveryType === "COUPON_CODE"
                        ? "Purchased coupon"
                        : "Purchased digital item")}
                  </h3>
                  <p>Product reference: {e.productCode}</p>
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
                  {e.digitalDeliveryType === "COUPON_CODE" &&
                    e.status === "ACTIVE" &&
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
                              couponCode?: string;
                              tokenAvailable?: boolean;
                              reasonCode?: string;
                              status?: string;
                            }>(
                              `/nodics/digitalCore/v0/entitlements/${encodeURIComponent(e.code)}/reveal`,
                              session,
                              { confirmed: true },
                            );
                            const token = result.token;
                            if (
                              result.status !== "REVEALED" ||
                              result.couponCode !== e.providerCode ||
                              result.tokenAvailable === false ||
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
                          Merchant reference:{" "}
                          {e.evidence.merchantRedemption.merchantCode}
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
                  <small>Purchase reference: {e.orderCode}</small>
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
                    {session.kind !== "ENTERPRISE" && (
                      <OrderReview
                        code={o.code}
                        session={session}
                        eligibility={o.reviewEligibility}
                      />
                    )}
                  </span>
                  <time>{new Date(o.created).toLocaleDateString("en-GB")}</time>
                </div>
              ))}
              {!data.orders.length && !data.entitlements.length && (
                <p>Your completed purchases will appear here.</p>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}
