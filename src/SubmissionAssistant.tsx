import { EnvironmentalImpactCard } from "./features/submission/EnvironmentalImpactCard";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Camera,
  Check,
  MapPin,
  MessageCircle,
  Minus,
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
        <button
          className="assistant-launcher"
          aria-label="Open Submit Waste assistant"
          onClick={() => setOpen(true)}
        >
          <MessageCircle size={22} /> Submit Waste
        </button>
      )}
      {open && (
        <section
          className={`assistant-panel ${host.kind === "telegram" ? "telegram-journey" : ""}`}
          aria-label="Submit Waste assistant"
        >
          <header className="assistant-header">
            <div>
              <strong>Circa recycling assistant</strong>
              <small>A photo is all we need to get started</small>
            </div>
            {host.kind === "web" && (
              <button
                aria-label="Minimize assistant"
                onClick={() => setOpen(false)}
              >
                <Minus />
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
                              {c.distanceMetres !== undefined
                                ? c.distanceMetres < 1000
                                  ? `${Math.round(c.distanceMetres)} m`
                                  : `${(c.distanceMetres / 1000).toFixed(1)} km`
                                : ""}
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
                          {permission === "checking" || permission === "granted"
                            ? "Finding your nearest centre"
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
                        {permission === "denied" &&
                          host.openLocationSettings && (
                            <button
                              className="text-button"
                              onClick={host.openLocationSettings}
                            >
                              Open location settings
                            </button>
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
                          ? "Your photo is saved"
                          : "Take a photo. We’ll identify your item."}
                      </h3>
                    )}
                    {!ready && draft?.evidenceRefs?.length && !busy ? (
                      <div>
                        <button
                          className="secondary full"
                          onClick={() => void journey.retryAnalysis()}
                        >
                          Retry image analysis
                        </button>
                        <button className="text-button" onClick={showEditor}>
                          Enter essential details
                        </button>
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
                        <h3>{draft?.submittedFacts.name}</h3>
                        {draft?.metadata.suggestion?.recognition?.taxonomyMatch?.kind === "GENERIC_FALLBACK" && <p>We identified the item and used a general item type. Review the details before submitting.</p>}
                        <p>
                          {nameOf(category?.name)} · {nameOf(type?.name)}
                          {draft?.submittedFacts.sizeClass &&
                          draft.submittedFacts.sizeClass !== "UNKNOWN"
                            ? ` · ${draft.submittedFacts.sizeClass.toLowerCase()}`
                            : ""}
                        </p>
                        <p>{draft?.submittedFacts.description}</p>
                        <p>{draft?.submittedFacts.quantity} item(s)</p>
                        <EnvironmentalImpactCard assessment={estimate?.metadata?.environmentalAssessment}/>
                        <small>Rewards are confirmed after approval.</small>
                        <details>
                          <summary>More details</summary>
                          <p>
                            Handling class:{" "}
                            {draft?.submittedFacts.sizeClass?.toLowerCase() ||
                              "unknown"}
                          </p>
                          <p>
                            Weight:{" "}
                            {draft?.submittedFacts.weight
                              ? `${draft.submittedFacts.weight} kg (customer declared)`
                              : "Unknown; a photo cannot establish weight"}
                          </p>
                          {draft?.metadata.suggestion?.recognition?.materials.map(
                            (material) => (
                              <p key={material.ref.code}>
                                {material.ref.code.replaceAll("_", " ")}:{" "}
                                {material.basis.toLowerCase()} suggestion,
                                subject to review
                              </p>
                            ),
                          )}
                          <p>
                            {draft?.submittedFacts.brand}{" "}
                            {draft?.submittedFacts.model}
                          </p>
                          <p>
                            Condition:{" "}
                            {draft?.submittedFacts.conditionGrade || "Unknown"}
                          </p>
                        </details>
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
                          Item type
                          <select
                            aria-label="Item type"
                            required
                            value={facts.itemTypeCode || ""}
                            onChange={(e) => {
                              const item = experience?.itemTypes.find(
                                (i) => i.code === e.target.value,
                              );
                              setFacts({
                                ...facts,
                                itemTypeCode: item?.code,
                                categoryCode: item?.categoryCode,
                              });
                            }}
                          >
                            <option value="">Choose item type</option>
                            {experience?.itemTypes.map((i) => (
                              <option key={i.code} value={i.code}>
                                {nameOf(i.name)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Quantity
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={facts.quantity || 1}
                            onChange={(e) =>
                              setFacts({
                                ...facts,
                                quantity: Number(e.target.value),
                              })
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
                        ? draft?.metadata.publicReason
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
                    <small>{draft?.code}</small>
                    <a className="secondary full" href="/account">
                      View My Account
                    </a>
                    <button className="text-button" onClick={journey.startNew}>
                      Submit another item
                    </button>
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
