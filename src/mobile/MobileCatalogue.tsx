import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { ShoppingBag, Ticket } from "lucide-react";
import {
  CataloguePage,
  CatalogueProductPage,
} from "../features/catalogue/CataloguePage";
import {
  catalogueHref,
  readCatalogueQuery,
  readMobileCatalogue,
} from "../features/catalogue/catalogueNavigation";
import { TransactionPage } from "../CircaApp";
import { CustomerAuthentication } from "../CustomerAuthentication";
import { ReviewDialog } from "../ReviewDialog";
import { accountHref } from "../AccountSections";
import type { Experience, Session } from "../api";
import type { JourneyHost } from "../channels/journeyHost";

/** Composes existing catalogue and reviewed commands inside the current host. */
export function MobileCatalogue({
  route,
  session,
  experience,
  host,
  onNavigate,
  onAccount,
  onHome,
  onLogin,
  onComplete,
}: {
  route: NonNullable<ReturnType<typeof readMobileCatalogue>>;
  session: Session | null;
  experience: Experience;
  host?: JourneyHost;
  onNavigate: (href: string) => void;
  onAccount: () => void;
  onHome: () => void;
  onLogin: (session: Session) => Promise<void> | void;
  onComplete: () => void;
}) {
  const [signIn, setSignIn] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSignIn(false);
    content.current?.querySelector<HTMLElement>("main")?.focus();
  }, [route.kind, route.code]);
  const back = useCallback(
    () => onNavigate(catalogueHref(route.kind, readCatalogueQuery())),
    [route.kind, onNavigate],
  );
  useEffect(() => {
    if (signIn) return host?.bindBack?.(() => setSignIn(false));
  }, [host, signIn]);
  const navigateLink = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey
    ) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    if (readMobileCatalogue(url)) {
      event.preventDefault();
      onNavigate(url.pathname + url.search + url.hash);
    } else if (url.searchParams.get("account") === "purchases") {
      event.preventDefault();
      onAccount();
    }
  };
  const activeHost = signIn ? undefined : host;
  return (
    <div className="mobile-catalogue" onClickCapture={navigateLink} ref={content}>
      <nav className="mobile-shop-kinds" aria-label="Shop catalogue">
        {(["ASSET", "COUPON"] as const).map((kind) => (
          <a
            key={kind}
            href={catalogueHref(kind)}
            aria-current={route.kind === kind ? "page" : undefined}
          >
            {kind === "ASSET" ? (
              <ShoppingBag size={18} aria-hidden="true" />
            ) : (
              <Ticket size={18} aria-hidden="true" />
            )}
            {kind === "ASSET" ? "Assets" : "Coupons"}
          </a>
        ))}
      </nav>
      {route.code === null ? (
        <CataloguePage
          key={route.kind}
          kind={route.kind}
          mobile
          host={activeHost}
          onBack={onHome}
        />
      ) : (
        <CatalogueProductPage
          key={route.kind + route.code}
          kind={route.kind}
          code={route.code}
          mobile
          host={activeHost}
          onBack={back}
          renderPurchase={(offer) => (
            <TransactionPage
              key={`${offer.kind}:${offer.code}:${offer.revision}:${session?.loginId}:${session?.token}`}
              offer={offer}
              session={session}
              wallet={null}
              host={activeHost}
              onBack={back}
              accountUrl={accountHref("purchases", true)}
              onLogin={() => setSignIn(true)}
              onComplete={onComplete}
            />
          )}
        />
      )}
      {signIn && (
        <ReviewDialog title="Sign in to continue" onClose={() => setSignIn(false)}>
          <CustomerAuthentication
            sample={experience.presentation.sampleMode === true}
            onLogin={async (value) => {
              await onLogin(value);
              setSignIn(false);
            }}
          />
        </ReviewDialog>
      )}
    </div>
  );
}
