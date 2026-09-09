import { useEffect, useRef, useState } from "react";
import {
  API,
  ApiError,
  commandKey,
  request,
  unwrap,
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
  draft: Submission;
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
    [preview, setPreview] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [ready, setReady] = useState(false);
  const current = useRef<Submission | null>(null),
    generation = useRef(0),
    lock = useRef(false),
    capture = useRef<AbortController | null>(null),
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
    const epoch = generation.current;
    const active = () => epoch === generation.current;
    try {
      await action(active);
      return active();
    } catch (e) {
      if (active() && !(e instanceof DOMException && e.name === "AbortError")) {
        const locationMessages: Record<string, string> = {
          ERR_CIRCA_POSITION_INVALID: "We couldn’t get a usable location. Check location again. Your progress is saved.",
          ERR_CIRCA_POSITION_STALE: "Your location reading has expired. Check location again to continue. Your progress is saved.",
          ERR_CIRCA_POSITION_ACCURACY_REQUIRED: "This device isn’t providing location accuracy. Enable precise location, or reopen Circa in Telegram on your phone. Your progress is saved.",
          ERR_CIRCA_POSITION_IMPRECISE: "Your location is too approximate to confirm arrival. Enable precise location and try again at the collection centre. On a computer, try Telegram on your phone. Your progress is saved.",
          ERR_CIRCA_ARRIVAL_REQUIRED: "Check your location at the collection centre before continuing. Your progress is saved.",
        };
        const locationMessage = e instanceof ApiError ? locationMessages[e.code || ""] : undefined;
        setError(locationMessage || (e instanceof Error ? e.message : "Please retry."));
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
  async function ensureDraft(active: () => boolean): Promise<Submission> {
    if (current.current) return current.current;
    const d = await request<Submission>(`${API}/submissions`, session, {
      quantity: 1,
      conditionGrade: "UNKNOWN",
      idempotencyKey: createKey.current,
    });
    if (active()) apply(d);
    return d;
  }
  async function locate(
    d: Submission,
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
      `${API}/submissions/${encodeURIComponent(d.code)}/arrival`,
      session,
      {
        position: p,
        collectionPointCode: choice,
        expectedRevision: d.revision,
      },
    );
    if (active()) {
      setArrival(result);
      apply(result.draft);
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
    lock.current = false;
    current.current = null;
    setDraft(null);
    setArrival(null);
    setPreview("");
    setMessages([]);
    setReady(false);
    setError("");
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
        d = d || (await ensureDraft(active));
        if (!active()) return;
        const located = await locate(d, active);
        if (active())
          setReady(
            Boolean(
              located.evidenceRefs?.length &&
              located.submittedFacts.itemTypeCode &&
              located.submittedFacts.name,
            ),
          );
      }
    });
    return () => {
      if (generation.current === epoch) generation.current++;
      capture.current?.abort();
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
      const d = await ensureDraft(active);
      if (!active()) return;
      const result = await locate(d, active, choice, Boolean(choice));
      if (active())
        setReady(
          Boolean(
            result.evidenceRefs?.length &&
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
      let d = await ensureDraft(active);
      if (!active()) return;
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw Error("Choose a JPEG, PNG or WebP photo under 5 MB.");
      d = await locate(
        d,
        active,
        d.submittedFacts.preferredCollectionPointCode,
        false,
        true,
      );
      if (!active()) return;
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/nodics/media/v0/customer/photos", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.token}` },
        body: form,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.message || "Upload failed. Please retry.");
      if (!active()) return;
      const media = unwrap<{ code: string }>(body);
      d = await request<Submission>(
        `${API}/submissions/${d.code}/photo`,
        session,
        { mediaCode: media.code, expectedRevision: d.revision },
      );
      if (!active()) return;
      apply(d);
      setReady(false);
      setPreview(URL.createObjectURL(file));
      await analyze(d, active);
    });
  }
  function retryAnalysis() {
    return run("Identifying your item…", async (active) => {
      if (!current.current) return;
      const d = await locate(
        current.current,
        active,
        current.current.submittedFacts.preferredCollectionPointCode,
        false,
        true,
      );
      if (active()) await analyze(d, active);
    });
  }
  function edit(facts: Facts) {
    return run("Updating your item…", async (active) => {
      if (!current.current) return;
      setReady(false);
      let d = await request<Submission>(
        `${API}/submissions/${current.current.code}`,
        session,
        { ...facts, expectedRevision: current.current.revision },
        "PATCH",
      );
      if (!active()) return;
      apply(d);
      d = await request<Submission>(
        `${API}/submissions/${d.code}/estimate`,
        session,
        { expectedRevision: d.revision, idempotencyKey: commandKey() },
      );
      if (active()) {
        apply(d);
        setReady(true);
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
        );
        if (active()) {
          apply(prepared);
          setReady(true);
        }
      }
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
    current.current = null;
    setDraft(null);
    setReady(false);
    setArrival(null);
    setPreview("");
    setMessages([]);
    setError("");
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
    preview,
    messages,
    ready,
    submitted: Boolean(draft && !editable(draft)),
    checkLocation,
    upload,
    retryAnalysis,
    edit,
    send,
    confirm,
    startNew,
  };
}
