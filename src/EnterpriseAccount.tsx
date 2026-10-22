import { useEffect, useState } from "react";
import { Building2, RefreshCw, Wallet as WalletIcon } from "lucide-react";
import { request, type EnterpriseSession, type EnterpriseMembership } from "./api";
import { EnterpriseSessionControls } from "./EnterpriseSessionControls";
import { BundleGifts } from "./BundleGifts";
import { RewardTransfer } from "./RewardTransfer";
import { PartnerRewardConversion } from "./PartnerRewardConversion";
import { BundleCompositionPage } from "./features/bundles/BundleCompositionPage";
import { CarbonHoldings } from "./CarbonHoldings";
import { PurchaseHistory } from "./PurchaseHistory";
import "./EnterpriseSession.css";

const sections = [["/account", "Enterprise"], ["/wallet", "Wallet"], ["/account/entitlements", "Entitlements"],
  ["/account/bids", "Bids"], ["/account/bundles", "Create bundle"], ["/account/gifts", "Gifts"], ["/account/carbon", "Carbon & materials"]] as const;
type Row = Record<string, unknown>;
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Owner evidence could not be confirmed.");
  return value as Row;
}
function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw Error("Owner evidence could not be confirmed.");
  return value;
}
function quantity(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !/^-?\d+(?:\.\d+)?$/.test(value)) throw Error("Recorded amount could not be confirmed.");
  return value;
}
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 500) throw Error("Owner list could not be confirmed.");
  const result = value.map(object);
  if (new Set(result.map(row => label(row.code))).size !== result.length) throw Error("Owner list is ambiguous.");
  return result;
}

/** Session/path keying drops all prior owner data before a new account view is mounted. */
export function EnterpriseAccount(props: { session: EnterpriseSession; path: string; onSwitch: (membership: EnterpriseMembership) => void }) {
  const path = props.path === "/account/wallet" ? "/wallet" : props.path === "/account/purchases" ? "/account/entitlements" : props.path;
  return <Account key={props.session.token + ":" + props.session.enterpriseCode + ":" + path} {...props} path={path} />;
}
function Account({ session, path, onSwitch }: Parameters<typeof EnterpriseAccount>[0]) {
  const ownerRef = { module: "profile" as const, schema: "enterprise" as const, code: session.enterpriseCode };
  return <main className="container enterprise-account">
    <header className="enterprise-heading"><Building2 size={28} aria-hidden="true" /><div><p>Enterprise account</p><h1>{session.enterpriseCode}</h1></div></header>
    <nav className="enterprise-navigation" aria-label="Enterprise account navigation">{sections.map(([href, name]) => <a key={href} href={href} aria-current={path === href ? "page" : undefined}>{name}</a>)}</nav>
    {path === "/account" ? <EnterpriseSessionControls session={session} onSwitch={onSwitch} />
      : path === "/wallet" ? <EnterpriseWallet session={session} />
        : path === "/account/bundles" ? <BundleCompositionPage session={session} />
        : path === "/account/gifts" ? <BundleGifts session={session} ownerRef={ownerRef} />
          : path === "/account/carbon" ? <CarbonHoldings session={session} />
            : path === "/account/entitlements" ? <PurchaseHistory session={session} offers={[]} />
              : path === "/account/bids" ? <EnterpriseBidList session={session} />
                : <section><h2>Personal account section</h2><p>This section is unavailable in an Enterprise session.</p><a href="/account">Return to Enterprise account</a></section>}
  </main>;
}
type WalletView = { wallet: { code: string } | null; balances: { code: string; program: string; unit: string; available: string; reserved: string }[];
  entries: { code: string; type: string; amount: string; unit: string; postedAt: string }[] };
function walletProjection(value: unknown, session: EnterpriseSession): WalletView {
  const data = object(value), owner = object(data.owner);
  if (owner.ownerType !== "ENTERPRISE" || owner.ownerCode !== session.enterpriseCode) throw Error("Wallet owner could not be confirmed.");
  const wallet = data.wallet === null ? null : object(data.wallet);
  if (wallet && (wallet.ownerType !== "ENTERPRISE" || wallet.ownerCode !== session.enterpriseCode)) throw Error("Wallet owner could not be confirmed.");
  const balances = rows(data.balances).map(row => ({ code: label(row.code), program: label(row.programCode), unit: label(row.rewardTypeCode), available: quantity(row.available), reserved: quantity(row.reserved) }));
  const entries = rows(data.entries).map(row => {
    const postedAt = label(row.postedAt); if (!Number.isFinite(Date.parse(postedAt))) throw Error("Ledger evidence could not be confirmed.");
    return { code: label(row.code), type: label(row.entryType), amount: quantity(row.amount), unit: label(row.rewardTypeCode), postedAt };
  });
  if (!wallet && (balances.length || entries.length)) throw Error("Wallet evidence could not be confirmed.");
  return { wallet: wallet ? { code: label(wallet.code) } : null, balances, entries };
}
/** Exact canonical units; no inferred zeroes, carbon-as-rewards or account creation. */
export function EnterpriseWallet({ session }: { session: EnterpriseSession }) {
  const [data, setData] = useState<WalletView | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    request("/nodics/loyaltyApi/v0/participant/wallet", session, undefined, "GET", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(walletProjection(value, session)); })
      .catch(() => { if (!controller.signal.aborted) setError("Enterprise wallet is unavailable. Your access or wallet could not be confirmed."); });
    return () => controller.abort();
  }, [session, revision]);
  return <section aria-label="Enterprise wallet">
    <div className="enterprise-section-heading"><h2><WalletIcon size={22} /> Wallet</h2><button className="icon-button" title="Refresh wallet" aria-label="Refresh wallet" onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button></div>
    {error ? <p className="error" role="alert">{error}</p> : !data ? <p role="status">Loading wallet...</p> : !data.wallet ? <p>No Enterprise wallet has been provisioned.</p> : <>
      {!data.balances.length && <p>No reward balances recorded.</p>}
      <div className="enterprise-table"><table><caption>Reward balances</caption><thead><tr><th>Program</th><th>Reward</th><th>Available</th><th>Reserved</th></tr></thead>
        <tbody>{data.balances.map(row => <tr key={row.code}><td>{row.program}</td><td>{row.unit}</td><td>{row.available}</td><td>{row.reserved}</td></tr>)}</tbody></table></div>
      <h3>Recorded transactions</h3>{!data.entries.length && <p>No ledger entries recorded.</p>}
      <ul className="enterprise-records">{data.entries.map(row => <li key={row.code}><strong>{row.type}</strong><span>{row.amount} {row.unit}</span><time dateTime={row.postedAt}>{new Date(row.postedAt).toLocaleString()}</time></li>)}</ul>
      <RewardTransfer session={session} />
      <PartnerRewardConversion session={session} />
    </>}
  </section>;
}
type CommerceRow = { code: string; name: string; status: string; detail: string };
function bidProjection(value: unknown): CommerceRow[] {
  return rows(object(value).bids).map(row => {
    return { code: label(row.code), name: label(row.displayName ?? row.productCode), status: label(row.status),
      detail: quantity(row.amount) + " " + label(row.currency) };
  });
}
/** Read-only owner DTOs. No browser price/eligibility engine or customer eWaste purchase fallback. */
function EnterpriseBidList({ session }: { session: EnterpriseSession }) {
  const [data, setData] = useState<CommerceRow[] | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const title = "Bids";
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    request("/nodics/bidding/v0/bids", session, undefined, "GET", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(bidProjection(value)); })
      .catch(() => { if (!controller.signal.aborted) setError(`${title} are unavailable for this Enterprise session.`); });
    return () => controller.abort();
  }, [session, revision]);
  return <section aria-label={title}><div className="enterprise-section-heading"><h2>{title}</h2>
    <button className="icon-button" title={`Refresh ${title.toLowerCase()}`} aria-label={`Refresh ${title.toLowerCase()}`} onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button></div>
    {error ? <p className="error" role="alert">{error}</p> : !data ? <p role="status">Loading {title.toLowerCase()}...</p> : !data.length ? <p>No {title.toLowerCase()} recorded.</p> : null}
    <ul className="enterprise-records">{data?.map(row => <li key={row.code}><strong>{row.name}</strong><span>{row.status.replaceAll("_", " ")}</span><span>{row.detail}</span><small>{row.code}</small></li>)}</ul>
  </section>;
}
