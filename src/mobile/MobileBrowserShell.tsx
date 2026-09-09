import { useEffect, useState } from "react";
import { APP_API, request, restoreSession, saveSession, type Experience, type Session } from "../api";
import { webJourneyHost } from "../channels/journeyHost";
import { MobileLaunchScreen } from "./MobileLaunchScreen";
import { MobileApp } from "./MobileApp";
import { MobileNotice } from "./MobilePrimitives";

/** Browser entry for the same mobile experience; no Telegram context is required. */
export function MobileBrowserShell() {
  const [session, setSession] = useState<Session | null>(null), [experience, setExperience] = useState<Experience | null>(null);
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void Promise.all([request<Experience>(`${APP_API}/experience`), restoreSession()]).then(([data, value]) => { if (active) { setSession(value); setExperience(data); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Circa could not load."); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <main className="mobile-boot"><h1>Let’s reconnect.</h1><MobileNotice retry={() => setAttempt(value => value + 1)}>{error}</MobileNotice></main>;
  if (!experience) return <MobileLaunchScreen/>;
  return <MobileApp session={session} experience={experience} host={webJourneyHost} onLogin={value => { saveSession(value); setSession(value); }} onLogout={() => setSession(null)}/>;
}
