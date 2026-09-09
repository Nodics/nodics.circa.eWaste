import { usePublishedPage } from "../cms";
import { MobileSiteFooter } from "./MobileSiteFooter";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronRight, ClipboardList, Home, Leaf, LogOut, MapPin, Plus, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { API, endSession, request, statusLabel, type Account, type Experience, type Session, type Submission } from "../api";
import { CustomerAuthentication } from "../CustomerAuthentication";
import type { JourneyHost } from "../channels/journeyHost";
import { MobileSubmissionJourney } from "./MobileSubmissionJourney";
import { MobileHeader, MobileNotice } from "./MobilePrimitives";
import "./mobile.css";
import { MobileCentres } from "./MobileCentres";

type Tab = "home" | "centres" | "submissions" | "account";
const tabs = [{ code: "home", label: "Home", icon: Home }, { code: "centres", label: "Centres", icon: MapPin }, { code: "submissions", label: "Submissions", icon: ClipboardList }, { code: "account", label: "Account", icon: UserRound }] as const;
const isDraft = (item: Submission) => ["DRAFT", "MEDIA_STAGED", "METADATA_SUGGESTED", "AWAITING_SUBMITTER_CONFIRMATION"].includes(item.submissionStatus);

/** One mobile product shell; host adapters supply platform capabilities, never domain state. */
export function MobileApp({ session, experience, host, onLogin, onLogout }: {
  session: Session | null; experience: Experience; host: JourneyHost;
  onLogin: (value: Session) => Promise<void> | void; onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home"), [flow, setFlow] = useState<{ code?: string } | null>(null);
  const [signInToSubmit, setSignInToSubmit] = useState(false);
  const [account, setAccount] = useState<Account | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState("All"), [signingOut, setSigningOut] = useState(false), [logoutError, setLogoutError] = useState("");
  const content = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const cms = usePublishedPage("/", 0);
  const branding = cms.page?.sections.find(section => section.renderer === "circa.shell")?.properties;
  const refresh = useCallback(() => setReload(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setAccount(null); setError("");
    if (!session) { setLoading(false); return; }
    setLoading(true);
    void request<Account>(`${API}/account`, session).then(value => { if (active) setAccount(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Your submissions couldn’t load."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.token, session?.loginId, reload]);
  useEffect(() => {
    const visible = () => { if (!document.hidden && !flow) refresh(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [flow, refresh]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; setScrolled(false); }, [tab, flow]);
  const home = useCallback(() => { setTab("home"); setSignInToSubmit(false); if (content.current) content.current.scrollTop = 0; setScrolled(false); }, []);
  useEffect(() => { if (!flow && tab !== "home") return host.bindBack?.(home); }, [host, flow, tab, home]);
  const start = () => {
    if (!session) { setSignInToSubmit(true); setTab("account"); return; }
    sessionStorage.removeItem(`circa.draft.${session.loginId}`);
    sessionStorage.removeItem(`circa.draft.${session.loginId}.create`);
    setFlow({});
  };
  const leaveFlow = useCallback(() => { setFlow(null); setTab("submissions"); refresh(); }, [refresh]);
  const items = account?.submissions || [];
  const saved = items.find(isDraft);
  const filtered = items.filter(item => filter === "All" || (filter === "Drafts" ? isDraft(item) : filter === "In review" ? item.submissionStatus === "SUBMITTED" : ["APPROVED", "REJECTED"].includes(item.submissionStatus)));
  if (flow && session) return <MobileSubmissionJourney branding={branding} session={session} experience={experience} host={host} code={flow.code} onExit={leaveFlow} onSubmitted={refresh}/>;
  return <section className="mobile-app" aria-label="Circa mobile app">
    <MobileHeader branding={branding} scrolled={scrolled} onHome={home} title={tab === "home" ? "Recycle. Reuse. Repeat." : tabs.find(item => item.code === tab)!.label} action={<button className="mobile-header-account" aria-label="Open account" onClick={() => { setTab('account'); setSignInToSubmit(false); }}>{session ? <span aria-hidden="true">{session.loginId[0]?.toUpperCase()}</span> : <UserRound size={21} strokeWidth={1.7} aria-hidden="true"/>}</button>}/>
    <div className="mobile-content" ref={content} onScroll={event => setScrolled(event.currentTarget.scrollTop > 48)}>
      {tab === "home" && <>
        <div className="mobile-welcome"><span className="mobile-eyebrow">A fresh start for your electronics</span><h1>Small actions.<br/><em>Better tomorrows.</em></h1><p>Give the things you no longer use<br/>a responsible next chapter.</p></div>
        <div className="mobile-hero"><img src="/nodics/media/v0/content/circa-hero-second-life" alt="Electronics ready for a second life"/><div className="mobile-hero-shade"/><div className="mobile-hero-copy"><span><Leaf size={15}/> Make room for good</span><h2>Your next good<br/>thing starts here.</h2><button className="mobile-primary" onClick={start}>Recycle an item <Plus size={20}/></button></div></div>
        {saved && <button className="mobile-resume" onClick={() => setFlow({ code: saved.code })}><span className="mobile-icon-tile"><ClipboardList size={21}/></span><span><strong>Pick up where you left off</strong><small>{saved.submittedFacts.name || "Your saved item"}</small></span><ChevronRight size={20}/></button>}
        {session && loading && <p className="mobile-caption" role="status">Checking your saved submissions…</p>}
        {session && error && <MobileNotice retry={refresh}>{error}</MobileNotice>}
        <div className="mobile-section-heading"><h2>Close by. Easy to do.</h2><button className="mobile-text" onClick={() => setTab("centres")}>Find centres <ArrowRight size={16}/></button></div>
        <button className="mobile-discovery" onClick={() => setTab("centres")}><span className="mobile-icon-tile"><MapPin size={23}/></span><span><strong>Your next collection point</strong><small>Browse locations and plan your visit.</small></span><ChevronRight size={20}/></button>
        <div className="mobile-section-heading"><h2>A simpler way to recycle</h2></div>
        <ol className="mobile-how"><li><span>01</span><div><strong>Visit a centre</strong><p>Find a convenient collection point.</p></div></li><li><span>02</span><div><strong>Show us your item</strong><p>Take a photo. Check the details.</p></div></li><li><span>03</span><div><strong>Follow its next chapter</strong><p>See the review outcome in Submissions.</p></div></li></ol>
        <p className="mobile-brand-note"><Leaf size={16}/> Thoughtful recycling, one item at a time.</p>
      </>}
      {tab === "centres" && <MobileCentres experience={experience} host={host} onStart={start}/>}
      {tab === "submissions" && <>
        <span className="mobile-eyebrow">Every item has a story</span><div className="mobile-row mobile-between"><h1>Your submissions.</h1>{session && <button className="mobile-icon" aria-label="Refresh submissions" disabled={loading} onClick={refresh}><RefreshCw size={20}/></button>}</div><p>Continue a saved item or follow a review.</p>
        {!session ? <div className="mobile-empty"><ClipboardList size={34}/><h2>Your journey, all together</h2><p>Sign in to see your saved items and review outcomes.</p><button className="mobile-primary" onClick={() => setTab("account")}>Sign in</button></div> : <>
          <div className="mobile-filters" role="group" aria-label="Filter submissions">{["All", "Drafts", "In review", "Reviewed"].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
          {loading ? <div className="mobile-loading" role="status"><span className="mobile-spinner"/> Loading your submissions…</div> : error ? <MobileNotice retry={refresh}>{error}</MobileNotice> : filtered.length ? <div className="mobile-stack">{filtered.map(item => <button key={item.code} className="mobile-submission-card" onClick={() => setFlow({ code: item.code })}><div className="mobile-row mobile-between"><span className={`mobile-status status-${item.submissionStatus.toLowerCase()}`}>{statusLabel(item.submissionStatus)}</span><ChevronRight size={18}/></div><h2>{item.submittedFacts.name || "Untitled item"}</h2><p>{item.metadata.publicReason || (isDraft(item) ? "Ready when you are. Continue your saved progress." : "Open to view your submission and next steps.")}</p><small>{item.code}</small></button>)}</div> : <div className="mobile-empty"><Leaf size={35}/><h2>{filter === "All" ? "Your first step starts here" : "Nothing here yet"}</h2><p>{filter === "All" ? "Recycle your first item and follow its progress here." : "Items with this status will appear here."}</p><button className="mobile-primary" onClick={start}>Recycle an item <Plus size={18}/></button></div>}
        </>}
      </>}
      {tab === "account" && <>
        <span className="mobile-eyebrow">Your space in Circa</span>
        {!session ? <><div className="mobile-account-art"><UserRound size={32}/></div><CustomerAuthentication sample={experience.presentation.sampleMode === true} onLogin={async value => { await onLogin(value); if (signInToSubmit) { setFlow({}); setSignInToSubmit(false); } else setTab("home"); }}/><div className="mobile-trust"><ShieldCheck size={19}/><p>Use the same Circa account across the website and Telegram.</p></div></> : <>
          <h1>A little more you.</h1><div className="mobile-profile"><span className="mobile-avatar">{session.loginId[0]?.toUpperCase()}</span><h2>Your Circa account</h2><p>{session.loginId}</p></div>
          <button className="mobile-discovery" onClick={() => setTab("submissions")}><ClipboardList size={22}/><span><strong>Your submissions</strong><small>Saved items, progress and reviewer comments</small></span><ChevronRight size={18}/></button>
          <div className="mobile-card"><ShieldCheck size={22}/><h2>One account. Every visit.</h2><p>Your saved submissions belong to your Circa account. Return here to continue or check a review.</p></div>
          {logoutError && <MobileNotice>{logoutError}</MobileNotice>}
          <button className="mobile-secondary" disabled={signingOut} onClick={async () => { setSigningOut(true); setLogoutError(""); try { await endSession(); onLogout(); setTab("home"); } catch { setLogoutError("Sign-out could not finish. Check your connection and try again."); } finally { setSigningOut(false); } }}><LogOut size={18}/>{signingOut ? "Signing out…" : "Sign out"}</button>
        </>}
      </>}
      <MobileSiteFooter content={branding} onHome={home}/>
    </div>
    <nav className="mobile-tabs" aria-label="Main navigation">{tabs.map(({ code, label, icon: Icon }) => <button key={code} aria-current={tab === code ? "page" : undefined} onClick={() => { setTab(code); setSignInToSubmit(false); }}><Icon size={21} strokeWidth={tab === code ? 2.2 : 1.7}/><span>{label}</span></button>)}</nav>
  </section>;
}
