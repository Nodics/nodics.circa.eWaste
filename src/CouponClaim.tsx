import { useState } from "react";
import { API, request, type Session } from "./api";
import { ReviewDialog } from "./ReviewDialog";
type Merchant = { code: string; label: string; mode: string };
export function CouponClaim({
  code,
  session,
  onComplete,
}: {
  code: string;
  session: Session;
  onComplete: () => void;
}) {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = "claim:" + code;
  return (
    <>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await request<{ merchants: Merchant[] }>(
              `${API}/coupons/${encodeURIComponent(code)}/merchants`,
              session,
            );
            setMerchants(result.merchants);
            setSelected(result.merchants[0]?.code || "");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Cannot load merchants");
          } finally {
            setBusy(false);
          }
        }}
      >
        Use with merchant
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {merchants && (
        <ReviewDialog
          title="Review coupon redemption"
          onClose={() => {
            if (!busy) setMerchants(null);
          }}
        >
          <p>
            Choose the merchant that will fulfill this coupon. After
            confirmation, the coupon waits for the merchant to confirm
            fulfillment.
          </p>
          <label>
            Merchant
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {merchants.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {merchants.find((m) => m.code === selected)?.mode ===
            "LOCAL_SAMPLE" && (
            <p>
              This is a local sample redemption. No external store or POS is
              contacted.
            </p>
          )}
          {!merchants.length && (
            <p>No merchant is available for this coupon.</p>
          )}
          <button
            className="primary"
            disabled={busy || !selected}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await request(
                  `${API}/coupons/${encodeURIComponent(code)}/claim`,
                  session,
                  {
                    confirmed: true,
                    merchantCode: selected,
                    idempotencyKey: key,
                  },
                );
                setMerchants(null);
                onComplete();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Cannot request redemption",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Submitting…" : "Confirm redemption request"}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setMerchants(null)}
          >
            Cancel
          </button>
        </ReviewDialog>
      )}
    </>
  );
}
