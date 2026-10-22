import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Session } from "../../api";
import { BundleComposer } from "./BundleComposer";
import {
  readCompositionContext,
  type CompositionContext,
} from "./bundleClient";

/** Account mount consumes the owner's actual projection; session changes retire old private state synchronously. */
export function BundleCompositionPage(props: {
  session: Session;
  onComplete?: () => void;
  initialCertificateCode?: string;
  initialMode?: "FIXED" | "AUCTION" | "GIFT";
}) {
  return (
    <Composition
      key={JSON.stringify([
        props.session.token,
        props.session.kind,
        props.session.loginId,
        props.session.enterpriseCode,
      ])}
      {...props}
    />
  );
}
function Composition({
  session,
  onComplete,
  initialCertificateCode,
  initialMode,
}: Parameters<typeof BundleCompositionPage>[0]) {
  const [context, setContext] = useState<CompositionContext | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState("");
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setContext(null);
    setError("");
    setSelection("");
    void readCompositionContext(session, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setContext(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Bundle composition is unavailable. Your owner access could not be confirmed.",
          );
      });
    return () => controller.abort();
  }, [session, reload]);
  const selected = context?.listings.items.find(
    (item) => item.code === selection,
  );
  return (
    <section className="bundle-composition-page" aria-label="Create bundle">
      <header className="bundle-composition-heading">
        <h1>Create bundle</h1>
        <button
          type="button"
          className="icon-button"
          title="Refresh bundle destinations"
          aria-label="Refresh bundle destinations"
          disabled={locked || (!context && !error)}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !context ? (
        <p role="status">Loading bundle options...</p>
      ) : (
        <>
          {context.listings.state === "AVAILABLE" ? (
            <label className="bundle-destination">
              Listing destination
              <select
                value={selection}
                disabled={locked}
                onChange={(event) => setSelection(event.target.value)}
              >
                <option value="">Choose a destination</option>
                {context.listings.items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} ({item.currency})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p role="status">
              {context.listings.state === "DISABLED"
                ? "Listings are unavailable."
                : "Listing destinations are unavailable."}
            </p>
          )}
          {context.listings.state === "AVAILABLE" &&
            !context.listings.items.length && (
              <p>No listing destinations are available.</p>
            )}
          <BundleComposer
            session={session}
            ownerRef={context.ownerRef}
            listingContext={selected}
            destinationName={selected?.name}
            onComplete={onComplete}
            onLockedChange={setLocked}
            initialCertificateCode={initialCertificateCode}
            initialMode={initialMode}
          />
        </>
      )}
    </section>
  );
}
