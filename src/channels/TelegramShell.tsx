import { submissionLinkCode } from "./submissionLink";
import { useEffect, useState } from "react";
import { MobileLaunchScreen } from "../mobile/MobileLaunchScreen";
import { MobileApp } from "../mobile/MobileApp";
import { MobileNotice } from "../mobile/MobilePrimitives";
import {
  APP_API,
  ApiError,
  request,
  saveSession,
  setTelegramLaunch,
  type Experience,
  type Session,
} from "../api";
import { telegramJourneyHost, type JourneyHost } from "./journeyHost";
import { enterChannel, linkChannel } from "./channelAuthentication";

type TelegramBootIssue = {
  title: string;
  message: string;
  retryable: boolean;
};

function telegramBootIssue(error: unknown): TelegramBootIssue {
  const message = error instanceof Error ? error.message : "Please reopen Circa.";
  const code = error instanceof ApiError ? error.code : undefined;
  if (
    code === "TELEGRAM_CONFIGURATION_REQUIRED" ||
    code === "UNCONFIGURED" ||
    /TELEGRAM_CONFIGURATION_REQUIRED|UNCONFIGURED/i.test(message)
  ) {
    return {
      title: "Configuration required.",
      message:
        "Circa is available, but Telegram access is not configured for this environment yet.",
      retryable: false,
    };
  }
  return { title: "Let’s reconnect.", message, retryable: true };
}

/** Loads the official host SDK only for the Telegram entry route. */
function loadTelegram(): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-circa-telegram]",
    );
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Telegram is taking too long to load. Reopen Circa from its bot.",
          ),
        ),
      10000,
    );
    const loaded = () => {
      clearTimeout(timer);
      resolve();
    };
    const failed = () => {
      clearTimeout(timer);
      reject(new Error("Telegram could not load. Reopen Circa from its bot."));
    };
    if (!script) {
      script = document.createElement("script");
      script.dataset.circaTelegram = "true";
      script.src = "https://telegram.org/js/telegram-web-app.js";
      document.head.appendChild(script);
    }
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
  });
}
/** Shares secure Profile forms and submission controls; signed launch context is verified by the backend. */
export function TelegramShell() {
  const [host, setHost] = useState<JourneyHost | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [experience, setExperience] = useState<Experience | null>(null),
    [issue, setIssue] = useState<TelegramBootIssue | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setIssue(null);
    void (async () => {
      await loadTelegram();
      const app = window.Telegram?.WebApp;
      if (!app?.initData)
        throw Error("Open this journey from the Circa Telegram bot.");
      // Reveal the loading/recovery UI before any network work.
      app.ready();
      app.expand();
      const restored = await enterChannel("TELEGRAM", app.initData);
      if (!active) return;
      saveSession(restored);
      setSession(restored);
      setTelegramLaunch(app.initData);
      setHost(telegramJourneyHost(app));
      const data = await request<Experience>(`${APP_API}/experience`);
      if (active) setExperience(data);
    })().catch((e) => {
      if (active) setIssue(telegramBootIssue(e));
    });
    return () => {
      active = false;
      setTelegramLaunch(null);
    };
  }, [attempt]);
  if (issue)
    return (
      <main className="mobile-boot">
        <h1>{issue.title}</h1>
        <MobileNotice
          retry={
            issue.retryable ? () => setAttempt((value) => value + 1) : undefined
          }
        >
          {issue.message}
        </MobileNotice>
        {issue.retryable ? (
          <p>
            Close Circa and reopen it from the bot if Telegram needs a fresh
            launch. Your saved submissions remain in your account.
          </p>
        ) : (
          <p>
            Ask an administrator to update Runtime Configuration in Axis, then
            reopen Circa from the bot.
          </p>
        )}
      </main>
    );
  if (!host || !experience) return <MobileLaunchScreen/>;

  return (
    <MobileApp
      session={session}
      experience={experience}
      host={host}
      initialSubmissionCode={submissionLinkCode(new URLSearchParams(window.Telegram?.WebApp?.initData || "").get("start_param"))}
      onLogin={async (value) => {
        const proof = window.Telegram?.WebApp?.initData;
        if (!proof)
          throw new Error(
            "Reopen Circa from Telegram before linking your account.",
          );
        await linkChannel("TELEGRAM", proof, value);
        const linkedSession = await enterChannel("TELEGRAM", proof);
        if (!linkedSession || linkedSession.loginId !== value.loginId)
          throw new Error("Your Telegram session could not be completed. Please reopen Circa.");
        saveSession(linkedSession);
        setSession(linkedSession);
      }}
      onLogout={() => setSession(null)}
    />
  );
}
