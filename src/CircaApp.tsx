import {
  CataloguePage,
  CatalogueProductPage,
} from "./features/catalogue/CataloguePage";
import { AccountDashboard } from "./AccountDashboard";
import { CustomerWallet, HeaderWallet } from "./CustomerWallet";
import { CustomerWasteWorkspace } from "./features/waste/CustomerWasteWorkspace";
import {
  AccountMenu,
  AccountSectionPage,
  readAccountSection,
} from "./AccountSections";
import { CircaBrand as Brand } from "./CircaBrand";
import { CustomerAuthentication } from "./CustomerAuthentication";
import { CustomerUpdates, OutcomeInbox } from "./OutcomeInbox";
import { HeaderPopoverGroup } from "./HeaderPopover";
import { ReviewDialog as Dialog } from "./ReviewDialog";
import { BidComposer } from "./BidsPanel";
import {
  contentText as text,
  contentItems as items,
  contentStrings as strings,
  publicMedia,
  publishedArtwork,
  usePublishedPage,
  type Content,
} from "./cms";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Leaf,
  LogOut,
  Menu,
  Pause,
  Play,
  Recycle,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  X,
} from "lucide-react";
import {
  API,
  APP_API,
  commandKey,
  nameOf,
  readSession,
  restoreSession,
  endSession,
  request,
  saveSession,
  statusLabel,
  type Centre,
  type Experience,
  type Market,
  type Offer,
  type Session,
  type Wallet,
} from "./api";
import { CollectionMap } from "./CollectionMap";
import { SubmissionAssistant } from "./SubmissionAssistant";

function Lines({ value }: { value: string }) {
  return (
    <>
      {value.split("\n").map((line, index) => (
        <span key={index}>
          {index > 0 && <br />}
          {line}
        </span>
      ))}
    </>
  );
}
function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <div className="error" role="alert">
      {error}
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  ) : null;
}
export function Login({
  onClose,
  onLogin,
  sample,
}: {
  onClose: () => void;
  onLogin: (session: Session) => void | Promise<void>;
  sample: boolean;
}) {
  const [register, setRegister] = useState(false);
  return (
    <Dialog
      title={register ? "Create your Circa account" : "Welcome back"}
      onClose={onClose}
    >
      <CustomerAuthentication
        onLogin={onLogin}
        sample={sample}
        showTitle={false}
        onModeChange={setRegister}
      />
    </Dialog>
  );
}

function Hero({
  onSubmit,
  content,
}: {
  onSubmit: () => void;
  content: Content;
}) {
  const stories = items(content, "stories");
  const [slide, setSlide] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (
      !playing ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(
      () => setSlide((i) => (i + 1) % stories.length),
      8000,
    );
    return () => clearInterval(timer);
  }, [playing, stories.length]);
  const story = stories[slide % stories.length];
  if (!story) return null;
  return (
    <section className="hero" aria-label="Discover Circa">
      <img
        key={slide}
        className="hero-image"
        src={publicMedia(text(story, "mediaCode"))}
        alt={text(story, "alt")}
        fetchPriority="high"
      />
      <div className="hero-shade" />
      <div className="hero-inner">
        <span className="eyebrow">
          <span />
          {text(story, "eyebrow")}
        </span>
        <h1>
          <Lines value={text(story, "title")} />
        </h1>
        <p>{text(story, "body")}</p>
        <div className="hero-actions">
          {story.action === "SHOP" ? (
            <a className="primary" href="/shop">
              {text(story, "cta")}
              <ArrowUpRight size={18} />
            </a>
          ) : (
            <button className="primary" onClick={onSubmit}>
              {text(story, "cta")}
              <ArrowUpRight size={18} />
            </button>
          )}
          <a className="hero-secondary" href="/#centres">
            {text(content, "secondaryLabel")} <ArrowRight size={18} />
          </a>
        </div>
        <div className="hero-foot">
          <span>
            <ShieldCheck size={17} /> {text(content, "assurance")}
          </span>
          <div className="slide-controls">
            <button
              aria-label="Previous banner"
              onClick={() =>
                setSlide((slide + stories.length - 1) % stories.length)
              }
            >
              <ChevronLeft size={17} />
            </button>
            {stories.map((_, i) => (
              <button
                key={i}
                aria-label={`Show banner ${i + 1}`}
                aria-pressed={slide === i}
                className={slide === i ? "active" : ""}
                onClick={() => setSlide(i)}
              >
                <span />
              </button>
            ))}
            <button
              aria-label="Next banner"
              onClick={() => setSlide((slide + 1) % stories.length)}
            >
              <ChevronRight size={17} />
            </button>
            <button
              aria-label={playing ? "Pause banners" : "Play banners"}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
function WalletBand({
  wallet,
  error,
}: {
  wallet: Wallet | null;
  error: string;
}) {
  const balance = (code: string) =>
    wallet?.balances.find((b) => b.rewardTypeCode === code)?.available || "0";
  return (
    <div className="wallet-band">
      <div className="container">
        <span className="wallet-greeting">Your circular value</span>
        {error ? (
          <span>Wallet unavailable</span>
        ) : wallet ? (
          <>
            <span className="points">
              <Coins size={19} />
              <strong>{balance("points")}</strong> reward points
            </span>
            <span className="carbon">
              <Leaf size={19} />
              <strong>{balance("circaCarbon")}</strong> carbon units
            </span>
          </>
        ) : (
          <span>Loading your wallet…</span>
        )}
        <a href="/wallet">
          View wallet <ArrowRight size={16} />
        </a>
      </div>
    </div>
  );
}
function Solution({
  onSubmit,
  content,
}: {
  onSubmit: () => void;
  content: Content;
}) {
  return (
    <section className="solution section container" id="how-it-works">
      <div className="solution-heading">
        <div>
          <span className="eyebrow">{text(content, "eyebrow")}</span>
          <h2>
            <Lines value={text(content, "title")} />
          </h2>
        </div>
        <p>{text(content, "body")}</p>
      </div>
      <div className="benefit-grid">
        {items(content, "benefits").map((benefit, index) => {
          const Icon = [Recycle, Users, Leaf][index % 3];
          return (
            <article className="benefit" key={index}>
              <span className="benefit-icon">
                <Icon size={24} />
              </span>
              <h3>{text(benefit, "title")}</h3>
              <p>{text(benefit, "body")}</p>
            </article>
          );
        })}
      </div>
      <div className="process-strip">
        <span className="process-label">Your next chapter</span>
        {strings(content, "steps").map((v, i) => (
          <span key={v}>
            <b>0{i + 1}</b>
            {v}
            {i < 3 && <ChevronRight size={14} />}
          </span>
        ))}
        <button className="text-button" onClick={onSubmit}>
          Let’s begin <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}
function OfferCard({ offer }: { offer: Offer }) {
  return (
    <article
      className={`offer-card ${offer.kind === "COUPON" ? "coupon-card" : ""}`}
    >
      <a
        href={`/${offer.kind === "ASSET" ? "shop" : "coupons"}/${encodeURIComponent(offer.code)}`}
        className="offer-image"
      >
        <img
          src={publishedArtwork(offer.imageUrl || "/media/asset-laptop.svg")}
          alt={offer.name}
          loading="lazy"
        />
        <span className="badge">
          {offer.kind === "ASSET" ? (
            <>
              <ShieldCheck size={12} />
              Verified asset
            </>
          ) : (
            "Partner offer"
          )}
        </span>
      </a>
      <div className="offer-body">
        <small>{offer.issuer || "Circa collection"}</small>
        <h3>
          <a
            href={`/${offer.kind === "ASSET" ? "shop" : "coupons"}/${encodeURIComponent(offer.code)}`}
          >
            {offer.name}
          </a>
        </h3>
        <p>
          {offer.kind === "ASSET" ? (
            <>
              <Leaf size={14} />
              {offer.carbonUnits ?? 0} carbon units
            </>
          ) : offer.expiresAt ? (
            `Valid until ${new Date(offer.expiresAt).toLocaleDateString("en-GB")}`
          ) : (
            "Claim with the issuing partner"
          )}
        </p>
        <div className="offer-price">
          <span>
            <Coins size={16} />
            <strong>{offer.rewardPrice}</strong> points
          </span>
          <a
            aria-label={`View ${offer.name}`}
            href={`/${offer.kind === "ASSET" ? "shop" : "coupons"}/${encodeURIComponent(offer.code)}`}
          >
            <ArrowUpRight size={20} />
          </a>
        </div>
      </div>
    </article>
  );
}
function Offers({
  kind,
  offers,
  loading,
  error,
  content,
}: {
  kind: "ASSET" | "COUPON";
  content: Content;
  offers: Offer[];
  loading: boolean;
  error: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const assets = kind === "ASSET";
  return (
    <section
      className={`section ${assets ? "assets-section" : "coupons-section"}`}
      id={assets ? "assets" : "offers"}
    >
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{text(content, "eyebrow")}</span>
            <h2>{text(content, "title")}</h2>
          </div>
          <a className="text-link" href={assets ? "/shop" : "/coupons"}>
            View all {assets ? "assets" : "coupons"} <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="carousel-header">
          <p>{text(content, "body")}</p>
          <div>
            <button
              className="icon-button"
              aria-label={`Previous ${assets ? "assets" : "coupons"}`}
              onClick={() =>
                rail.current?.scrollBy({ left: -320, behavior: "smooth" })
              }
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={`Next ${assets ? "assets" : "coupons"}`}
              onClick={() =>
                rail.current?.scrollBy({ left: 320, behavior: "smooth" })
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <ErrorNotice error={error} />
        {loading ? (
          <div className="loading-cards" role="status">
            Loading {assets ? "assets" : "offers"}…
          </div>
        ) : (
          <div className="offer-rail" ref={rail}>
            {offers.map((offer) => (
              <OfferCard key={offer.code} offer={offer} />
            ))}
            {!offers.length && !error && (
              <p className="empty">
                New {assets ? "assets" : "offers"} will appear here when they
                are available.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
function Contact({
  session,
  content,
}: {
  session: Session | null;
  content: Content;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(""),
    key = useRef(commandKey());
  return (
    <section className="contact section container" id="contact">
      <div>
        <span className="eyebrow">{text(content, "eyebrow")}</span>
        <h2>
          <Lines value={text(content, "title")} />
        </h2>
        <p>{text(content, "body")}</p>
        <div className="contact-note">
          <MessageIcon />
          <span>
            One conversation can open up
            <br />a whole new possibility.
          </span>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || receipt) return;
          const fields = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          setError("");
          try {
            const r = await request<{ code: string }>(
              `${APP_API}/contact`,
              session,
              { ...fields, idempotencyKey: key.current },
            );
            setReceipt(r.code);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Your message could not be sent. Please retry.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {receipt ? (
          <div className="contact-receipt" role="status">
            <Check size={30} />
            <h3>We’ve received your message.</h3>
            <p>Keep this reference: {receipt}</p>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setReceipt("");
                key.current = commandKey();
              }}
            >
              Send another message
            </button>
          </div>
        ) : (
          <>
            <div className="form-grid">
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={session?.loginId || ""}
                  key={session?.loginId}
                  autoComplete="email"
                />
              </label>
            </div>
            <label>
              Subject
              <input name="subject" required maxLength={180} />
            </label>
            <label>
              Your message
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={3000}
                rows={4}
              />
            </label>
            <ErrorNotice error={error} />
            <div className="contact-submit">
              <span>We’ll use your details to respond to this enquiry.</span>
              <button className="primary" disabled={busy}>
                {busy ? "Sending…" : "Send message"}
                <ArrowUpRight size={16} />
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
function MessageIcon() {
  return (
    <span className="contact-icon">
      <Sparkles size={28} />
    </span>
  );
}
function AccountPage({
  session,
  onResume,
  detail,
  revision,
}: {
  session: Session;
  onResume: (code: string) => void;
  detail: boolean;
  revision: number;
}) {
  return (
    <main
      className={`container account-page ${detail ? "account-item-page" : ""}`}
    >
      {!detail && (
        <a className="account-section-back" href="/account">
          Back to dashboard
        </a>
      )}
      <CustomerWasteWorkspace
        session={session}
        onContinue={onResume}
        revision={revision}
      />
    </main>
  );
}
function WalletPage({
  wallet,
  error,
  onRefresh,
}: {
  wallet: Wallet | null;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <main className="container account-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Value you can follow</span>
          <h1>Your wallet</h1>
          <p>Available balances and a history of every recorded change.</p>
        </div>
        <a href="/account" className="text-link">
          My Account <ArrowUpRight size={16} />
        </a>
      </div>
      <ErrorNotice error={error} retry={onRefresh} />
      {!wallet && !error ? (
        <p role="status">Loading your wallet…</p>
      ) : (
        wallet && <CustomerWallet wallet={wallet} />
      )}
    </main>
  );
}
export function TransactionPage({
  offer,
  session,
  wallet,
  onLogin,
  onComplete,
}: {
  offer: Offer;
  session: Session | null;
  wallet: Wallet | null;
  onLogin: () => void;
  onComplete: () => void;
}) {
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      code: string;
      message?: string;
      entitlementCode?: string;
    } | null>(null),
    key = useRef(commandKey());
  const balance = Number(
    wallet?.balances.find((b) => b.rewardTypeCode === "points")?.available || 0,
  );
  return (
    <section className="catalogue-purchase">
      {result ? (
        <div className="purchase-receipt" role="status">
          <Check size={30} />
          <h2>
            {offer.kind === "ASSET"
              ? "The asset is now yours."
              : "Your coupon is ready."}
          </h2>
          <p>{result.message}</p>
          <p>Reference: {result.code}</p>
          {result.entitlementCode && (
            <p>
              Coupon: <strong>{result.entitlementCode}</strong>
            </p>
          )}
          <a className="primary" href="/account">
            Go to My Account
          </a>
        </div>
      ) : (
        <>
          <ErrorNotice error={error} />
          {session ? (
            <>
              <p>
                Your available balance:{" "}
                {wallet ? `${balance} points` : "Loading…"}
              </p>
              {offer.kind === "ASSET" &&
              offer.ownerCode &&
              offer.ownerCode === wallet?.wallet.ownerCode ? (
                <p>You own this asset.</p>
              ) : (
                <button
                  className="primary"
                  disabled={
                    !wallet ||
                    balance < offer.rewardPrice ||
                    busy ||
                    offer.available === false
                  }
                  onClick={() => setReview(true)}
                >
                  Review{" "}
                  {offer.kind === "ASSET" ? "purchase" : "coupon purchase"}{" "}
                  <ArrowRight size={16} />
                </button>
              )}
              {wallet && balance < offer.rewardPrice && (
                <p>More points are needed for this purchase.</p>
              )}
            </>
          ) : (
            <button className="primary" onClick={onLogin}>
              Sign in to continue
            </button>
          )}
        </>
      )}
      {offer.kind === "ASSET" &&
        offer.biddingAvailable &&
        session &&
        offer.ownerCode !== wallet?.wallet.ownerCode &&
        !result && <BidComposer offer={offer} session={session} />}
      {review && (
        <Dialog
          title="Review your purchase"
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <h3>{offer.name}</h3>
          <dl>
            <dt>Reward payment</dt>
            <dd>{offer.rewardPrice} points</dd>
            <dt>Available after purchase</dt>
            <dd>{balance - offer.rewardPrice} points</dd>
            <dt>
              {offer.kind === "ASSET"
                ? "Asset and carbon ownership"
                : "Carbon balance"}
            </dt>
            <dd>
              {offer.kind === "ASSET"
                ? `${offer.carbonUnits || 0} carbon units transfer with the asset. Original approval rewards remain with the contributor.`
                : "Unchanged for this offer."}
            </dd>
          </dl>
          <ErrorNotice error={error} />
          <button
            className="primary full"
            disabled={busy || offer.available === false}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await request<{
                  code: string;
                  message?: string;
                  entitlementCode?: string;
                }>(`${API}/marketplace/${offer.code}/purchase`, session, {
                  confirmed: true,
                  expectedRevision: offer.revision,
                  idempotencyKey: key.current,
                });
                setResult(r);
                setReview(false);
                onComplete();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Purchase failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Completing purchase…" : "Confirm purchase"}
          </button>
        </Dialog>
      )}
    </section>
  );
}

export function CircaApp() {
  const [path, setPath] = useState(window.location.pathname),
    [session, setSession] = useState<Session | null>(readSession),
    [experience, setExperience] = useState<Experience | null>(null),
    [experienceError, setExperienceError] = useState(""),
    [wallet, setWallet] = useState<Wallet | null>(null),
    [walletError, setWalletError] = useState(""),
    [market, setMarket] = useState<Market>({ assets: [], coupons: [] }),
    [marketError, setMarketError] = useState(""),
    [marketLoading, setMarketLoading] = useState(true),
    [login, setLogin] = useState(false),
    [menu, setMenu] = useState(false),
    [headerIsScrolled, setHeaderIsScrolled] = useState(false),
    [assistant, setAssistant] = useState(false),
    [selectedCentre, setSelectedCentre] = useState<Centre | null>(null),
    [resumeCode, setResumeCode] = useState<string>(),
    [refresh, setRefresh] = useState(0);
  const cms = usePublishedPage(
    path === "/privacy" || path === "/terms" ? path : "/",
    refresh,
  );
  const shell = cms.page?.sections.find(
    (section) => section.renderer === "circa.shell",
  )?.properties;
  const refreshAll = useCallback(() => setRefresh((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active)
          setExperienceError(
            "Your session could not be restored. Please sign in again.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const updateHeader = () => setHeaderIsScrolled(window.scrollY > 48);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);
  useEffect(() => {
    const handler = () => {
      const url = new URL(window.location.href);
      if (
        url.pathname === "/account" &&
        [
          "view",
          "status",
          "q",
          "categoryCode",
          "itemTypeCode",
          "dateFrom",
          "dateTo",
          "sort",
          "page",
          "limit",
        ].some((key) => url.searchParams.has(key))
      ) {
        url.pathname = "/account/items";
        history.replaceState(
          history.state,
          "",
          url.pathname + url.search + url.hash,
        );
      }
      setPath(window.location.pathname);
    };
    handler();
    window.addEventListener("popstate", handler);
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a");
      if (
        !link ||
        link.target ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      )
        return;
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      history.pushState({}, "", url.pathname + url.search + url.hash);
      window.dispatchEvent(new PopStateEvent("popstate"));
      setPath(window.location.pathname);
      setMenu(false);
      if (url.hash)
        setTimeout(
          () =>
            document
              .querySelector(url.hash)
              ?.scrollIntoView({ behavior: "smooth" }),
          60,
        );
      else window.scrollTo(0, 0);
    };
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", handler);
      document.removeEventListener("click", click);
    };
  }, []);
  useEffect(() => {
    let active = true;
    request<Experience>(`${APP_API}/experience`)
      .then((d) => {
        if (active) {
          setExperience(d);
          setExperienceError("");
        }
      })
      .catch((e) => {
        if (active) setExperienceError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh, assistant]);
  useEffect(() => {
    let active = true;
    setMarketLoading(true);
    if (path !== "/") {
      setMarketLoading(false);
      return;
    }
    request<Market>(`${API}/marketplace`)
      .then((d) => {
        if (active) {
          setMarket(d);
          setMarketError("");
        }
      })
      .catch((e) => {
        if (active) setMarketError(e.message);
      })
      .finally(() => {
        if (active) setMarketLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh, path]);
  useEffect(() => {
    let active = true;
    setWalletError("");
    if (session) {
      request<Wallet>(`${API}/wallet`, session)
        .then((d) => {
          if (active) setWallet(d);
        })
        .catch((e) => {
          if (active) setWalletError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [session, refresh]);
  const publicPage =
    path === "/" ||
    path.startsWith("/shop") ||
    path.startsWith("/coupons") ||
    path === "/privacy" ||
    path === "/terms";
  let detailCode = "";
  try {
    detailCode = decodeURIComponent(
      path.match(/^\/(?:shop|coupons)\/([^/]+)\/?$/)?.[1] || "",
    );
  } catch {
    /* Malformed links render the unavailable-product state. */
  }
  function onLogin(value: Session) {
    saveSession(value);
    setSession(value);
    setLogin(false);
  }
  function logout() {
    void endSession().catch(() =>
      setExperienceError(
        "Server sign-out could not be confirmed. Reconnect and sign out again.",
      ),
    );
    saveSession(null);
    setSession(null);
    setWallet(null);
    setAssistant(false);
    setResumeCode(undefined);
  }
  function submit() {
    setAssistant(true);
  }
  let page: ReactNode;
  if (!publicPage && !session)
    page = (
      <main className="container protected-page">
        <Leaf size={42} />
        <h1>Your journey, all in one place.</h1>
        <p>Sign in to view your submissions, owned assets and wallet.</p>
        <button className="primary" onClick={() => setLogin(true)}>
          Sign in or register
        </button>
      </main>
    );
  else if (path === "/account")
    page = (
      <main className="container">
        <AccountDashboard
          session={session!}
          revision={refresh}
          onStart={submit}
        />
      </main>
    );
  else if (path === "/account/updates")
    page = (
      <main className="container">
        <div className="account-section-page account-updates-page">
          <a className="account-section-back" href="/account">
            <ChevronLeft size={16} /> Back to dashboard
          </a>
          <h1>Your updates</h1>
          <OutcomeInbox key={session!.token} session={session!} />
        </div>
      </main>
    );
  else if (readAccountSection(false, new URL(path, window.location.origin)))
    page = (
      <main className="container">
        <AccountSectionPage
          key={path + session!.token}
          section={
            readAccountSection(false, new URL(path, window.location.origin))!
          }
          session={session!}
          onRefresh={refreshAll}
        />
      </main>
    );
  else if (
    path === "/account/items" ||
    path.startsWith("/account/submissions/") ||
    path.startsWith("/account/assets/")
  )
    page = (
      <>
        <AccountPage
          session={session!}
          detail={path !== "/account/items"}
          revision={refresh}
          onResume={(code) => {
            setResumeCode(code);
            setAssistant(true);
          }}
        />
      </>
    );
  else if (path === "/wallet")
    page = (
      <WalletPage wallet={wallet} error={walletError} onRefresh={refreshAll} />
    );
  else if (path === "/shop" || path === "/coupons")
    page = (
      <CataloguePage key={path} kind={path === "/shop" ? "ASSET" : "COUPON"} />
    );
  else if (path.startsWith("/shop/") || path.startsWith("/coupons/"))
    page = (
      <CatalogueProductPage
        key={path}
        code={detailCode}
        kind={path.startsWith("/shop/") ? "ASSET" : "COUPON"}
        renderPurchase={(offer) => (
          <TransactionPage
            key={offer.code}
            offer={offer}
            session={session}
            wallet={wallet}
            onLogin={() => setLogin(true)}
            onComplete={refreshAll}
          />
        )}
      />
    );
  else if (path === "/privacy" || path === "/terms") {
    const policy = cms.page?.sections.find(
      (section) => section.renderer === "circa.policy",
    )?.properties;
    page = (
      <main className="container policy-page">
        <ErrorNotice error={cms.error} retry={refreshAll} />
        {policy ? (
          <>
            <h1>{text(policy, "title")}</h1>
            {strings(policy, "paragraphs").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <a href="/#contact">Contact the site operator</a>
          </>
        ) : (
          <p role="status">Loading published content…</p>
        )}
      </main>
    );
  } else if (path !== "/")
    page = (
      <main className="container page-heading">
        <h1>Page not found</h1>
        <a href="/">Return home</a>
      </main>
    );
  else
    page = (
      <main>
        <ErrorNotice error={cms.error} retry={refreshAll} />
        {!cms.page && !cms.error && (
          <p role="status">Loading published content…</p>
        )}
        {cms.page?.sections.map((section) => {
          const content = section.properties;
          switch (section.renderer) {
            case "circa.shell":
              return null;
            case "circa.hero":
              return (
                <Hero key={section.code} content={content} onSubmit={submit} />
              );
            case "circa.wallet":
              return session ? (
                <WalletBand
                  key={section.code}
                  wallet={wallet}
                  error={walletError}
                />
              ) : null;
            case "circa.solution":
              return (
                <Solution
                  key={section.code}
                  content={content}
                  onSubmit={submit}
                />
              );
            case "circa.offers":
              return (
                <Offers
                  key={section.code}
                  content={content}
                  kind={content.kind === "COUPON" ? "COUPON" : "ASSET"}
                  offers={
                    content.kind === "COUPON" ? market.coupons : market.assets
                  }
                  loading={marketLoading}
                  error={marketError}
                />
              );
            case "circa.centres":
              return (
                <section
                  key={section.code}
                  className="section container centres-section"
                  id="centres"
                >
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        {text(content, "eyebrow")}
                      </span>
                      <h2>{text(content, "title")}</h2>
                      <p>{text(content, "body")}</p>
                    </div>
                    <span className="badge">
                      <MapCount count={experience?.centres.length} />
                    </span>
                  </div>
                  <ErrorNotice error={experienceError} retry={refreshAll} />
                  {experience ? (
                    <CollectionMap
                      centres={experience.centres}
                      onChoose={(centre) => {
                        setSelectedCentre(centre);
                        setAssistant(true);
                      }}
                    />
                  ) : (
                    <p role="status">Loading collection centres…</p>
                  )}
                </section>
              );
            case "circa.contact":
              return (
                <Contact
                  key={section.code}
                  content={content}
                  session={session}
                />
              );
            default:
              return null;
          }
        })}
      </main>
    );
  return (
    <div className="circa-site">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="top-line">
        <span>{text(shell, "tagline")}</span>
        <span>
          {experience?.presentation.sampleMode
            ? "Local sample experience"
            : "Give technology a new purpose"}{" "}
          <Leaf size={12} />
        </span>
      </div>
      <header
        className={`site-header${headerIsScrolled ? " is-scrolled" : ""}`}
      >
        <div className="container header-inner">
          <Brand light={headerIsScrolled} content={shell} />
          <nav
            className={menu ? "navigation open" : "navigation"}
            aria-label="Main navigation"
          >
            <button
              onClick={() => {
                submit();
                setMenu(false);
              }}
            >
              Submit Waste
            </button>
            {items(shell, "navigation").map((link) => {
              const href = text(link, "href");
              return /^\/(?!\/)/.test(href) ? (
                <a key={href} href={href}>
                  {text(link, "label")}
                </a>
              ) : null;
            })}
          </nav>
          <div className="header-actions">
            {session ? (
              <>
                <HeaderPopoverGroup>
                  <AccountMenu path={path} />
                  <CustomerUpdates session={session} />
                  <HeaderWallet
                    wallet={wallet}
                    error={walletError}
                    onRefresh={refreshAll}
                  />
                </HeaderPopoverGroup>
                <button
                  className="icon-button"
                  aria-label="Log out"
                  onClick={logout}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button
                className="secondary login-link"
                onClick={() => setLogin(true)}
              >
                Sign in <ArrowUpRight size={16} />
              </button>
            )}
            <button
              className="icon-button menu-button"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>
      <div id="main-content">{page}</div>
      <footer>
        <div className="container footer-main">
          <div>
            <Brand light content={shell} />
            <p>
              <Lines value={text(shell, "footer")} />
            </p>
            <span className="footer-caption">{text(shell, "caption")}</span>
          </div>
          <div>
            <h3>Explore Circa</h3>
            <button onClick={submit}>Submit Waste</button>
            <a href="/shop">Circular assets</a>
            <a href="/coupons">Partner offers</a>
            <a href="/#centres">Collection centres</a>
          </div>
          <div>
            <h3>Your journey</h3>
            <a href="/account">My Account</a>
            <a href="/wallet">Wallet</a>
            <a href="/#how-it-works">How it works</a>
            <a href="/#contact">Get in touch</a>
          </div>
          <div className="footer-invite">
            <Leaf size={32} />
            <h3>
              <Lines value={text(shell, "invitation")} />
            </h3>
            <a href="/#contact">
              Be part of the circle <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Nodics. Circa eWaste.</span>
          <span>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </span>
        </div>
      </footer>
      {login && (
        <Login
          sample={experience?.presentation.sampleMode === true}
          onClose={() => setLogin(false)}
          onLogin={onLogin}
        />
      )}
      <SubmissionAssistant
        open={assistant}
        setOpen={setAssistant}
        session={session}
        experience={experience}
        selectedCentre={selectedCentre}
        onLogin={() => setLogin(true)}
        onSubmitted={refreshAll}
        resumeCode={resumeCode}
      />
    </div>
  );
}
function MapCount({ count }: { count?: number }) {
  return <>{count === undefined ? "Loading" : `${count} collection centres`}</>;
}
