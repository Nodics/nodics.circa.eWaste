import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MobileApp } from "./MobileApp";
import { submissionLinkCode } from "../channels/submissionLink";
import type { Experience, Session } from "../api";
import type { JourneyHost } from "../channels/journeyHost";
vi.mock("../api", () => ({
  API: "/nodics/eWaste/v0",
  request: vi.fn(async () => ({ submissions: [], events: [], assets: [], customer: { code: "customer" }, balances: [], entries: [], statuses: [], total: 0, items: [] })),
  statusLabel: (s: string) => s,
  endSession: vi.fn(),
}));
vi.mock("../cms", () => ({ usePublishedPage: () => ({ page: null }), contentText: () => "", publicMedia: (value: string) => value }));
vi.mock("./MobileCentres", () => ({ MobileCentres: () => null }));
vi.mock("../features/waste/CustomerWasteWorkspace", () => ({
  CustomerWasteWorkspace: ({
    initialSelection,
    onNavigate,
  }: {
    initialSelection?: { code: string };
    onNavigate: () => void;
  }) => (
    <div>
      {initialSelection && `Requested item: ${initialSelection.code}`}
      <button onClick={onNavigate}>Back to submissions</button>
    </div>
  ),
}));
vi.mock("./MobileSubmissionJourney", () => ({
  MobileSubmissionJourney: ({
    code,
    onExit,
  }: {
    code: string;
    onExit: () => void;
  }) => (
    <div>
      Requested item: {code}
      <button onClick={onExit}>Back to submissions</button>
    </div>
  ),
}));
vi.mock("../CustomerAuthentication", () => ({
  CustomerAuthentication: ({ onLogin }: { onLogin: (s: Session) => void }) => (
    <button onClick={() => onLogin({ loginId: "customer", token: "token" })}>
      Sign in for this item
    </button>
  ),
}));
afterEach(() => { cleanup(); history.replaceState({}, "", "/"); });
const experience = { presentation: { sampleMode: true } } as Experience,
  host: JourneyHost = {
    kind: "telegram",
    permission: async () => "unknown",
    capture: async () => {
      throw Error("Unused fixture capture");
    },
    openMap: () => {},
  };
it("opens the notification target instead of selecting another saved draft", async () => {
  const user = userEvent.setup();
  render(
    <MobileApp
      session={{ loginId: "customer", token: "token" }}
      experience={experience}
      host={host}
      onLogin={() => {}}
      onLogout={() => {}}
      initialSubmissionCode="WST_REVIEWED"
    />,
  );
  expect(screen.getByText("Requested item: WST_REVIEWED")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Back to submissions" }));
  expect(
    screen.queryByText("Requested item: WST_REVIEWED"),
  ).not.toBeInTheDocument();
});
it("preserves the requested item across shared sign-in", async () => {
  function Harness() {
    const [session, setSession] = useState<Session | null>(null);
    return (
      <MobileApp
        session={session}
        experience={experience}
        host={host}
        onLogin={setSession}
        onLogout={() => setSession(null)}
        initialSubmissionCode="WST_REVIEWED"
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  expect(
    screen.queryByText("Requested item: WST_REVIEWED"),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Sign in for this item" }),
  );
  expect(screen.getByText("Requested item: WST_REVIEWED")).toBeInTheDocument();
});
it("accepts only a bounded code, never a URL, path or query expression", () => {
  expect(submissionLinkCode("WST_REVIEWED")).toBe("WST_REVIEWED");
  for (const value of [
    "../../other",
    "https://example.com",
    "id?owner=other",
    "a".repeat(181),
    null,
    {},
  ])
    expect(submissionLinkCode(value)).toBeUndefined();
});
it("retains a separate account destination through sign-in and returns to the account menu", async () => {
  history.replaceState({}, "", "/telegram?account=activity&tgWebAppStartParam=launch-context");
  function Harness() {
    const [session, setSession] = useState<Session | null>(null);
    return <MobileApp session={session} experience={experience} host={host} onLogin={setSession} onLogout={() => setSession(null)}/>;
  }
  const user = userEvent.setup();
  render(<Harness/>);
  await user.click(screen.getByRole("button", {name:"Sign in for this item"}));
  await screen.findByRole("heading", {name:"Ownership activity", level:1});
  await screen.findByText("No ownership changes yet");
  await user.click(screen.getByRole("link", {name:"Back to dashboard"}));
  expect(screen.getByRole("navigation", {name:"Dashboard shortcuts"})).toBeInTheDocument();
  expect(location.search).toContain("tgWebAppStartParam=launch-context");
  expect(location.search).toContain("account=overview");
  await user.click(screen.getByRole("link", {name:/^View my items/}));
  expect(location.search).toContain("view=submissions");
  expect(location.search).not.toContain("account=");
  expect(screen.getByRole("button", {name:"Items", current:"page"})).toBeInTheDocument();
});
