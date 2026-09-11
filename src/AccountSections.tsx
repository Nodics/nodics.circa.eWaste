import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  UserRound,
  ClipboardList,
  HandCoins,
  ShoppingBag,
  LayoutDashboard,
  Wallet as WalletIcon,
} from "lucide-react";
import {
  API,
  request,
  type Account,
  type Market,
  type Session,
  type Wallet,
} from "./api";
import { CustomerWallet } from "./CustomerWallet";
import { BidHistory } from "./BidsPanel";
import { PurchaseHistory } from "./PurchaseHistory";
import "./accountSections.css";
import { HeaderPopover } from "./HeaderPopover";

export const accountSections = [
  {
    code: "overview",
    label: "Dashboard",
    description: "Your rewards, items and account at a glance",
    Icon: LayoutDashboard,
  },
  {
    code: "items",
    label: "My items",
    description: "Submissions, owned assets and saved drafts",
    Icon: ClipboardList,
  },
  {
    code: "wallet",
    label: "Wallet",
    description: "Balances and reward transactions",
    Icon: WalletIcon,
  },
  {
    code: "bids",
    label: "Bids",
    description: "Offers you have made and received",
    Icon: HandCoins,
  },
  {
    code: "purchases",
    label: "Purchases & coupons",
    description: "Your orders and owned coupons",
    Icon: ShoppingBag,
  },
  {
    code: "activity",
    label: "Ownership activity",
    description: "Recorded changes in asset ownership",
    Icon: ArrowLeftRight,
  },
] as const;
export type AccountSection = (typeof accountSections)[number]["code"];
export type AccountDetailSection = Exclude<
  AccountSection,
  "items" | "overview"
>;

export function readAccountSection(
  mobile = false,
  url = new URL(window.location.href),
): AccountDetailSection | null {
  const value = mobile
    ? url.searchParams.get("account")
    : url.pathname.match(/^\/account\/([^/]+)$/)?.[1];
  return value === "bids" ||
    value === "purchases" ||
    value === "activity" ||
    value === "wallet"
    ? value
    : null;
}

/** Changes account navigation while preserving the mobile host's launch parameters. */
export function accountHref(
  section: AccountSection | "overview",
  mobile = false,
): string {
  if (!mobile)
    return section === "overview" ? "/account" : `/account/${section}`;
  const url = new URL(window.location.href);
  for (const key of [
    "view",
    "submission",
    "asset",
    "q",
    "status",
    "categoryCode",
    "itemTypeCode",
    "dateFrom",
    "dateTo",
    "sort",
    "page",
  ])
    url.searchParams.delete(key);
  if (section === "items") {
    url.searchParams.delete("account");
    url.searchParams.set("view", "submissions");
  } else url.searchParams.set("account", section);
  return url.pathname + url.search + url.hash;
}

export function AccountMenu({ path }: { path: string }) {
  return (
    <HeaderPopover
      href="/account"
      label="My Account"
      title="My Account"
      icon={<UserRound size={21} />}
      dismissKey={path}
    >
      {(close) => (
        <nav className="account-menu-links" aria-label="Account navigation">
          {accountSections.map(({ code, label, description, Icon }) => (
            <a
              key={code}
              href={accountHref(code)}
              onClick={close}
              aria-current={
                (
                  code === "items"
                    ? path === "/account/items" ||
                      /^\/account\/(assets|submissions)\//.test(path)
                    : path === accountHref(code)
                )
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </a>
          ))}
        </nav>
      )}
    </HeaderPopover>
  );
}

/** Read models and command controls continue to come from their existing owning APIs. */
export function AccountSectionPage({
  section,
  session,
  mobile = false,
  onBack,
  onRefresh,
}: {
  section: AccountDetailSection;
  session: Session;
  mobile?: boolean;
  onBack?: () => void;
  onRefresh?: () => void;
}) {
  const [data, setData] = useState<{
    key: string;
    account?: Account;
    market?: Market;
    wallet?: Wallet;
  } | null>(null);
  const [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const key = session.token + ":" + section;
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const account =
      section !== "purchases" && section !== "wallet"
        ? request<Account>(`${API}/account`, session)
        : Promise.resolve(undefined);
    const market =
      section !== "activity" && section !== "wallet"
        ? request<Market>(`${API}/marketplace`, session)
        : Promise.resolve(undefined);
    const wallet =
      section === "bids" || section === "wallet"
        ? request<Wallet>(`${API}/wallet`, session)
        : Promise.resolve(undefined);
    void Promise.all([account, market, wallet])
      .then(([account, market, wallet]) => {
        if (active) setData({ key, account, market, wallet });
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "This account section could not load.",
          );
      });
    return () => {
      active = false;
    };
  }, [key, section, session, reload]);
  const current = data?.key === key ? data : null;
  const label = accountSections.find((item) => item.code === section)!.label;
  const refresh = () => {
    setReload((value) => value + 1);
    onRefresh?.();
  };
  return (
    <div
      className={`account-section-page${mobile ? " account-section-mobile" : ""}`}
    >
      <a
        className="account-section-back"
        href={accountHref("overview", mobile)}
        onClick={
          onBack
            ? (event) => {
                if (
                  event.button ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onBack();
              }
            : undefined
        }
      >
        <ArrowLeft size={17} />
        Back to dashboard
      </a>
      {error ? (
        <>
          <h1>{label}</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <button className="secondary" onClick={refresh}>
            Try again
          </button>
        </>
      ) : !current ? (
        <>
          <h1>{label}</h1>
          <p role="status">Loading {label.toLowerCase()}…</p>
        </>
      ) : section === "wallet" && current.wallet ? (
        <section>
          <h1>Your wallet</h1>
          <CustomerWallet wallet={current.wallet} />
        </section>
      ) : section === "bids" &&
        current.account &&
        current.market &&
        current.wallet ? (
        <BidHistory
          session={session}
          customerCode={current.account.customer.code}
          offers={current.market.assets}
          assets={current.account.assets}
          wallet={current.wallet}
          onComplete={refresh}
          headingLevel="h1"
        />
      ) : section === "purchases" && current.market ? (
        <PurchaseHistory
          session={session}
          offers={current.market.coupons}
          headingLevel="h1"
        />
      ) : (
        <section className="account-activity">
          <h1>Ownership activity</h1>
          <p>Follow the recorded changes in ownership of your assets.</p>
          {current.account?.events.length ? (
            <div className="activity-list">
              {current.account.events.map((event) => (
                <div key={event.code}>
                  <ArrowLeftRight size={20} />
                  <span>
                    {event.eventType
                      ? event.eventType
                          .replaceAll("_", " ")
                          .toLowerCase()
                          .replace(/^./, (value) => value.toUpperCase())
                      : "Ownership recorded"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="account-section-empty">
              <ArrowLeftRight size={30} />
              <h2>No ownership changes yet</h2>
              <p>
                Activity will appear here when ownership changes are recorded.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
