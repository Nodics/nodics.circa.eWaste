import { useEffect, useRef, useState } from "react";
import { Building2, Search, UserRound } from "lucide-react";
import { request, type Session } from "./api";

export type Participant = { ownerType: "CUSTOMER" | "ENTERPRISE"; ownerCode: string; displayName: string };
type Props = { session: Session; exclude?: { ownerType: string; ownerCode: string }; value: Participant | null;
  onChange: (value: Participant | null) => void; disabled?: boolean };

/** Shared existing-participant picker. Profile supplies safe display identity; the destination operation rechecks eligibility. */
export function ParticipantSearch(props: Props) {
  return <SearchFields key={props.session.token} {...props} />;
}
function SearchFields({ session, exclude, value, onChange, disabled }: Props) {
  const [ownerType, setOwnerType] = useState<Participant["ownerType"]>("CUSTOMER");
  const [search, setSearch] = useState(""), [results, setResults] = useState<Participant[]>([]);
  const [searched, setSearched] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const reset = () => { generation.current++; setResults([]); setSearched(false); setError(""); setBusy(false); onChange(null); };
  async function find() {
    const attempt = ++generation.current;
    setBusy(true); setError(""); setResults([]); setSearched(false); onChange(null);
    try {
      const result = await request<{ contractVersion: number; items: Participant[] }>(
        "/nodics/profile/v0/participants/search", session, { ownerType, search: search.trim() });
      if (generation.current !== attempt) return;
      if (result.contractVersion !== 1 || !Array.isArray(result.items) || result.items.some(item =>
        item.ownerType !== ownerType || !item.ownerCode || typeof item.displayName !== "string")) throw new Error("Recipient search could not be confirmed.");
      setResults(result.items.filter(item => item.ownerType !== exclude?.ownerType || item.ownerCode !== exclude.ownerCode));
      setSearched(true);
    } catch (cause) { if (generation.current === attempt) setError(cause instanceof Error ? cause.message : "Recipient search unavailable."); }
    finally { if (generation.current === attempt) setBusy(false); }
  }
  return <div className="participant-search">
    <label>Recipient type<select value={ownerType} disabled={disabled || busy} onChange={event => { reset(); setOwnerType(event.target.value as Participant["ownerType"]); }}>
      <option value="CUSTOMER">Customer</option><option value="ENTERPRISE">Enterprise</option></select></label>
    <label>Find recipient<div className="transfer-search"><input value={search} disabled={disabled || busy}
      onChange={event => { reset(); setSearch(event.target.value); }} />
      <button type="button" className="secondary" disabled={disabled || busy || !search.trim()} onClick={() => void find()}><Search size={17} /> Search</button></div></label>
    {error && <p role="alert" className="error">{error}</p>}
    {searched && !results.length && <p>No matching recipients.</p>}
    <div className="transfer-recipients">{results.map(item => <label key={item.ownerType + item.ownerCode}>
      <input type="radio" name="recipient" disabled={disabled} checked={value?.ownerCode === item.ownerCode && value.ownerType === item.ownerType} onChange={() => onChange(item)} />
      {item.ownerType === "CUSTOMER" ? <UserRound size={18} /> : <Building2 size={18} />}<span>{item.displayName}<small>{item.ownerCode}</small></span>
    </label>)}</div>
  </div>;
}
