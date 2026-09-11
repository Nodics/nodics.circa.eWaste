import { AccountDashboard } from "../AccountDashboard";
import { CustomerUpdates } from "../OutcomeInbox";
import { AccountSectionPage, accountHref, readAccountSection, type AccountDetailSection, type AccountSection } from "../AccountSections";
import { readWasteSelection } from "../features/waste/wasteNavigation";
import { CustomerWasteWorkspace } from "../features/waste/CustomerWasteWorkspace";
import { usePublishedPage } from "../cms";
import { MobileSiteFooter } from "./MobileSiteFooter";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  Home,
  Leaf,
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  API,
  endSession,
  request,
  type Account,
  type Experience,
  type Session,
  type Submission,
} from "../api";
import { CustomerAuthentication } from "../CustomerAuthentication";
import type { JourneyHost } from "../channels/journeyHost";
import { MobileSubmissionJourney } from "./MobileSubmissionJourney";
import { MobileHeader, MobileNotice } from "./MobilePrimitives";
import "./mobile.css";
import { MobileCentres } from "./MobileCentres";

type Tab = "home" | "centres" | "submissions" | "account";
const tabs = [
  { code: "home", label: "Home", icon: Home },
  { code: "centres", label: "Centres", icon: MapPin },
  { code: "submissions", label: "Items", icon: ClipboardList },
  { code: "account", label: "Account", icon: UserRound },
] as const;
const isDraft = (item: Submission) =>
  [
    "DRAFT",
    "MEDIA_STAGED",
    "METADATA_SUGGESTED",
    "AWAITING_SUBMITTER_CONFIRMATION",
  ].includes(item.submissionStatus);

/** One mobile product shell; host adapters supply platform capabilities, never domain state. */
export function MobileApp({
  session,
  experience,
  host,
  onLogin,
  onLogout,
  initialSubmissionCode,
}: {
  session: Session | null;
  experience: Experience;
  host: JourneyHost;
  initialSubmissionCode?: string;
  onLogin: (value: Session) => Promise<void> | void;
  onLogout: () => void;
}) {
  const requestedSelection = initialSubmissionCode
    ? { resource: "submissions" as const, code: initialSubmissionCode }
    : readWasteSelection(true);
  const requestedCollection = ["submissions", "assets", "drafts"].includes(
    new URL(window.location.href).searchParams.get("view") || "",
  );
  const requestedAccount = readAccountSection(true);
  const accountOverview = new URL(window.location.href).searchParams.get("account") === "overview";
  const [tab, setTab] = useState<Tab>(
      requestedSelection || requestedCollection
        ? session
          ? "submissions"
          : "account"
        : requestedAccount || accountOverview ? "account" : "home",
    ),
    [flow, setFlow] = useState<{ code?: string } | null>(null);
  const [accountSection, setAccountSection] = useState<AccountDetailSection | null>(requestedSelection ? null : requestedAccount);
  const [initialTarget, setInitialTarget] = useState(
    requestedSelection || undefined,
  );
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [signInToSubmit, setSignInToSubmit] = useState(false);
  const [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [signingOut, setSigningOut] = useState(false),
    [logoutError, setLogoutError] = useState("");
  const content = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const cms = usePublishedPage("/", 0);
  const branding = cms.page?.sections.find(
    (section) => section.renderer === "circa.shell",
  )?.properties;
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setAccount(null);
    setError("");
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void request<Account>(`${API}/account`, session)
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your submissions couldn’t load.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.token, session?.loginId, reload]);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden && !flow) refresh();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [flow, refresh]);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
    setScrolled(false);
  }, [tab, flow, accountSection]);
  const navigateAccount = useCallback((section: AccountSection | "overview") => {
    history.pushState({}, "", accountHref(section, true));
    setAccountSection(section === "items" || section === "overview" ? null : section);
    setInitialTarget(undefined);
    setTab(section === "items" ? "submissions" : "account");
  }, []);
  const backToAccount = useCallback(() => navigateAccount("overview"), [navigateAccount]);
  useEffect(() => {
    const pop = () => {
      const selected = readAccountSection(true);
      setAccountSection(selected);
      if (selected || new URL(window.location.href).searchParams.get("account") === "overview") setTab("account");
      else if (readWasteSelection(true) || new URL(window.location.href).searchParams.has("view")) setTab("submissions");
      else setTab("home");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const home = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("account");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    setAccountSection(null);
    setTab("home");
    setSignInToSubmit(false);
    if (content.current) content.current.scrollTop = 0;
    setScrolled(false);
  }, []);
  useEffect(() => {
    if (!updatesOpen && !flow && tab !== "home" && tab !== "submissions")
      return host.bindBack?.(accountSection && session ? backToAccount : home);
  }, [host, flow, tab, home, updatesOpen, accountSection, session, backToAccount]);
  const start = () => {
    if (!session) {
      setSignInToSubmit(true);
      setTab("account");
      return;
    }
    sessionStorage.removeItem(`circa.draft.${session.loginId}`);
    sessionStorage.removeItem(`circa.draft.${session.loginId}.create`);
    setFlow({});
  };
  const leaveFlow = useCallback(() => {
    setFlow(null);
    setTab("submissions");
    refresh();
  }, [refresh]);
  const items = account?.submissions || [];
  const saved = items.find(isDraft);

  if (flow && session)
    return (
      <MobileSubmissionJourney
        branding={branding}
        session={session}
        experience={experience}
        host={host}
        code={flow.code}
        onExit={leaveFlow}
        onSubmitted={refresh}
      />
    );
  return (
    <section className="mobile-app" aria-label="Circa mobile app">
      <MobileHeader
        action={
          session ? (
            <CustomerUpdates
              session={session}
              mobile
              host={host}
              onToggle={setUpdatesOpen}
            />
          ) : undefined
        }
        branding={branding}
        scrolled={scrolled}
        onHome={home}
        title={
          tab === "home"
            ? "Recycle. Reuse. Repeat."
            : tabs.find((item) => item.code === tab)!.label
        }
      />
      <div
        className="mobile-content"
        ref={content}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 48)}
      >
        {tab === "home" && (
          <>
            <div className="mobile-welcome">
              <span className="mobile-eyebrow">
                A fresh start for your electronics
              </span>
              <h1>
                Small actions.
                <br />
                <em>Better tomorrows.</em>
              </h1>
              <p>
                Give the things you no longer use
                <br />a responsible next chapter.
              </p>
            </div>
            <div className="mobile-hero">
              <img
                src="/nodics/media/v0/content/circa-hero-second-life"
                alt="Electronics ready for a second life"
              />
              <div className="mobile-hero-shade" />
              <div className="mobile-hero-copy">
                <span>
                  <Leaf size={15} /> Make room for good
                </span>
                <h2>
                  Your next good
                  <br />
                  thing starts here.
                </h2>
                <button className="mobile-primary" onClick={start}>
                  Recycle an item <Plus size={20} />
                </button>
              </div>
            </div>
            {saved && (
              <button
                className="mobile-resume"
                onClick={() => setFlow({ code: saved.code })}
              >
                <span className="mobile-icon-tile">
                  <ClipboardList size={21} />
                </span>
                <span>
                  <strong>Pick up where you left off</strong>
                  <small>
                    {saved.submittedFacts.name || "Your saved item"}
                  </small>
                </span>
                <ChevronRight size={20} />
              </button>
            )}
            {session && loading && (
              <p className="mobile-caption" role="status">
                Checking your saved submissions…
              </p>
            )}
            {session && error && (
              <MobileNotice retry={refresh}>{error}</MobileNotice>
            )}
            <div className="mobile-section-heading">
              <h2>Close by. Easy to do.</h2>
              <button className="mobile-text" onClick={() => setTab("centres")}>
                Find centres <ArrowRight size={16} />
              </button>
            </div>
            <button
              className="mobile-discovery"
              onClick={() => setTab("centres")}
            >
              <span className="mobile-icon-tile">
                <MapPin size={23} />
              </span>
              <span>
                <strong>Your next collection point</strong>
                <small>Browse locations and plan your visit.</small>
              </span>
              <ChevronRight size={20} />
            </button>
            <div className="mobile-section-heading">
              <h2>A simpler way to recycle</h2>
            </div>
            <ol className="mobile-how">
              <li>
                <span>01</span>
                <div>
                  <strong>Visit a centre</strong>
                  <p>Find a convenient collection point.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Show us your item</strong>
                  <p>Take a photo. Check the details.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Follow its next chapter</strong>
                  <p>See the review outcome in Submissions.</p>
                </div>
              </li>
            </ol>
            <p className="mobile-brand-note">
              <Leaf size={16} /> Thoughtful recycling, one item at a time.
            </p>
          </>
        )}
        {tab === "centres" && (
          <MobileCentres experience={experience} host={host} onStart={start} />
        )}
        {tab === "submissions" && (
          <>
            {!session ? (
              <div className="mobile-empty">
                <ClipboardList size={34} />
                <h2>Your items, all together</h2>
                <p>
                  Sign in to see saved items, review outcomes and owned assets.
                </p>
                <button
                  className="mobile-primary"
                  onClick={() => setTab("account")}
                >
                  Sign in
                </button>
              </div>
            ) : (
              <CustomerWasteWorkspace
                session={session}
                mobile
                host={updatesOpen ? undefined : host}
                initialSelection={initialTarget}
                onNavigate={() => setInitialTarget(undefined)}
                onContinue={(code) => {
                  setInitialTarget(undefined);
                  setFlow({ code });
                }}
                onBackToAccount={backToAccount}
                revision={reload}
              />
            )}
          </>
        )}
        {tab === "account" && session && accountSection ? (
          <AccountSectionPage key={accountSection + session.token} section={accountSection} session={session} mobile onBack={backToAccount} onRefresh={refresh}/>
        ) : tab === "account" && (
          <>
            {!session && <span className="mobile-eyebrow">Your space in Circa</span>}
            {!session ? (
              <>
                <div className="mobile-account-art">
                  <UserRound size={32} />
                </div>
                <CustomerAuthentication
                  sample={experience.presentation.sampleMode === true}
                  onLogin={async (value) => {
                    await onLogin(value);
                    if (signInToSubmit) {
                      setFlow({});
                      setSignInToSubmit(false);
                    } else
                      setTab(
                        accountSection || accountOverview ? "account" : initialTarget || requestedCollection
                          ? "submissions"
                          : "home",
                      );
                  }}
                />
                <div className="mobile-trust">
                  <ShieldCheck size={19} />
                  <p>
                    Use the same Circa account across the website and Telegram.
                  </p>
                </div>
              </>
            ) : (
              <>
                <AccountDashboard session={session} mobile revision={reload} onNavigate={navigateAccount} onStart={start} onItems={(target) => {
                  history.pushState({}, "", target);
                  setAccountSection(null);
                  setInitialTarget(readWasteSelection(true) || undefined);
                  setTab("submissions");
                }}/>
                {logoutError && <MobileNotice>{logoutError}</MobileNotice>}
                <button
                  className="mobile-secondary"
                  disabled={signingOut}
                  onClick={async () => {
                    setSigningOut(true);
                    setLogoutError("");
                    try {
                      await endSession();
                      onLogout();
                      setTab("home");
                    } catch {
                      setLogoutError(
                        "Sign-out could not finish. Check your connection and try again.",
                      );
                    } finally {
                      setSigningOut(false);
                    }
                  }}
                >
                  <LogOut size={18} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            )}
          </>
        )}
        <MobileSiteFooter content={branding} onHome={home} />
      </div>
      <nav className="mobile-tabs" aria-label="Main navigation">
        {tabs.map(({ code, label, icon: Icon }) => (
          <button
            key={code}
            aria-current={tab === code ? "page" : undefined}
            onClick={() => {
              if (code === "account") navigateAccount("overview");
              else if (code === "submissions") navigateAccount("items");
              else {
                const url = new URL(window.location.href);
                url.searchParams.delete("account");
                history.replaceState(history.state, "", url.pathname + url.search + url.hash);
                setAccountSection(null);
                setTab(code);
              }
              setSignInToSubmit(false);
            }}
          >
            <Icon size={21} strokeWidth={tab === code ? 2.2 : 1.7} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
