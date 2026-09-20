import { ItemDetailsCard } from "./features/submission/ItemDetailsCard";
import { LocationAccessHelp } from "./features/submission/LocationAccessHelp";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Camera,
  Check,
  MapPin,
  MessageCircle,
  Minus,
  Recycle,
} from "lucide-react";
import {
  nameOf,
  type Centre,
  type Experience,
  type Facts,
  type Session,
} from "./api";
import { useSubmissionJourney } from "./features/submission/useSubmissionJourney";
import { webJourneyHost, type JourneyHost } from "./channels/journeyHost";
import { formatCentreDistance } from "./map/sortCentresByDistance";

/** Presents the same backend-governed journey in Web and Telegram shells. */
export function SubmissionAssistant({
  open,
  setOpen,
  session,
  experience,
  onLogin,
  onSubmitted,
  resumeCode,
  onboarding,
  restoreFromStorage = true,
  host = webJourneyHost,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  session: Session | null;
  experience: Experience | null;
  selectedCentre: Centre | null;
  onLogin: () => void;
  onSubmitted: () => void;
  resumeCode?: string;
  onboarding?: ReactNode;
  restoreFromStorage?: boolean;
  host?: JourneyHost;
}) {
  const journey = useSubmissionJourney({
    open,
    session,
    resumeCode,
    restoreFromStorage,
    host,
    captureTimeoutMs: experience?.journey?.captureTimeoutMs,
    maximumAccuracyMetres: experience?.journey?.maximumAccuracyMetres,
    maximumPositionAgeMs: experience?.journey?.maximumPositionAgeMs,
    onSubmitted,
  });
  const [input, setInput] = useState(""),
    [editing, setEditing] = useState(false),
    [facts, setFacts] = useState<Facts>({});
  const { draft, arrival, busy, error, preview, ready, submitted, permission } =
    journey;
  useEffect(() => {
    setFacts(draft?.submittedFacts || {});
    setEditing(false);
  }, [draft?.code, draft?.revision]);
  const atCentre = arrival?.nextAction === "PHOTO";
  const centre =
    arrival?.selectedCentre ||
    experience?.centres.find(
      (c) => c.code === draft?.submittedFacts.preferredCollectionPointCode,
    );
  const type = experience?.itemTypes.find(
    (i) => i.code === draft?.submittedFacts.itemTypeCode,
  );
  const category = experience?.categories.find(
    (c) => c.code === draft?.submittedFacts.categoryCode,
  );
  const estimate = draft?.metadata.estimate;
  const openMap = (c: Centre) => {
    const p = c.location || c;
    if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      host.openMap(
        `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`,
      );
  };
  useEffect(() => {
    host.setClosingConfirmation?.(Boolean(busy || editing));
    return () => host.setClosingConfirmation?.(false);
  }, [host, busy, editing]);
  const showEditor = () => {
    setFacts(draft?.submittedFacts || {});
    setEditing(true);
  };
  return (
    <>
      {!open && host.kind === "web" && (
        <div role="region" aria-label="Recycling actions">
        <button
          className="assistant-launcher"
          onClick={() => setOpen(true)}
        >
          <Recycle size={22} aria-hidden="true" /> Submit eWaste
        </button>
        </div>
      )}
      {open && (
        <section
          className={`assistant-panel ${host.kind === "telegram" ? "telegram-journey" : ""}`}
          aria-label="eWaste submission"
        >
          <header className="assistant-header">
            <div>
              <strong>Submit your eWaste</strong>
              <small>Choose a centre, add a photo, then review.</small>
            </div>
            {host.kind === "web" && (
              <button
                className="assistant-minimize"
                type="button"
                aria-label="Minimize submission"
                title="Minimize submission"
                onClick={() => setOpen(false)}
              >
                <Minus size={20} aria-hidden="true" />
              </button>
            )}
          </header>
          <div className="assistant-scroll">
            {!session ? (
              (onboarding ?? (
                <div className="conversation-card">
                  <h3>Keep your submission in one place</h3>
                  <p>Sign in or create your account to continue.</p>
                  <button className="primary full" onClick={onLogin}>
                    Sign in or register
                  </button>
                </div>
              ))
            ) : (
              <>
                {!submitted && (
                  <nav
                    className="journey-progress"
                    aria-label="Submission progress"
                  >
                    <span aria-current={!atCentre ? "step" : undefined}>
                      Centre
                    </span>
                    <span
                      aria-current={atCentre && !ready ? "step" : undefined}
                    >
                      Photo
                    </span>
                    <span aria-current={ready ? "step" : undefined}>
                      Submit
                    </span>
                  </nav>
                )}
                {!submitted && !atCentre && (
                  <div className="conversation-card">
                    {arrival ? (
                      <>
                        <h3>
                          {arrival.nextAction === "CHOOSE_CENTRE"
                            ? "Which centre are you at?"
                            : "Your next stop"}
                        </h3>
                        <p>
                          {arrival.nextAction === "CHOOSE_CENTRE"
                            ? "Several collection centres are nearby. Choose the one you are using."
                            : "Visit a collection centre to submit. We’ll identify your item from its photo when you arrive."}
                        </p>
                        {(arrival.nextAction === "CHOOSE_CENTRE"
                          ? arrival.nearbyCentres
                          : arrival.centres
                        ).map((c) => (
                          <article className="journey-centre" key={c.code}>
                            <strong>{nameOf(c.name)}</strong>
                            <p>
                              {c.addressLine} {c.city}
                            </p>
                            <small>
                              {formatCentreDistance(c.distanceMetres ?? null) || ""}
                            </small>
                            <button
                              className="text-button"
                              onClick={() => openMap(c)}
                            >
                              Open directions
                            </button>
                            {arrival.nextAction === "CHOOSE_CENTRE" && (
                              <button
                                disabled={!!busy}
                                className="primary"
                                onClick={() =>
                                  void journey.checkLocation(c.code)
                                }
                              >
                                Use this centre
                              </button>
                            )}
                          </article>
                        ))}
                        {arrival.centres.length === 0 && (
                          <p>
                            No available collection centres were found. Try
                            again later.
                          </p>
                        )}
                        {arrival.nextAction === "TRAVEL" && (
                          <>
                            <p>
                              Once you reach the centre, we’ll help you with the
                              next steps.
                            </p>
                            <button
                              disabled={!!busy}
                              className="primary full"
                              onClick={() => void journey.checkLocation()}
                            >
                              I’ve arrived — check location
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <h3>
                          {busy
                            ? "Finding your nearest centre"
                            : error
                              ? "We couldn’t confirm your location"
                              : "Find your nearest collection centre"}
                        </h3>
                        {["prompt", "denied", "unavailable"].includes(
                          permission,
                        ) && (
                          <p>
                            {permission === "denied"
                              ? "Location is blocked. Enable it in your device or browser settings, then retry."
                              : permission === "unavailable"
                                ? "Location isn’t available on this device. Enable device location, or reopen Circa in Telegram on a phone, then try again."
                                : "Share your location to find nearby centres and confirm arrival."}
                          </p>
                        )}
                        {!busy && permission !== "checking" && (
                          <button
                            className="primary full"
                            onClick={() => void journey.checkLocation()}
                          >
                            {permission === "prompt"
                              ? "Share location"
                              : "Check location again"}
                          </button>
                        )}
                        <LocationAccessHelp host={host} permission={permission} hasError={!!error}/>
                        {!busy && error && host.kind === "web" && (
                          <>
                            <p>You can still browse collection centres and plan your visit on this computer.</p>
                            <a className="secondary full" href="/#centres" onClick={() => setOpen(false)}>
                              Browse collection centres
                            </a>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
                {!submitted && atCentre && (
                  <>
                    <div className="journey-location">
                      <MapPin size={16} />
                      <span>{nameOf(centre?.name)}</span>
                      {centre && (
                        <button
                          className="text-button"
                          onClick={() => openMap(centre)}
                        >
                          Open map
                        </button>
                      )}
                    </div>
                    {!ready && (
                      <h3>
                        {preview
                          ? "Let’s check your photo"
                          : "Take a photo. We’ll identify your item."}
                      </h3>
                    )}
                    {!ready && preview && !busy ? (
                      <div>
                        <button
                          className="secondary full"
                          onClick={() => void journey.retryAnalysis()}
                        >
                          Retry image analysis
                        </button>
                        {draft?.metadata.suggestion && <button className="text-button" onClick={showEditor}>
                          Enter essential details
                        </button>}
                      </div>
                    ) : null}
                    {preview && (
                      <img
                        className="journey-photo"
                        src={preview}
                        alt="Your submitted item"
                      />
                    )}
                    {(!ready || editing) && (
                      <div className="journey-photo-actions">
                        <label className="primary">
                          <Camera size={17} /> Take photo
                          <input
                            aria-label="Take item photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            disabled={!!busy}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void journey.upload(file);
                            }}
                          />
                        </label>
                        <label className="secondary">
                          Upload image
                          <input
                            aria-label="Item photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={!!busy}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void journey.upload(file);
                            }}
                          />
                        </label>
                        <small>Keep the whole item in view.</small>
                      </div>
                    )}
                    {ready && !editing && (
                      <div className="conversation-card review-card">
                        {draft && <ItemDetailsCard record={draft} onEdit={!busy ? showEditor : undefined} onRefreshImpact={!busy ? journey.refreshImpact : undefined}/>}
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={showEditor}
                        >
                          Edit details or replace photo
                        </button>
                        <button
                          disabled={!!busy}
                          className="primary full"
                          onClick={() => void journey.confirm()}
                        >
                          Confirm and submit
                        </button>
                      </div>
                    )}
                    {editing && (
                      <form
                        className="conversation-card"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void journey.edit(facts);
                        }}
                      >
                        <h3>Edit item details</h3>
                        <label>
                          Item name
                          <input
                            required
                            maxLength={180}
                            value={facts.name || ""}
                            onChange={(e) =>
                              setFacts({ ...facts, name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            maxLength={2000}
                            value={facts.description || ""}
                            onChange={(e) =>
                              setFacts({
                                ...facts,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <button className="primary full" disabled={!!busy}>
                          Save correction
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </>
                )}
                {submitted && (
                  <div className="conversation-card receipt">
                    <Check />
                    <h3>
                      {draft?.submissionStatus === "APPROVED"
                        ? "Approved"
                        : draft?.submissionStatus === "REJECTED"
                          ? "Not approved"
                          : "Submission received"}
                    </h3>
                    <p>
                      {["APPROVED", "REJECTED"].includes(
                        draft!.submissionStatus,
                      )
                        ? "Your complete item details and the reviewer’s feedback are below."
                        : draft?.metadata.reviewAssignment?.status ===
                            "ASSIGNED"
                          ? draft.metadata.origin?.channel === "TELEGRAM" &&
                            draft.metadata.origin.allowsWrite
                            ? "Your item is under review. I’ll notify you in Telegram when a decision is made, including the reviewer’s comment."
                            : "Your waste is under review. You can see the outcome and reviewer comments in My Account."
                          : "Your submission is saved. Review assignment is pending."}
                    </p>
                    {draft?.submissionStatus === "SUBMITTED" &&
                      draft.metadata.depositInstruction && (
                        <p>{draft.metadata.depositInstruction}</p>
                      )}
                    {draft && <ItemDetailsCard record={draft} image={preview}/>}
                    <small>{draft?.code}</small>
                    <button className="primary full" onClick={journey.startNew}>
                      Submit another item
                    </button>
                    <a className="secondary full" href="/account" onClick={() => setOpen(false)}>
                      View My Account
                    </a>
                  </div>
                )}
                {journey.messages.length > 0 && (
                  <details open className="journey-history">
                    <summary>Your conversation</summary>
                    {journey.messages.map((m, i) => (
                      <p key={i}>
                        <strong>{m.role === "user" ? "You" : "Circa"}: </strong>
                        {m.text}
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
            {busy && <p role="status">{busy}</p>}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          {session && (
            <form
              className="assistant-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void journey.send(input);
                setInput("");
              }}
            >
              <input
                aria-label="Message Circa assistant"
                placeholder="Ask a question or correct a detail…"
                maxLength={1500}
                value={input}
                disabled={!!busy}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                aria-label="Send message"
                disabled={!!busy || !input.trim()}
              >
                <ArrowUp size={20} />
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
