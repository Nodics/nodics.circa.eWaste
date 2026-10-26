import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { request, type Session } from "./api";
import "./CommercePurchase.css";
import { readableCode } from "./holdingPresentation";

export type CertificateSelection = {
  code: string;
  revision: number;
  categoryCode?: string;
  brandCode?: string;
  modelCode?: string;
};
type Row = CertificateSelection & {
  available: boolean;
  valid: boolean;
  assetStatus: string;
  custodyStatus: string;
};
type Page = {
  contractVersion: 1;
  ownerRef: {
    module: "profile";
    schema: "customer" | "enterprise";
    code: string;
  };
  items: Row[];
  page: number;
  limit: number;
  total: number;
};

/** A shared owner-scoped selector. Availability is a current observation; the server rechecks and reserves on confirmation. */
export function CertificatePicker({
  session,
  value,
  onChange,
  disabled = false,
  preferredCode,
}: {
  session: Session;
  value: CertificateSelection[];
  onChange: (value: CertificateSelection[]) => void;
  disabled?: boolean;
  preferredCode?: string;
}) {
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: Page;
    error?: string;
  }>();
  const key = JSON.stringify([
    session.token,
    session.loginId,
    session.enterpriseCode,
    page,
    refresh,
  ]);
  useEffect(() => {
    const abort = new AbortController();
    request<Page>(
      "/nodics/digitalCore/v0/holdings/certificates",
      session,
      { page },
      "POST",
      { signal: abort.signal },
    )
      .then((data) => {
        if (abort.signal.aborted) return;
        if (
          data.contractVersion !== 1 ||
          data.page !== page ||
          !Number.isSafeInteger(data.limit) ||
          data.limit < 1 ||
          !Number.isSafeInteger(data.total) ||
          data.total < 0 ||
          !Array.isArray(data.items) ||
          data.items.length > data.limit ||
          data.ownerRef?.module !== "profile" ||
          !data.ownerRef.code ||
          !["customer", "enterprise"].includes(data.ownerRef.schema) ||
          (session.kind === "ENTERPRISE" &&
            (data.ownerRef.schema !== "enterprise" ||
              data.ownerRef.code !== session.enterpriseCode)) ||
          (session.kind !== "ENTERPRISE" &&
            data.ownerRef.schema !== "customer") ||
          data.items.some(
            (row) =>
              !row.code ||
              !Number.isSafeInteger(row.revision) ||
              row.revision < 0 ||
              typeof row.available !== "boolean" ||
              typeof row.valid !== "boolean",
          ) ||
          new Set(data.items.map((row) => row.code)).size !== data.items.length
        )
          throw new Error("Certificate holdings could not be confirmed.");
        setState({ key, data });
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setState({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Certificates unavailable.",
          });
      });
    return () => abort.abort();
  }, [key, page, session]);
  const current = state?.key === key ? state : undefined,
    data = current?.data;
  useEffect(() => {
    if (!preferredCode || disabled || !data || value.length) return;
    const row = data.items.find(
      (item) =>
        item.code === preferredCode &&
        item.available === true &&
        item.valid === true,
    );
    if (!row) return;
    onChange([
      {
        code: row.code,
        revision: row.revision,
        categoryCode: row.categoryCode,
        brandCode: row.brandCode,
        modelCode: row.modelCode,
      },
    ]);
  }, [data, disabled, onChange, preferredCode, value]);
  return (
    <fieldset className="certificate-picker" disabled={disabled}>
      <legend>Certificates</legend>
      {!current && <p role="status">Loading certificates...</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      <button
        type="button"
        className="catalogue-secondary"
        disabled={disabled || !current}
        aria-label="Refresh certificates"
        title="Refresh certificates"
        onClick={() => setRefresh((v) => v + 1)}
      >
        <RefreshCw size={17} />
      </button>
      {data && (
        <>
          {!data.items.length && <p>No certificates recorded.</p>}
          {data.items.map((row) => (
            <label className="certificate-option" key={row.code}>
              <input
                type="checkbox"
                checked={value.some((v) => v.code === row.code)}
                disabled={
                  disabled ||
                  ((!row.available || !row.valid) &&
                    !value.some((v) => v.code === row.code))
                }
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [
                          ...value.filter((v) => v.code !== row.code),
                          {
                            code: row.code,
                            revision: row.revision,
                            categoryCode: row.categoryCode,
                            brandCode: row.brandCode,
                            modelCode: row.modelCode,
                          },
                        ]
                      : value.filter((v) => v.code !== row.code),
                  )
                }
              />
              <span>
                <strong>
                  {[row.brandCode, row.modelCode].filter(Boolean).join(" ") ||
                    (row.categoryCode && readableCode(row.categoryCode)) ||
                    "Certificate"}
                </strong>
                <small>{row.code}</small>
                {(!row.available || !row.valid) && <small>Unavailable</small>}
              </span>
            </label>
          ))}
          {data.total > data.limit && (
            <nav aria-label="Certificate pages">
              <button
                type="button"
                disabled={disabled || page === 1}
                aria-label="Previous certificates"
                title="Previous certificates"
                onClick={() => setPage((v) => v - 1)}
              >
                <ArrowLeft size={17} />
              </button>
              <span>
                Page {page} of {Math.ceil(data.total / data.limit)}
              </span>
              <button
                type="button"
                disabled={disabled || page * data.limit >= data.total}
                aria-label="Next certificates"
                title="Next certificates"
                onClick={() => setPage((v) => v + 1)}
              >
                <ArrowRight size={17} />
              </button>
            </nav>
          )}
        </>
      )}
      {!!value.length && <p>{value.length} selected</p>}
    </fieldset>
  );
}
