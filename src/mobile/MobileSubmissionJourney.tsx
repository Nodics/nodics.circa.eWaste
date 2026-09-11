import { ItemDetailsCard } from "../features/submission/ItemDetailsCard";
import type { Content } from "../cms";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, CheckCircle2, ChevronRight, ImagePlus, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { nameOf, type Experience, type Facts, type Session } from "../api";
import type { JourneyHost } from "../channels/journeyHost";
import { useSubmissionJourney } from "../features/submission/useSubmissionJourney";
import { CentreCard, LeaveDialog, MobileHeader, MobileNotice } from "./MobilePrimitives";

const editableValues = (facts: Facts) => [facts.name || "", facts.description || ""];

/** Mobile presentation over the same owner-governed controller used by the website. */
export function MobileSubmissionJourney({ session, experience, host, code, onExit, onSubmitted, branding }: {
  branding?: Content; session: Session; experience: Experience; host: JourneyHost; code?: string; onExit: () => void; onSubmitted: () => void;
}) {
  const journey = useSubmissionJourney({ session, open: true, resumeCode: code, restoreFromStorage: false, host, captureTimeoutMs: experience.journey?.captureTimeoutMs, maximumAccuracyMetres: experience.journey?.maximumAccuracyMetres, maximumPositionAgeMs: experience.journey?.maximumPositionAgeMs, onSubmitted });
  const { draft, arrival, busy, error, preview, ready, submitted, permission } = journey;
  const [editing, setEditing] = useState(false), [facts, setFacts] = useState<Facts>({});
  const [previousStep, setPreviousStep] = useState<"centre" | "photo" | null>(null);
  const [help, setHelp] = useState(false), [message, setMessage] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const originalFacts = useRef<Facts>({});
  const hasUnsavedEdits = editing && editableValues(facts).some((value, index) => value !== editableValues(originalFacts.current)[index]);
  const content = useRef<HTMLDivElement>(null);
  const atCentre = arrival?.nextAction === "PHOTO";
  const step = submitted ? "receipt" : editing ? "edit" : !atCentre ? "centre" : previousStep || (ready ? "review" : "photo");
  const centre = arrival?.selectedCentre || experience.centres.find(item => item.code === draft?.submittedFacts.preferredCollectionPointCode);
  const goBack = useCallback(() => {
    if (busy) return;
    if (help) { setHelp(false); return; }
    if (editing) { if (hasUnsavedEdits) setDiscardOpen(true); else setEditing(false); return; }
    if (step === "review") { setPreviousStep("photo"); return; }
    if (step === "photo") { setPreviousStep("centre"); return; }
    onExit();
  }, [busy, help, editing, hasUnsavedEdits, step, onExit]);
  useEffect(() => host.bindBack?.(goBack), [host, goBack]);
  useEffect(() => { host.setClosingConfirmation?.(Boolean(busy || hasUnsavedEdits)); return () => host.setClosingConfirmation?.(false); }, [host, busy, hasUnsavedEdits]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [step, help]);
  const beginEdit = () => { originalFacts.current = { ...draft?.submittedFacts }; setFacts({ ...originalFacts.current }); setEditing(true); };
  const selectPhoto = async (file?: File) => { if (file) { setPreviousStep(null); await journey.upload(file); } };
  const stepIndex = step === "centre" ? 0 : step === "photo" ? 1 : 2;
  return <section className="mobile-app mobile-flow" aria-label="Recycling submission">
    <MobileHeader branding={branding} title={submitted ? "Submission details" : "Recycle an item"} back={goBack} action={<button className="mobile-icon" aria-label={help ? "Close help" : "Get help"} disabled={!!busy} onClick={() => setHelp(!help)}><MessageCircle size={21}/></button>}/>
    {!submitted && <nav className="mobile-progress" aria-label="Submission progress">{["Centre", "Photo", "Review"].map((label, index) => <span key={label} aria-current={index === stepIndex ? "step" : undefined} className={index < stepIndex ? "complete" : ""}><b>{index < stepIndex ? <Check size={13}/> : `0${index + 1}`}</b>{label}</span>)}</nav>}
    <div className="mobile-content" ref={content}>
      {busy && <div className="mobile-working" role="status"><span className="mobile-spinner"/><span>{busy}<small>Keep Circa open while this completes.</small></span></div>}
      {error && <MobileNotice>{error}</MobileNotice>}
      {help ? <section className="mobile-help">
        <span className="mobile-eyebrow">A little guidance</span><h1>How can we help?</h1><p>Ask about this submission or request a correction. You’ll review changes before submitting.</p>
        <div className="mobile-messages" aria-live="polite">{journey.messages.map((item, index) => <p key={index} className={item.role}><small>{item.role === "user" ? "You" : "Circa"}</small>{item.text}</p>)}</div>
        <form onSubmit={async event => { event.preventDefault(); const text = message; if (await journey.send(text)) setMessage(""); }}><label>Your question<textarea aria-label="Message Circa assistant" rows={3} maxLength={1500} value={message} onChange={event => setMessage(event.target.value)} disabled={!!busy}/></label><button className="mobile-primary" disabled={!!busy || !message.trim()}>Send message <ArrowRight size={18}/></button></form>
        <button className="mobile-text" onClick={() => setHelp(false)}>Back to your item</button>
      </section> : <>
        {step === "centre" && <>
          <span className="mobile-eyebrow">Step 01 · Your collection point</span>
          <h1>{arrival?.nextAction === "CHOOSE_CENTRE" ? "Choose your centre." : "Good things start nearby."}</h1>
          <p>Bring your electronics to a collection centre. We’ll confirm your arrival before you add a photo.</p>
          {!arrival && <div className="mobile-location-prompt"><span className="mobile-large-icon"><MapPin size={34}/></span><h2>Find your nearest centre</h2><p>{permission === "denied" ? "Location is blocked. Enable access in your device settings, then try again." : permission === "unavailable" ? "Location isn’t available on this device. Enable location or continue on your phone." : "Your location helps us find nearby centres and confirm you’re at the right place."}</p>{(permission === "denied" || !!error) && host.openLocationSettings && <button className="mobile-text" onClick={host.openLocationSettings}>Open location settings</button>}</div>}
          {arrival && <div className="mobile-stack">{(arrival.nextAction === "CHOOSE_CENTRE" ? arrival.nearbyCentres : atCentre && centre ? [centre] : arrival.centres).map(item => <CentreCard key={item.code} centre={item} host={host} disabled={!!busy} choose={arrival.nextAction === "CHOOSE_CENTRE" ? async () => { if (await journey.checkLocation(item.code)) setPreviousStep(null); } : undefined}/>)}{arrival.centres.length === 0 && !centre && <p>No collection centres are available right now. Please try again later.</p>}</div>}
        </>}
        {step === "photo" && <>
          <span className="mobile-eyebrow">Step 02 · A clear picture</span><h1>Let’s meet your item.</h1><p>Photograph one type of item at a time. Keep it fully in view, with enough light to see the details.</p>
          {centre && <div className="mobile-location-strip"><MapPin size={16}/><span>{nameOf(centre.name)}</span><CheckCircle2 size={16}/></div>}
          {!!preview && !ready && !busy && <div className="mobile-card mobile-recognition-recovery"><h2>Let’s check your photo</h2><p>Try identifying this photo again, or replace it with a clearer image. A new item is saved only after analysis succeeds.</p><button className="mobile-secondary" onClick={() => void journey.retryAnalysis()}>Retry image analysis</button></div>}
          <div className={`mobile-photo-well ${preview ? "has-photo" : ""}`}>{preview ? <img className="journey-photo" src={preview} alt="Your submitted item"/> : <><Camera size={46} strokeWidth={1.2}/><span>Your item goes here</span><small>A clear photo makes the next step easier.</small></>}</div>
          <div className="mobile-upload-actions"><label className="mobile-primary"><Camera size={19}/> {preview ? "Retake photo" : "Take photo"}<input aria-label="Take item photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void selectPhoto(file); }}/></label><label className="mobile-secondary"><ImagePlus size={19}/> {preview ? "Replace image" : "Choose from photos"}<input aria-label="Item photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void selectPhoto(file); }}/></label></div>
          <p className="mobile-caption">JPEG, PNG or WebP · Up to 5 MB<br/>Your photo is kept private with your submission.</p>
        </>}
        {step === "review" && draft && <>
          <span className="mobile-eyebrow">Step 03 · One final look</span><h1>A better next step.</h1><p>Check the suggested details. You’re in control of what gets submitted.</p>
          <ItemDetailsCard record={draft} image={preview} onEdit={!busy ? beginEdit : undefined}/>
          <button className="mobile-text" disabled={!!busy} onClick={() => setPreviousStep("photo")}>Replace photo <ChevronRight size={16}/></button>
          <div className="mobile-trust"><ShieldCheck size={18}/><p>Submitting sends this item for review. We’ll check your location once more to confirm arrival.</p></div>
        </>}
        {step === "edit" && <form id="mobile-item-editor" className="mobile-editor" onSubmit={async event => { event.preventDefault(); if (await journey.edit(facts)) { setEditing(false); setPreviousStep(null); } }}>
          <span className="mobile-eyebrow">Make it yours</span><h1>Check the details.</h1><p>Edit the name and description. The collection team reviews all other properties.</p>
          <label>Item name<input required maxLength={180} value={facts.name || ""} onChange={event => setFacts({ ...facts, name: event.target.value })} disabled={!!busy}/></label>
          <label>Description<textarea maxLength={2000} rows={4} value={facts.description || ""} onChange={event => setFacts({ ...facts, description: event.target.value })} disabled={!!busy}/></label>
        </form>}
        {step === "receipt" && draft && <>
          <div className={`mobile-receipt ${draft.submissionStatus === "REJECTED" ? "needs-attention" : ""}`}><span className="mobile-large-icon">{draft.submissionStatus === "REJECTED" ? <MessageCircle size={32}/> : <Check size={36}/>}</span><span className="mobile-eyebrow">{draft.submissionStatus === "SUBMITTED" ? "Safely received" : "Review outcome"}</span><h1>{draft.submissionStatus === "APPROVED" ? "Approved." : draft.submissionStatus === "REJECTED" ? "Not approved." : "You’ve done your part."}</h1><p>{draft.descriptor?.identity.name || draft.submittedFacts.name || "Your item"}</p></div>
          {!["APPROVED", "REJECTED"].includes(draft.submissionStatus) && <div className="mobile-card"><h2>What happens next</h2><p>{draft.metadata.reviewAssignment?.status === "ASSIGNED" ? "The review team will check your item. You can follow the decision and reviewer’s comments in Submissions." : "Your submission is saved. We’re waiting for a reviewer to be assigned."}</p>{draft.submissionStatus === "SUBMITTED" && draft.metadata.depositInstruction && <div className="mobile-deposit"><strong>At the centre</strong><p>{draft.metadata.depositInstruction}</p></div>}{draft.metadata.origin?.channel === "TELEGRAM" && draft.metadata.origin.allowsWrite && draft.submissionStatus === "SUBMITTED" && <p>We’ll also send the outcome and reviewer’s comment to Telegram.</p>}</div>}
          <ItemDetailsCard record={draft} image={preview}/>
          <div className="mobile-reference"><span>Submission reference</span><code>{draft.code}</code></div>
        </>}
      </>}
    </div>
    {!help && <footer className="mobile-action-bar">
      {step === "centre" && <button className="mobile-primary" disabled={!!busy || permission === "checking"} onClick={async () => { if (await journey.checkLocation(centre?.code)) setPreviousStep(null); }}>{busy || permission === "checking" ? "Checking location…" : !arrival ? permission === "prompt" ? "Share location" : "Check location again" : atCentre ? "Continue to photo" : "I’ve arrived — check location"}<ArrowRight size={18}/></button>}
      {step === "photo" && ready && <button className="mobile-primary" disabled={!!busy} onClick={() => setPreviousStep(null)}>Continue to review <ArrowRight size={18}/></button>}
      {step === "review" && <><button className="mobile-primary" disabled={!!busy} onClick={() => void journey.confirm()}>{busy ? "Please wait…" : "Confirm and submit"}<ArrowRight size={18}/></button><small>Nothing is submitted until you confirm.</small></>}
      {step === "edit" && <><button className="mobile-primary" form="mobile-item-editor" disabled={!!busy}>Save correction <Check size={18}/></button><button className="mobile-text" disabled={!!busy} onClick={goBack}>Cancel editing</button></>}
      {step === "receipt" && <button className="mobile-primary" onClick={onExit}>View submissions <ArrowRight size={18}/></button>}
    </footer>}
    <LeaveDialog open={discardOpen} onStay={() => setDiscardOpen(false)} onLeave={() => { setEditing(false); setDiscardOpen(false); }}/>
  </section>;
}
