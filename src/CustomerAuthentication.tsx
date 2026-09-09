import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { APP_API, request, type Session } from "./api";

/** Shared Web and embedded-channel authentication. Profile owns credentials and sessions; each host completes its verified channel link after successful sign-in. */
export function CustomerAuthentication({
  onLogin,
  sample = false,
  onModeChange,
  showTitle = true,
}: {
  onLogin: (session: Session) => void | Promise<void>;
  sample?: boolean;
  onModeChange?: (register: boolean) => void;
  showTitle?: boolean;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  return (
    <section
      className="customer-authentication"
      aria-label="Your Circa account"
    >
      {showTitle && (
        <h2>{register ? "Create your Circa account" : "Welcome back"}</h2>
      )}
      <p>Keep your electronics, rewards and next steps in one place.</p>
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          const element = event.currentTarget,
            data = new FormData(element);
          const loginId = String(data.get("email") || "")
              .trim()
              .toLowerCase(),
            password = String(data.get("password") || "");
          const passwordInput = element.elements.namedItem(
            "password",
          ) as HTMLInputElement | null;
          if (passwordInput) passwordInput.value = "";
          try {
            if (register) {
              await request(`${APP_API}/registrations`, null, {
                email: loginId,
                password,
                name: data.get("name"),
              });
              // Once registration succeeds, a later sign-in/link failure retries authentication only.
              setRegister(false);
              onModeChange?.(false);
              setNotice(
                "Your account is created. Sign in to continue if the connection is interrupted.",
              );
            }
            const auth = await request<{ authToken?: string }>(
              "/nodics/profile/v0/customer/browser/authenticate",
              null,
              { loginId, password },
            );
            if (!auth.authToken)
              throw new Error(
                "The sign-in response was incomplete. Please retry.",
              );
            await onLogin({ token: auth.authToken, loginId });
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Sign in failed.",
            );
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        {register && (
          <label>
            Name
            <input
              name="name"
              autoComplete="name"
              placeholder="Your full name"
              maxLength={160}
              required
              disabled={busy}
            />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="username"
            maxLength={180}
            required
            autoFocus
            disabled={busy}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={register ? 12 : 1}
            autoComplete={register ? "new-password" : "current-password"}
            required
            disabled={busy}
          />
        </label>
        {register && <small>Use at least 12 characters.</small>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-toggle">
        {register ? "Already a member?" : "New to Circa?"}{" "}
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            const next = !register;
            setRegister(next);
            onModeChange?.(next);
            setError("");
            setNotice("");
          }}
        >
          {register ? "Sign in" : "Create an account"}
        </button>
      </p>
      {sample && (
        <div className="sample-login">
          <strong>Local sample account</strong>
          <span>customer@circa.local</span>
          <span>CircaDemo!2026</span>
          <small>Sample assets and illustrative carbon units.</small>
        </div>
      )}
    </section>
  );
}
