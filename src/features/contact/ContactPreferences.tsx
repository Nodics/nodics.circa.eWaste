/** Shared customer contact task; Profile supplies self selectors/copy and independently enforces every command. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Session } from "../../api";
import {
  contactPreferencesEnabled,
  executeContactCommand,
  inspectContact,
  loadContactWorkspace,
  prepareContactCommand,
  type ContactChannel,
  type ContactCommand,
  type ContactDecision,
  type ContactProgress,
  type ContactWorkspace,
} from "./contactClient";
import "./contactPreferences.css";

/** Reviews immutable commands with transient code memory. Unknown writes require inspection, never automatic replay. */
export function ContactPreferences({ session }: { readonly session: Session }) {
  const context = useMemo(
    () => ({ session: { token: session.token, loginId: session.loginId } }),
    [session.token, session.loginId],
  );
  const [metadata, setMetadata] = useState<{
    context: typeof context;
    value: ContactWorkspace;
  }>();
  const [snapshot, setSnapshot] = useState<{
    context: typeof context;
    channel: ContactChannel;
    value: ContactProgress;
  }>();
  const [channel, setChannel] = useState<ContactChannel | "">("");
  const [purpose, setPurpose] = useState("");
  const [secret, setSecret] = useState("");
  const [granted, setGranted] = useState(false),
    [suppressed, setSuppressed] = useState(false);
  const [review, setReview] = useState<{
    context: typeof context;
    command: ContactCommand;
    label: string;
    purposeLabel?: string;
    purposeVersion?: number;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const epoch = useRef(0),
    inFlight = useRef(false);
  const workspace = metadata?.context === context ? metadata.value : undefined;
  const progress =
    snapshot?.context === context && snapshot.channel === channel
      ? snapshot.value
      : undefined;
  const pending = review?.context === context ? review : undefined;
  const copy = workspace?.presentation;
  const resetChoices = useCallback(() => {
    setSnapshot(undefined);
    setReview(undefined);
    setSecret("");
    setGranted(false);
    setSuppressed(false);
    setNotice("");
  }, []);
  useEffect(() => {
    const attempt = ++epoch.current;
    inFlight.current = true;
    setBusy(true);
    setMetadata(undefined);
    setChannel("");
    setPurpose("");
    setError("");
    resetChoices();
    if (contactPreferencesEnabled)
      void loadContactWorkspace(context.session)
        .then((value) => {
          if (attempt === epoch.current) setMetadata({ context, value });
        })
        .catch(() => {
          if (attempt === epoch.current)
            setError("The owner request could not be confirmed.");
        })
        .finally(() => {
          if (attempt === epoch.current) {
            inFlight.current = false;
            setBusy(false);
          }
        });
    else {
      inFlight.current = false;
      setBusy(false);
    }
    const activeEpoch = epoch;
    return () => {
      activeEpoch.current++;
    };
  }, [context, resetChoices]);
  const inspect = async () => {
    if (inFlight.current || !contactPreferencesEnabled) return;
    const attempt = epoch.current,
      selected = channel;
    inFlight.current = true;
    setBusy(true);
    setError("");
    resetChoices();
    try {
      const value = await loadContactWorkspace(context.session);
      if (attempt !== epoch.current) return;
      setMetadata({ context, value });
      if (workspace && value.ownerId !== workspace.ownerId) {
        setChannel("");
        setPurpose("");
        return;
      }
      if (!selected || !value.channels.includes(selected)) {
        setChannel("");
        setPurpose("");
        return;
      }
      const result = await inspectContact(context.session, value, selected);
      if (attempt === epoch.current) {
        setSnapshot({ context, channel: selected, value: result });
        if (
          !value.purposes.some(
            (row) => row.code === purpose && row.channels.includes(selected),
          )
        )
          setPurpose("");
      }
    } catch {
      if (attempt === epoch.current)
        setError(
          copy?.unavailableMessage ||
            "The owner request could not be confirmed.",
        );
    } finally {
      if (attempt === epoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const prepare = (decision: ContactDecision, label: string) => {
    if (!workspace || !channel || !progress || inFlight.current) return;
    try {
      const command = prepareContactCommand(
        workspace,
        channel,
        progress,
        decision,
      );
      const selected =
        "purpose" in decision
          ? workspace.purposes.find(
              (row) =>
                row.code === decision.purpose && row.channels.includes(channel),
            )
          : undefined;
      setReview({
        context,
        command,
        label,
        ...(selected
          ? {
              purposeLabel: selected.label,
              purposeVersion:
                command.operation === "consent"
                  ? Number(command.body.purposeVersion)
                  : selected.version,
            }
          : {}),
      });
      setSecret("");
      setError("");
      setNotice("");
    } catch {
      setSecret("");
      setError(
        copy?.unavailableMessage || "The owner request could not be confirmed.",
      );
    }
  };
  const confirm = async () => {
    if (!pending || inFlight.current || !copy) return;
    const attempt = epoch.current,
      command = pending.command;
    inFlight.current = true;
    setBusy(true);
    setError("");
    resetChoices();
    try {
      const result = await executeContactCommand(context.session, command);
      if (attempt === epoch.current)
        setNotice(
          result
            ? result.status +
                (result.deliveryStatus ? " / " + result.deliveryStatus : "")
            : copy.recordedMessage,
        );
    } catch {
      if (attempt === epoch.current) setError(copy.uncertainMessage);
    } finally {
      if (attempt === epoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  if (!contactPreferencesEnabled) return null;
  const choices =
    workspace?.purposes.filter((row) =>
      row.channels.includes(channel as ContactChannel),
    ) || [];
  const bounded = !!progress && progress.revision < 2147483647;
  return (
    <section className="contact-preferences">
      {copy ? (
        <h1>{copy.title}</h1>
      ) : (
        <button
          type="button"
          aria-label="Inspect"
          title="Inspect"
          disabled={busy}
          onClick={() => void inspect()}
        >
          <RefreshCw size={18} />
        </button>
      )}
      {busy && <p role="status">{copy?.workingLabel || "Working..."}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {workspace && copy && (
        <>
          <p>{copy.ownerLabel}</p>
          {!workspace.channels.length ? (
            <p>{copy.emptyMessage}</p>
          ) : (
            <>
              <label>
                {copy.channelLabel}
                <select
                  value={channel}
                  disabled={busy || !!pending}
                  onChange={(event) => {
                    setChannel(event.target.value as ContactChannel | "");
                    setPurpose("");
                    resetChoices();
                    setError("");
                  }}
                >
                  <option value=""></option>
                  {workspace.channels.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !!pending || !channel}
                onClick={() => void inspect()}
              >
                {copy.inspectLabel}
              </button>
              {progress && (
                <p role="status">
                  {progress.status}
                  {progress.deliveryStatus
                    ? " / " + progress.deliveryStatus
                    : ""}
                </p>
              )}
              <button
                type="button"
                disabled={
                  busy ||
                  !!pending ||
                  !bounded ||
                  !["NOT_STARTED", "VERIFIED"].includes(progress?.status || "")
                }
                onClick={() => prepare({ operation: "begin" }, copy.beginLabel)}
              >
                {copy.beginLabel}
              </button>
              <label>
                {copy.verificationCodeLabel}
                <input
                  value={secret}
                  autoComplete="one-time-code"
                  maxLength={128}
                  disabled={busy || !!pending || progress?.status !== "ISSUED"}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={
                  busy ||
                  !!pending ||
                  !bounded ||
                  progress?.status !== "ISSUED" ||
                  !/^[a-f0-9]{12,128}$/.test(secret)
                }
                onClick={() =>
                  prepare({ operation: "verify", secret }, copy.verifyLabel)
                }
              >
                {copy.verifyLabel}
              </button>
              {choices.length ? (
                <>
                  <label>
                    {copy.purposeLabel}
                    <select
                      value={purpose}
                      disabled={busy || !!pending}
                      onChange={(event) => {
                        setPurpose(event.target.value);
                        setGranted(false);
                        setSuppressed(false);
                        setReview(undefined);
                      }}
                    >
                      <option value=""></option>
                      {choices.map((row) => (
                        <option key={row.code} value={row.code}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="contact-choice">
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={busy || !!pending}
                      onChange={(event) => setGranted(event.target.checked)}
                    />
                    {copy.grantedLabel}
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !!pending ||
                      !bounded ||
                      !progress?.revision ||
                      !purpose ||
                      (granted && !progress?.verified)
                    }
                    onClick={() =>
                      prepare(
                        {
                          operation: "consent",
                          purpose,
                          granted,
                          operationReference: crypto.randomUUID(),
                        },
                        copy.consentLabel,
                      )
                    }
                  >
                    {copy.consentLabel}
                  </button>
                  <label className="contact-choice">
                    <input
                      type="checkbox"
                      checked={suppressed}
                      disabled={busy || !!pending}
                      onChange={(event) => setSuppressed(event.target.checked)}
                    />
                    {copy.suppressedLabel}
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !!pending ||
                      !bounded ||
                      !progress?.revision ||
                      !purpose
                    }
                    onClick={() =>
                      prepare(
                        { operation: "suppression", purpose, suppressed },
                        copy.suppressionLabel,
                      )
                    }
                  >
                    {copy.suppressionLabel}
                  </button>
                </>
              ) : (
                <p>{copy.emptyMessage}</p>
              )}
            </>
          )}
          {pending && (
            <section role="group" aria-label={copy.reviewTitle}>
              <h2>{copy.reviewTitle}</h2>
              <p>{pending.label}</p>
              <p>
                {copy.channelLabel}: {String(pending.command.body.channel)}
              </p>
              {pending.purposeLabel && (
                <p>
                  {copy.purposeLabel}: {pending.purposeLabel} /{" "}
                  {pending.purposeVersion}
                </p>
              )}
              {pending.command.operation === "consent" && (
                <label className="contact-choice">
                  <input
                    type="checkbox"
                    checked={pending.command.body.granted === true}
                    readOnly
                    disabled
                  />
                  {copy.grantedLabel}
                </label>
              )}
              {pending.command.operation === "suppression" && (
                <label className="contact-choice">
                  <input
                    type="checkbox"
                    checked={pending.command.body.suppressed === true}
                    readOnly
                    disabled
                  />
                  {copy.suppressedLabel}
                </label>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReview(undefined);
                  setSecret("");
                }}
              >
                {copy.cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {copy.confirmLabel}
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
