/** Explicit Profile consent and browser handoff. Employee proof never enters Circa customer storage or channel linking. */
import { useEffect, useRef, useState } from "react";
import { endSession, request, saveSession, type Session } from "./api";
import "./employeeParticipation.css";
import {
  acceptParticipation,
  authenticateParticipationEmployee,
  inspectParticipation,
  switchParticipation,
  withdrawParticipation,
  type EmployeeParticipationProof,
  type ParticipationWorkspace,
} from "./employeeParticipationClient";

/** Reviews owner terms and independently confirms Customer issuance; host continuation retries never repeat the switch. */
export function EmployeeCustomerParticipation({
  onLogin,
  onCancel,
}: {
  readonly onLogin: (session: Session) => void | Promise<void>;
  readonly onCancel: () => void;
}) {
  const [employee, setEmployee] = useState<EmployeeParticipationProof>();
  const [workspace, setWorkspace] = useState<ParticipationWorkspace>();
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [customer, setCustomer] = useState<Session>();
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<"accept" | "withdraw" | "switch">();
  const epoch = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    epoch.current++;
    const activeEpoch = epoch;
    return () => {
      activeEpoch.current++;
    };
  }, []);
  const switchReady =
    !!workspace &&
    workspace.participation?.phase === "COMPLETE" &&
    workspace.participation.currentTerms === true &&
    workspace.participation.canSwitch === true;
  const inspect = async () => {
    if (!employee || inFlight.current) return;
    const attempt = epoch.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setWorkspace(undefined);
    setConsent(false);
    setReview(undefined);
    try {
      const next = await inspectParticipation(employee);
      if (attempt === epoch.current) setWorkspace(next);
    } catch {
      if (attempt === epoch.current)
        setError("The Profile response could not be confirmed.");
    } finally {
      if (attempt === epoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const continueCustomer = async (value: Session) => {
    const attempt = epoch.current;
    try {
      await onLogin(value);
      if (attempt === epoch.current) setCustomer(undefined);
    } catch {
      if (attempt === epoch.current)
        setError("The customer session could not be completed.");
    }
  };
  const confirm = async () => {
    if (
      !employee ||
      !workspace ||
      !review ||
      inFlight.current ||
      (review === "accept" && !consent) ||
      (review === "switch" && !switchReady)
    )
      return;
    const attempt = epoch.current,
      action = review,
      proof = employee,
      inspected = workspace;
    inFlight.current = true;
    setBusy(true);
    setReview(undefined);
    setConsent(false);
    setError("");
    setNotice("");
    setWorkspace(undefined);
    try {
      if (action === "switch") {
        setEmployee(undefined);
        saveSession(null);
        const value = await switchParticipation(proof, inspected);
        if (attempt !== epoch.current) return;
        setCustomer(value);
        await continueCustomer(value);
      } else if (action === "accept") {
        await acceptParticipation(proof, inspected);
        if (attempt === epoch.current) {
          setNotice(inspected.presentation.acceptedMessage);
        }
      } else {
        await withdrawParticipation(proof, inspected);
      }
    } catch {
      if (attempt === epoch.current) {
        setError(inspected.presentation.uncertainMessage);
      }
    } finally {
      if (attempt === epoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <section
      className="customer-authentication employee-participation"
      aria-label="Employee customer participation"
    >
      {!employee && !customer && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (inFlight.current) return;
            const attempt = epoch.current,
              form = event.currentTarget,
              data = new FormData(form);
            const loginId = String(data.get("employeeLogin") || "").trim(),
              password = String(data.get("employeePassword") || "");
            const passwordInput = form.elements.namedItem(
              "employeePassword",
            ) as HTMLInputElement | null;
            if (passwordInput) passwordInput.value = "";
            inFlight.current = true;
            setBusy(true);
            setError("");
            setWorkspace(undefined);
            setConsent(false);
            void (async () => {
              try {
                const proof = await authenticateParticipationEmployee(
                  loginId,
                  password,
                );
                if (attempt !== epoch.current) return;
                setEmployee(proof);
                const value = await inspectParticipation(proof);
                if (attempt === epoch.current) setWorkspace(value);
              } catch {
                if (attempt === epoch.current)
                  setError(
                    "The Employee session or participation could not be confirmed.",
                  );
              } finally {
                if (attempt === epoch.current) {
                  inFlight.current = false;
                  setBusy(false);
                }
              }
            })();
          }}
        >
          <label>
            Employee login
            <input
              name="employeeLogin"
              autoComplete="username"
              maxLength={320}
              disabled={busy}
              required
            />
          </label>
          <label>
            Password
            <input
              name="employeePassword"
              type="password"
              autoComplete="current-password"
              maxLength={10000}
              disabled={busy}
              required
            />
          </label>
          <button className="primary full" disabled={busy}>
            Sign in as employee
          </button>
        </form>
      )}
      {employee && (
        <button type="button" disabled={busy} onClick={() => void inspect()}>
          {workspace?.presentation.refreshLabel || "Inspect"}
        </button>
      )}
      {workspace && (
        <>
          <h3>{workspace.presentation.title}</h3>
          <p>
            {workspace.enterpriseCode} / {workspace.participation?.phase || ""}
          </p>
          <h4>{workspace.terms.title}</h4>
          <p>
            {workspace.terms.documentCode} / {workspace.terms.version}
          </p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {workspace.terms.content}
          </p>
          <label className="employee-participation-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={
                busy ||
                !!review ||
                workspace.participation?.phase === "WITHDRAWN" ||
                workspace.participation?.currentTerms === true
              }
              onChange={(event) => setConsent(event.target.checked)}
            />
            {workspace.presentation.consentLabel}
          </label>
          <button
            type="button"
            disabled={
              busy ||
              !consent ||
              workspace.participation?.phase === "WITHDRAWN" ||
              workspace.participation?.currentTerms === true ||
              (workspace.participation?.revision ?? 0) >= 2147483647 ||
              (!!workspace.participation && !workspace.lifecycleQualified)
            }
            onClick={() => setReview("accept")}
          >
            {workspace.participation
              ? workspace.presentation.renewLabel
              : workspace.presentation.acceptLabel}
          </button>
          {workspace.lifecycleQualified &&
            workspace.participation?.phase === "COMPLETE" && (
              <button
                type="button"
                disabled={
                  busy || workspace.participation.revision >= 2147483647
                }
                onClick={() => setReview("withdraw")}
              >
                {workspace.presentation.withdrawLabel}
              </button>
            )}
          <button
            type="button"
            disabled={busy || !switchReady}
            onClick={() => setReview("switch")}
          >
            Continue as customer
          </button>
          {review && (
            <section
              role="group"
              aria-label={
                review === "withdraw"
                  ? workspace.presentation.withdrawReviewTitle
                  : workspace.terms.title
              }
            >
              <h4>
                {review === "withdraw"
                  ? workspace.presentation.withdrawReviewTitle
                  : review === "switch"
                    ? "Customer"
                    : workspace.terms.title}
              </h4>
              <p>
                {workspace.enterpriseCode} /{" "}
                {workspace.participation?.revision || ""} /{" "}
                {workspace.terms.version}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReview(undefined)}
              >
                {workspace.presentation.cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {workspace.presentation.confirmLabel}
              </button>
            </section>
          )}
        </>
      )}
      {customer && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setError("");
            const attempt = epoch.current;
            void continueCustomer(customer).finally(() => {
              if (attempt === epoch.current) {
                inFlight.current = false;
                setBusy(false);
              }
            });
          }}
        >
          Continue
        </button>
      )}
      {busy && <p role="status">Working...</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (inFlight.current) return;
          const attempt = epoch.current;
          inFlight.current = true;
          setBusy(true);
          void (async () => {
            try {
              if (employee)
                await request(
                  "/nodics/profile/v0/employee/browser/logout",
                  employee,
                  {},
                );
              else if (customer) await endSession();
              if (attempt === epoch.current) {
                setEmployee(undefined);
                setCustomer(undefined);
                onCancel();
              }
            } catch {
              if (attempt === epoch.current) {
                setEmployee(undefined);
                setCustomer(undefined);
                setWorkspace(undefined);
                setReview(undefined);
                setError("The browser session could not be confirmed.");
              }
            } finally {
              if (attempt === epoch.current) {
                inFlight.current = false;
                setBusy(false);
              }
            }
          })();
        }}
      >
        Cancel
      </button>
    </section>
  );
}
