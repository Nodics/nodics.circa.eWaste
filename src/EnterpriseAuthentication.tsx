import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { authenticateEnterpriseSession, enterpriseSessionHint, type EnterpriseSession } from "./api";
import "./EnterpriseSession.css";

/** Employee PASSWORD proof stays transient; only Profile-confirmed access reaches the host. */
export function EnterpriseAuthentication({ onLogin }: { onLogin: (session: EnterpriseSession) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const mounted = useRef(false), pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <form className="customer-authentication enterprise-authentication" aria-label="Enterprise sign in" onSubmit={async event => {
    event.preventDefault(); if (pending.current) return;
    const form = event.currentTarget, fields = new FormData(form);
    const enterprise = String(fields.get("enterprise") || "").trim(), login = String(fields.get("loginId") || "").trim(), password = String(fields.get("password") || "");
    (form.elements.namedItem("password") as HTMLInputElement).value = "";
    pending.current = true; setBusy(true); setError("");
    try {
      const session = await authenticateEnterpriseSession(enterprise, login, password);
      if (mounted.current) await onLogin(session);
    } catch { if (mounted.current) setError("Enterprise sign-in could not be confirmed. Check your credentials and Enterprise access."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }}>
    <h3><Building2 size={20} aria-hidden="true" /> Enterprise account</h3>
    <label>Enterprise code<input name="enterprise" required maxLength={128} autoComplete="organization" defaultValue={enterpriseSessionHint() || ""} disabled={busy} /></label>
    <label>Employee login<input name="loginId" required maxLength={320} autoComplete="username" disabled={busy} /></label>
    <label>Password<input name="password" type="password" required maxLength={10000} autoComplete="current-password" disabled={busy} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy ? "Signing in..." : "Sign in to Enterprise"}<ArrowRight size={18} aria-hidden="true" /></button>
  </form>;
}
