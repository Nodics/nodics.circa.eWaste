import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Coins,
  Leaf,
  PackageCheck,
  Clock3,
  RefreshCw,
  ArrowRight,
  FilePenLine,
} from "lucide-react";
import { API, request, type Session, type Wallet } from "./api";
import { contentText, publicMedia, usePublishedPage } from "./cms";
import {
  accountHref,
  accountSections,
  type AccountSection,
} from "./AccountSections";
import { emptyWasteQuery, wasteHref } from "./features/waste/wasteNavigation";
import type { WasteListing, WasteQuery } from "./features/waste/wasteTypes";
import {
  WastePhoto,
  WasteStatus,
  wasteName,
  displayDate,
} from "./features/waste/WasteCard";
import "./accountDashboard.css";

function useDashboardRead<T>(path: string, session: Session, revision: number) {
  const key = session.token + ":" + path;
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key },
  );
  useEffect(() => {
    let active = true;
    setState({ key });
    void request<T>(path, session)
      .then((data) => {
        if (active) setState({ key, data });
      })
      .catch((cause) => {
        if (active)
          setState({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load this summary.",
          });
      });
    return () => {
      active = false;
    };
  }, [key, path, session, revision]);
  return state.key === key ? state : { key };
}

/** Every count comes from an owner-scoped paginated API total, never a truncated local array. */
export function AccountDashboard({
  session,
  mobile = false,
  onNavigate,
  onItems,
  onStart,
  revision = 0,
}: {
  session: Session;
  mobile?: boolean;
  onNavigate?: (section: AccountSection) => void;
  onItems?: (href: string) => void;
  onStart: () => void;
  revision?: number;
}) {
  const [reload, setReload] = useState(0);
  const wallet = useDashboardRead<Wallet>(
    `${API}/wallet`,
    session,
    revision + reload,
  );
  const submitted = useDashboardRead<WasteListing>(
    `${API}/account/items?view=submissions&limit=3&page=1&sort=RECENT`,
    session,
    revision + reload,
  );
  const assets = useDashboardRead<WasteListing>(
    `${API}/account/items?view=assets&limit=1&page=1`,
    session,
    revision + reload,
  );
  const drafts = useDashboardRead<WasteListing>(
    `${API}/account/items?view=drafts&limit=1&page=1`,
    session,
    revision + reload,
  );
  const cms = usePublishedPage("/account/waste", revision);
  const content = cms.page?.sections.find(
    (section) => section.renderer === "circa.wasteWorkspace",
  )?.properties;
  const image = contentText(content, "bannerMediaCode");
  const pending = submitted.data?.statuses.find(
    (status) => status.code === "PENDING",
  )?.count;
  const states =
    submitted.data?.statuses.filter((status) => status.code !== "ALL") || [];
  const assetStates =
    assets.data?.statuses.filter((status) => status.code !== "ALL") || [];
  const total = submitted.data?.total || 0;
  const palette = ["#d7a34b", "#285941", "#bd7769", "#7393a3"];
  let cursor = 0;
  const segments = states.map((state, index) => {
    const start = cursor;
    cursor += total ? (state.count / total) * 100 : 0;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  const donut = total
    ? `conic-gradient(${segments.join(", ")}${cursor < 99.99 ? `, #e5e9e2 ${cursor}% 100%` : ""})`
    : "#e5e9e2";
  const href = (patch: Partial<WasteQuery>) =>
    wasteHref({ ...emptyWasteQuery, ...patch }, null, mobile);
  const openItems =
    (target: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        onItems &&
        !event.button &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onItems(target);
      }
    };
  const navigate =
    (section: AccountSection) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        onNavigate &&
        !event.button &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onNavigate(section);
      }
    };
  const number = (value?: string | number) =>
    value === undefined
      ? "—"
      : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(
          Number(value),
        );
  const issue = (error?: string) =>
    error ? (
      <p className="dashboard-error" role="alert">
        {error}
      </p>
    ) : null;
  const balance = (code: string) =>
    wallet.data
      ? (wallet.data.balances.find((value) => value.rewardTypeCode === code)
          ?.available ?? "0")
      : undefined;
  const metric = (
    label: string,
    value: string,
    detail: string,
    icon: ReactNode,
    target: string,
    click: (event: MouseEvent<HTMLAnchorElement>) => void,
    className = "",
  ) => (
    <a
      className={`dashboard-metric ${className}`}
      href={target}
      onClick={click}
    >
      <span className="dashboard-metric-top">
        {label}
        {icon}
      </span>
      <strong>{value}</strong>
      <span className="dashboard-metric-bottom">
        {detail}
        <ArrowUpRight size={17} />
      </span>
    </a>
  );
  return (
    <div className={`account-dashboard${mobile ? " dashboard-mobile" : ""}`}>
      <section className="dashboard-welcome">
        {image && <img src={publicMedia(image)} alt="" />}
        <div>
          <span className="dashboard-eyebrow">
            MY ACCOUNT · YOUR CIRCULAR JOURNEY
          </span>
          <h1>
            {contentText(content, "dashboardTitle") ||
              "Your account, at a glance."}
          </h1>
          <p>
            {contentText(content, "dashboardDescription") ||
              "Your rewards, your items, and what comes next. All in one place."}
          </p>
          <div className="dashboard-welcome-actions">
            <button onClick={onStart}>
              Recycle an item <ArrowUpRight size={17} />
            </button>
            <a href={accountHref("items", mobile)} onClick={navigate("items")}>
              View my items <ArrowRight size={17} />
            </a>
          </div>
        </div>
      </section>
      <div className="dashboard-section-heading">
        <h2>Your overview</h2>
        <button
          className="dashboard-refresh"
          aria-label="Refresh dashboard"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <div className="dashboard-metrics">
        {metric(
          "Reward points",
          number(balance("points")),
          "Available to use",
          <Coins size={23} />,
          accountHref("wallet", mobile),
          navigate("wallet"),
          "dashboard-points",
        )}
        {metric(
          "Carbon units",
          number(balance("circaCarbon")),
          "Reward balance",
          <Leaf size={23} />,
          accountHref("wallet", mobile),
          navigate("wallet"),
          "dashboard-carbon",
        )}
        {metric(
          "Owned assets",
          number(assets.data?.total),
          "Explore your collection",
          <PackageCheck size={23} />,
          href({ view: "assets" }),
          openItems(href({ view: "assets" })),
        )}
        {metric(
          "In review",
          number(pending),
          "Follow your submissions",
          <Clock3 size={23} />,
          href({ status: "PENDING" }),
          openItems(href({ status: "PENDING" })),
        )}
      </div>
      {issue(wallet.error)}
      <p className="dashboard-reward-note">
        Carbon units are rewards, separate from estimated CO₂e savings and
        carbon credits.
      </p>
      <div className="dashboard-charts">
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="dashboard-eyebrow">YOUR SUBMISSIONS</span>
              <h2>Every item has a next step</h2>
            </div>
            <a
              href={href({})}
              onClick={openItems(href({}))}
              aria-label="View all submissions"
            >
              <ArrowUpRight size={21} />
            </a>
          </div>
          {issue(submitted.error) ||
            (!submitted.data ? (
              <p role="status">Loading submission summary…</p>
            ) : (
              <div className="dashboard-review-chart">
                <div
                  className="dashboard-donut"
                  role="img"
                  aria-label={`Submission status: ${states.map((state) => `${state.label} ${state.count}`).join(", ")}`}
                  style={{ background: donut }}
                >
                  <div>
                    <strong>{number(total)}</strong>
                    <span>submitted items</span>
                  </div>
                </div>
                <div className="dashboard-chart-legend">
                  {states.map((state, index) => (
                    <a
                      key={state.code}
                      href={href({ status: state.code })}
                      onClick={openItems(href({ status: state.code }))}
                    >
                      <span
                        style={{ background: palette[index % palette.length] }}
                      />
                      <span>{state.label}</span>
                      <strong>{number(state.count)}</strong>
                    </a>
                  ))}
                  {!total && <p>Your first submission will appear here.</p>}
                </div>
              </div>
            ))}
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="dashboard-eyebrow">YOUR OWNED ASSETS</span>
              <h2>Your collection in motion</h2>
            </div>
            <a
              href={href({ view: "assets" })}
              onClick={openItems(href({ view: "assets" }))}
              aria-label="View owned assets"
            >
              <ArrowUpRight size={21} />
            </a>
          </div>
          {issue(assets.error) ||
            (!assets.data ? (
              <p role="status">Loading asset summary…</p>
            ) : (
              <div className="dashboard-asset-chart">
                {assetStates.map((state) => (
                  <a
                    key={state.code}
                    href={href({ view: "assets", status: state.code })}
                    onClick={openItems(
                      href({ view: "assets", status: state.code }),
                    )}
                  >
                    <span>{state.label}</span>
                    <strong>{state.count}</strong>
                    <div className="dashboard-bar-track">
                      <div
                        style={{
                          width: `${assets.data!.total ? (state.count / assets.data!.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </a>
                ))}
                {!assets.data.total && (
                  <p>Assets will appear here when you own them.</p>
                )}
              </div>
            ))}
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Recently updated items</h2>
            <a href={href({})} onClick={openItems(href({}))}>
              View all <ArrowRight size={16} />
            </a>
          </div>
          {submitted.error ? (
            issue(submitted.error)
          ) : !submitted.data ? (
            <p role="status">Loading recent items…</p>
          ) : !submitted.data.items.length ? (
            <p>
              Your submitted items will appear here. Start with a clear photo of
              your item.
            </p>
          ) : (
            <div className="dashboard-recent">
              {submitted.data.items.map((item) => {
                const target = wasteHref(
                  emptyWasteQuery,
                  { resource: item.resource, code: item.code },
                  mobile,
                );
                return (
                  <a key={item.code} href={target} onClick={openItems(target)}>
                    <div className="dashboard-item-photo">
                      <WastePhoto item={item} session={session} />
                    </div>
                    <div>
                      <strong>{wasteName(item)}</strong>
                      <small>
                        {displayDate(item.updatedAt) ||
                          displayDate(item.submittedAt)}
                      </small>
                    </div>
                    <WasteStatus item={item} />
                    <ArrowUpRight size={17} />
                  </a>
                );
              })}
            </div>
          )}
        </section>
        <section className="dashboard-panel dashboard-next">
          <h2>Your next steps</h2>
          <a
            className="dashboard-drafts"
            href={href({ view: "drafts" })}
            onClick={openItems(href({ view: "drafts" }))}
          >
            <FilePenLine size={25} />
            <span>
              <strong>
                Saved drafts <b>{number(drafts.data?.total)}</b>
              </strong>
              <small>Pick up where you left off</small>
            </span>
            <ArrowRight size={18} />
          </a>
          {issue(drafts.error)}
          <nav aria-label="Dashboard shortcuts">
            {accountSections
              .filter((section) =>
                ["wallet", "bids", "purchases", "activity"].includes(
                  section.code,
                ),
              )
              .map(({ code, label, Icon }) => (
                <a
                  key={code}
                  href={accountHref(code, mobile)}
                  onClick={navigate(code)}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  <ArrowUpRight size={17} />
                </a>
              ))}
          </nav>
        </section>
      </div>
    </div>
  );
}
