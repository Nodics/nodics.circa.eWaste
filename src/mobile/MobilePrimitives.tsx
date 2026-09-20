import { CircaBrand } from "../CircaBrand";
import { contentText, type Content } from "../cms";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import { nameOf, type Centre } from "../api";
import type { JourneyHost } from "../channels/journeyHost";
import { formatCentreDistance } from "../map/sortCentresByDistance";

export function MobileHeader({ title, back, action, branding, scrolled = false, onHome }: { title: string; back?: () => void; action?: ReactNode; branding?: Content; scrolled?: boolean; onHome?: () => void }) {
  return <header className={`mobile-header ${back ? 'mobile-header-journey' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
    {back ? <>
      <button className="mobile-icon" aria-label="Go back" onClick={back}><ArrowLeft size={21}/></button>
      <div className="mobile-header-context"><span className="mobile-header-eyebrow">{contentText(branding, "brand")}</span><span className="mobile-header-title">{title}</span></div>
    </> : <div className="mobile-header-identity">
      {branding ? <CircaBrand light={scrolled} content={branding} onClick={onHome ? event => { event.preventDefault(); onHome(); } : undefined}/> : <span className="mobile-header-brand-placeholder">Circa</span>}
      <span className="mobile-header-title sr-only">{title}</span>
    </div>}

    <div className="mobile-header-action">{action || <span className="mobile-header-spacer"/>}</div>
  </header>;
}
export function MobileNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <div className="mobile-notice" role="alert"><p>{children}</p>{retry && <button className="mobile-text" onClick={retry}>Try again</button>}</div>;
}
export function LeaveDialog({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog className="mobile-dialog" ref={dialog} onCancel={(event) => { event.preventDefault(); onStay(); }} aria-labelledby="leave-title">
    <h2 id="leave-title">Discard these changes?</h2>
    <p>Your unsaved edits will be discarded. The last saved version will remain available.</p>
    <button autoFocus className="mobile-primary" onClick={onStay}>Keep editing</button>
    <button className="mobile-secondary" onClick={onLeave}>Discard changes</button>
  </dialog>;
}
export function CentreCard({ centre, host, choose, disabled }: { centre: Centre; host: JourneyHost; choose?: () => void; disabled?: boolean }) {
  const position = centre.location || centre;
  const located = Number.isFinite(position.latitude) && Number.isFinite(position.longitude);
  return <article className="mobile-centre-card">
    <div className="mobile-row"><span className="mobile-icon-tile"><MapPin size={20}/></span><div><h3>{nameOf(centre.name)}</h3><p>{[centre.addressLine, centre.city].filter(Boolean).join(", ")}</p></div></div>
    {centre.metadata?.hours && <p className="mobile-centre-hours">{centre.metadata.hours}</p>}
    {centre.acceptanceSummary && <p>{nameOf(centre.acceptanceSummary)}</p>}
    <div className="mobile-row mobile-between">
      <small>{formatCentreDistance(centre.distanceMetres ?? null) || "Collection centre"}</small>
      {located && <button className="mobile-text" aria-label={`Directions to ${nameOf(centre.name)}`} onClick={() => host.openMap(`https://www.google.com/maps/dir/?api=1&destination=${position.latitude},${position.longitude}`)}>Directions <ArrowUpRight size={16}/></button>}
    </div>
    {choose && <button className="mobile-primary" disabled={disabled} onClick={choose}>Use this centre</button>}
  </article>;
}
