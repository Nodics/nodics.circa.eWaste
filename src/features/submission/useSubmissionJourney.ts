import { useEffect, useRef, useState } from "react";
import {
  API,
  ApiError,
  commandKey,
  request,
  type Centre,
  type Facts,
  type Session,
  type Submission,
} from "../../api";
import {
  webJourneyHost,
  type JourneyHost,
  type Position,
  type LocationPermission,
} from "../../channels/journeyHost";

export type Arrival = {
  contractVersion: number;
  draft: Submission | null;
  selectedCentre: Centre | null;
  nearbyCentres: Centre[];
  centres: Centre[];
  nextAction: "PHOTO" | "TRAVEL" | "CHOOSE_CENTRE";
  policy: { maximumPositionAgeMs: number; captureTimeoutMs: number };
};
type Message = { role: "assistant" | "user"; text: string };
const editable = (d: Submission) =>
  [
    "DRAFT",
    "MEDIA_STAGED",
    "METADATA_SUGGESTED",
    "AWAITING_SUBMITTER_CONFIRMATION",
  ].includes(d.submissionStatus);
/** Shared Web/Telegram interaction controller over one owner-authorized Waste draft. */
export function useSubmissionJourney({
  session,
  open,
  resumeCode,
  restoreFromStorage = true,
  host = webJourneyHost,
  captureTimeoutMs = 12000,
  maximumAccuracyMetres,
  maximumPositionAgeMs,
  onSubmitted,
}: {
  session: Session | null;
  open: boolean;
  resumeCode?: string;
  restoreFromStorage?: boolean;
  host?: JourneyHost;
  captureTimeoutMs?: number;
  maximumAccuracyMetres?: number;
  maximumPositionAgeMs?: number;
  onSubmitted: () => void;
}) {
  const [draft, setDraft] = useState<Submission | null>(null),
    [arrival, setArrival] = useState<Arrival | null>(null),
    [permission, setPermission] = useState<LocationPermission | "checking">(
      "checking",
    ),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [unsupportedItem, setUnsupportedItem] = useState(false),
    [impactRecovery, setImpactRecovery] = useState(false),
    [preview, setPreview] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [ready, setReady] = useState(false);
  const current = useRef<Submission | null>(null),
    generation = useRef(0),
    lock = useRef(false),
    capture = useRef<AbortController | null>(null),
    preparation = useRef<AbortController | null>(null),
    pendingPhoto = useRef<File | null>(null),
    position = useRef<Position | null>(null),
    createKey = useRef(commandKey());
  const storage = session ? `circa.draft.${session.loginId}` : "";
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const say = (text: string, role: Message["role"] = "assistant") =>
    setMessages((m) => [...m, { role, text }]);
  function apply(d: Submission) {
    current.current = d;
    setDraft(d);
    if (storage) sessionStorage.setItem(storage, d.code);
  }
  async function run(
    label: string,
    action: (active: () => boolean) => Promise<void>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    setUnsupportedItem(false);
    setImpactRecovery(false);
    const epoch = generation.current;
    const active = () => epoch === generation.current;
    try {
      await action(active);
      return active();
    } catch (e) {
      if (active() && !(e instanceof DOMException && e.name === "AbortError")) {
        setUnsupportedItem(e instanceof ApiError && e.code === "ERR_WASTE_ITEM_UNSUPPORTED");
        setImpactRecovery(e instanceof ApiError && e.code === "ERR_WASTE_IMPACT_INPUT_INVALID");
        const locationMessages: Record<string, string> = {
          ERR_CIRCA_POSITION_INVALID: "We couldn’t get a usable location. Check location again. Your progress is saved.",
          ERR_CIRCA_POSITION_STALE: "Your location reading has expired. Check location again to continue. Your progress is saved.",
          ERR_CIRCA_POSITION_ACCURACY_REQUIRED: "This device isn’t reporting location accuracy. Enable location access for your browser or Telegram in device settings, then check again at the centre. You can still browse collection centres. Your progress is saved.",
          ERR_CIRCA_POSITION_IMPRECISE: "Your location is still too approximate to confirm arrival. Check device location settings and try again at the centre. You can still browse collection centres. Your progress is saved.",
          ERR_CIRCA_ARRIVAL_REQUIRED: "Check your location at the collection centre before continuing. Your progress is saved.",
        };
        const locationMessage = e instanceof ApiError ? locationMessages[e.code || ""] : undefined;
        setError(locationMessage ? current.current ? locationMessage : locationMessage.replace("Your progress is saved.", "Nothing has been submitted.") : (e instanceof Error ? e.message : "Please retry."));
        if (
          locationMessage
        ) {
          setArrival(null);
          position.current = null;
        }
        // Multi-step preparation can have saved an earlier step before failure.
        // Reconcile revision without silently repeating the failed command.
        if (current.current) {
          try {
            const latest = await request<Submission>(
              `${API}/submissions/${current.current.code}`,
              session,
            );
            if (active()) apply(latest);
          } catch {
            /* Preserve the current draft and explicit retry controls. */
          }
        }
      }
      return false;
    } finally {
      if (active()) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function locate(
    d: Submission | null,
    active: () => boolean,
    choice?: string,
    reuse = false,
    requireArrival = false,
  ) {
    capture.current?.abort();
    capture.current = new AbortController();
    const p =
      reuse &&
      position.current &&
      Date.now() - position.current.capturedAt < 30000
        ? position.current
        : await host.capture(capture.current.signal, captureTimeoutMs, { maximumAccuracyMetres, maximumPositionAgeMs });
    if (!active()) return d;
    position.current = p;
    const result = await request<Arrival>(
      d ? `${API}/submissions/${encodeURIComponent(d.code)}/arrival` : `${API}/journey/arrival`,
      session,
      {
        position: p,
        collectionPointCode: choice,
        expectedRevision: d?.revision,
      },
    );
    if (active()) {
      setArrival(result);
      if (result.draft) apply(result.draft);
      setPermission("granted");
    }
    if (requireArrival && result.nextAction !== "PHOTO") {
      setReady(false);
      throw new Error(
        "Confirm your arrival at a collection centre before continuing.",
      );
    }
    return result.draft;
  }
  useEffect(() => {
    const epoch = ++generation.current;
    capture.current?.abort();
    preparation.current?.abort();
    pendingPhoto.current = null;
    lock.current = false;
    current.current = null;
    setDraft(null);
    setArrival(null);
    setPreview("");
    setMessages([]);
    setReady(false);
    setError("");
    setUnsupportedItem(false);
    setBusy("");
    setPermission("checking");
    const pendingCreate = sessionStorage.getItem(storage + ".create");
    createKey.current = pendingCreate || commandKey();
    if (session && open)
      sessionStorage.setItem(storage + ".create", createKey.current);
    position.current = null;
    if (!session || !open) return;
    void run("Checking your journey…", async (active) => {
      const code =
        resumeCode ||
        (restoreFromStorage ? sessionStorage.getItem(storage) : null);
      let d: Submission | null = null;
      if (code) {
        d = await request<Submission>(
          `${API}/submissions/${encodeURIComponent(code)}`,
          session,
        );
        if (!active()) return;
        apply(d);
        setMessages(d.metadata.conversation || []);
        if (d.metadata.photo?.code) {
          try {
            const photo = await request<{
              mimeType: string;
              contentBase64: string;
            }>(`${API}/submissions/${d.code}/photo`, session);
            if (active() && /^image\/(jpeg|png|webp)$/.test(photo.mimeType))
              setPreview(
                `data:${photo.mimeType};base64,${photo.contentBase64}`,
              );
          } catch {
            if (active())
              setError(
                "Your saved photo is temporarily unavailable. The draft is retained.",
              );
          }
        }
        if (!editable(d)) return;
      }
      let result: LocationPermission;
      try {
        result = await host.permission();
      } catch (cause) {
        if (active()) setPermission("unknown");
        throw cause;
      }
      if (!active()) return;
      setPermission(result);
      if (result === "granted" || result === "unknown") {
        if (!active()) return;
        const located = await locate(d, active);
        if (active())
          setReady(
            Boolean(
              located?.evidenceRefs?.length &&
              located.submittedFacts.itemTypeCode &&
              located.submittedFacts.name,
            ),
          );
      }
    });
    return () => {
      if (generation.current === epoch) generation.current++;
      capture.current?.abort();
      preparation.current?.abort();
      lock.current = false;
    };
  }, [
    session?.loginId,
    session?.token,
    open,
    resumeCode,
    restoreFromStorage,
    host,
  ]);
  function checkLocation(choice?: string) {
    return run("Finding collection centres near you…", async (active) => {
      const d = current.current;
      if (!active()) return;
      const result = await locate(d, active, choice, Boolean(choice));
      if (active())
        setReady(
          Boolean(
            result?.evidenceRefs?.length &&
            result.submittedFacts.itemTypeCode &&
            result.submittedFacts.name,
          ),
        );
    });
  }
  async function analyze(d: Submission, active: () => boolean) {
    let next: Submission;
    try {
      next = await request<Submission>(
        `${API}/submissions/${d.code}/analyze`,
        session,
        { expectedRevision: d.revision, idempotencyKey: commandKey() },
        "POST",
        { timeoutMs: 150000 },
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ERR_WASTE_RECOGNITION_INVALID")
        throw new ApiError("We couldn’t reliably match this photo to an item type. Your photo is saved; enter the details or try another photo.", cause.code);
      if (cause instanceof ApiError && cause.code === "ERR_WASTE_RECOGNITION_UNAVAILABLE")
        throw new ApiError("Photo analysis is temporarily unavailable. Your photo is saved; you can enter the item details yourself.", cause.code);
      throw cause;
    }
    if (active()) {
      apply(next);
      setReady(
        Boolean(
          next.evidenceRefs?.length &&
          next.submittedFacts.itemTypeCode &&
          next.submittedFacts.name,
        ),
      );
      say(
        "Your photo details are ready. You can correct them or submit for review.",
      );
    }
  }
  function upload(file: File) {
    return run("Uploading and identifying your item…", async (active) => {
      let d = current.current;
      if (!active()) return;
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw Error("Choose a JPEG, PNG or WebP photo under 5 MB.");
      d = await locate(
        d,
        active,
        d?.submittedFacts.preferredCollectionPointCode || arrival?.selectedCentre?.code,
        false,
        true,
      );
      if (!active()) return;
      if (pendingPhoto.current !== file) createKey.current = commandKey();
      pendingPhoto.current = file;
      setPreview(URL.createObjectURL(file));
      setReady(false);
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("The photo could not be read. Choose it again."));
        reader.readAsDataURL(file);
      });
      if (!active()) return;
      preparation.current = new AbortController();
      d = await request<Submission>(
        d ? `${API}/submissions/${d.code}/prepare` : `${API}/submissions/prepare`,
        session,
        { photo: { mimeType: file.type, contentBase64, originalFileName: file.name }, position: position.current,
          collectionPointCode: d?.submittedFacts.preferredCollectionPointCode || arrival?.selectedCentre?.code,
          expectedRevision: d?.revision, idempotencyKey: createKey.current },
        "POST", { timeoutMs: 150000, signal: preparation.current.signal },
      );
      if (!active()) return;
      apply(d);
      pendingPhoto.current = null;
      setReady(Boolean(d.evidenceRefs?.length && d.submittedFacts.itemTypeCode && d.submittedFacts.name));
      say("Your photo and details are saved. Check them before submitting for review.");
    });
  }
  function retryAnalysis() {
    if (pendingPhoto.current) return upload(pendingPhoto.current);
    return run("Identifying your item…", async (active) => {
      if (!current.current) return;
      const d = await locate(
        current.current,
        active,
        current.current.submittedFacts.preferredCollectionPointCode,
        false,
        true,
      );
      if (active() && d) await analyze(d, active);
    });
  }
  function edit(facts: Facts) {
    return run("Updating your item…", async (active) => {
      if (!current.current) return;
      setReady(false);
      let d = await request<Submission>(
        `${API}/submissions/${current.current.code}`,
        session,
        { name: facts.name, description: facts.description, expectedRevision: current.current.revision },
        "PATCH",
      );
      if (!active()) return;
      apply(d);
      d = await request<Submission>(
        `${API}/submissions/${d.code}/estimate`,
        session,
        { expectedRevision: d.revision, idempotencyKey: commandKey() },
        "POST", { timeoutMs: 150000 },
      );
        if (active()) {
          apply(d);
          setReady(true);
          setImpactRecovery(false);
        }
    });
  }
  function send(text: string) {
    if (!text.trim() || lock.current) return Promise.resolve();
    say(text, "user");
    return run("Answering your question…", async (active) => {
      if (!current.current) {
        const result = await request<{
          message: string;
          conversationCode: string;
        }>("/nodics/circa.ewaste/v0/customer/guidance", session, {
          message: text,
          conversationCode:
            sessionStorage.getItem(storage + ".conversation") || undefined,
          idempotencyKey: commandKey(),
        });
        if (active()) {
          sessionStorage.setItem(
            storage + ".conversation",
            result.conversationCode,
          );
          say(result.message);
        }
        return;
      }
      const d = current.current;
      if (!active()) return;
      const result = await request<{
        message: string;
        draft: Submission;
        changed: boolean;
      }>(`${API}/submissions/${d.code}/messages`, session, {
        message: text,
        conversationCode:
          sessionStorage.getItem(storage + ".conversation") || undefined,
        idempotencyKey: commandKey(),
        expectedRevision: d.revision,
      });
      if (!active()) return;
      apply(result.draft);
      say(result.message);
      if (result.changed) {
        setReady(false);
        const prepared = await request<Submission>(
          `${API}/submissions/${d.code}/estimate`,
          session,
          {
            expectedRevision: result.draft.revision,
            idempotencyKey: commandKey(),
          },
          "POST", { timeoutMs: 150000 },
        );
        if (active()) {
          apply(prepared);
          setReady(true);
          setImpactRecovery(false);
        }
      }
    });
  }
  /** Re-estimates an editable owned draft through the existing revision-aware backend operation. */
  function refreshImpact() {
    return run("Updating impact estimate…", async (active) => {
      const d = current.current;
      if (!d || !editable(d)) return;
      const latest = await request<Submission>(`${API}/submissions/${d.code}`, session);
      if (!active()) return;
      apply(latest);
      if (!editable(latest)) return;
      const updated = await request<Submission>(`${API}/submissions/${d.code}/estimate`, session, {
        expectedRevision: latest.revision, idempotencyKey: commandKey(),
      }, "POST", { timeoutMs: 150000 });
      if (active()) { apply(updated); setReady(true); setImpactRecovery(false); }
    });
  }
  function confirm() {
    return run("Submitting your item…", async (active) => {
      if (!current.current || !ready) return;
      // A previous timeout may have hidden a durable receipt. Reconcile before replay.
      const latest = await request<Submission>(
        `${API}/submissions/${current.current.code}`,
        session,
      );
      if (!active()) return;
      apply(latest);
      if (!editable(latest)) {
        setReady(false);
        onSubmitted();
        return;
      }
      let d = await locate(
        current.current,
        active,
        current.current.submittedFacts.preferredCollectionPointCode,
        false,
        true,
      );
      if (!active()) return;
      if (!d) return;
      d = await request<Submission>(
        `${API}/submissions/${d.code}/confirm`,
        session,
        {
          expectedRevision: d.revision,
          idempotencyKey: `${d.code}:customer-confirm:v1`,
          confirmed: true,
        },
      );
      if (active()) {
        apply(d);
        setReady(false);
        say("Your submission has been received.");
        onSubmitted();
      }
    });
  }
  function startNew() {
    generation.current++;
    capture.current?.abort();
    preparation.current?.abort();
    pendingPhoto.current = null;
    current.current = null;
    setDraft(null);
    setReady(false);
    setArrival(null);
    setPreview("");
    setMessages([]);
    setError("");
    setUnsupportedItem(false);
    setImpactRecovery(false);
    sessionStorage.removeItem(storage);
    createKey.current = commandKey();
    sessionStorage.setItem(storage + ".create", createKey.current);
    lock.current = false;
    void checkLocation();
  }
  return {
    draft,
    arrival,
    permission,
    busy,
    error,
    unsupportedItem,
    impactRecovery,
    preview,
    messages,
    ready,
    submitted: Boolean(draft && !editable(draft)),
    checkLocation,
    upload,
    retryAnalysis,
    refreshImpact,
    edit,
    send,
    confirm,
    startNew,
  };
}
