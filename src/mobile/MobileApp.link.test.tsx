import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
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
    onContinue,
  }: {
    initialSelection?: { code: string };
    onNavigate: () => void;
    onContinue: (code: string) => void;
  }) => (
    <div>
      {initialSelection && `Requested item: ${initialSelection.code}`}
      <button onClick={onNavigate}>Back to submissions</button>
      <button onClick={() => onContinue("SAVED_DRAFT")}>Continue saved draft</button>
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
      {code ? `Requested item: ${code}` : "New item journey"}
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
afterEach(() => { cleanup(); history.replaceState({}, "", "/"); sessionStorage.clear(); });
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

it.each(["web", "telegram"] as const)("keeps submission reachable from every main %s tab and account detail", async kind => {
  history.replaceState({}, "", kind === "telegram" ? "/telegram" : "/mobile");
  const user = userEvent.setup();
  render(<MobileApp session={{loginId:"customer",token:"token"}} experience={experience} host={{...host,kind}} onLogin={() => {}} onLogout={() => {}}/>);
  for (const name of ["Home", "Centres", "Items", "Account"]) {
    await user.click(within(screen.getByRole("navigation", {name:"Main navigation"})).getByRole("button", {name}));
    expect(within(screen.getByRole("region", {name:"Recycling actions"})).getByRole("button", {name:"Submit eWaste"})).toBeEnabled();
  }
  await user.click(screen.getByRole("link", {name:"Wallet"}));
  await screen.findByRole("heading", {name:"Your wallet"});
  await user.click(within(screen.getByRole("region", {name:"Recycling actions"})).getByRole("button", {name:"Submit eWaste"}));
  expect(screen.getByText("New item journey")).toBeInTheDocument();
  expect(screen.queryByRole("region", {name:"Recycling actions"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"Back to submissions"}));
  expect(location.search).toContain("view=submissions");
  expect(location.search).not.toContain("account=");
  expect(screen.getByRole("button", {name:"Items",current:"page"})).toBeInTheDocument();
});

it("continues a submission after sign-in while preserving the Telegram launch and saved draft", async () => {
  history.replaceState({}, "", "/telegram?account=wallet&tgWebAppStartParam=launch-context");
  sessionStorage.setItem("circa.draft.customer", "SAVED_DRAFT");
  sessionStorage.setItem("circa.draft.customer.create", "previous-command");
  function Harness() {
    const [session, setSession] = useState<Session | null>(null);
    return <MobileApp session={session} experience={experience} host={host} onLogin={setSession} onLogout={() => setSession(null)}/>;
  }
  const user = userEvent.setup();
  render(<Harness/>);
  await user.click(screen.getByRole("button", {name:"Submit eWaste"}));
  expect(screen.getByRole("status")).toHaveTextContent("Sign in to submit your eWaste");
  expect(screen.queryByText("New item journey")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"Sign in for this item"}));
  expect(screen.getByText("New item journey")).toBeInTheDocument();
  expect(sessionStorage.getItem("circa.draft.customer")).toBe("SAVED_DRAFT");
  expect(sessionStorage.getItem("circa.draft.customer.create")).toBeNull();
  await user.click(screen.getByRole("button", {name:"Back to submissions"}));
  expect(location.search).toContain("tgWebAppStartParam=launch-context");
  await user.click(screen.getByRole("button", {name:"Continue saved draft"}));
  expect(screen.getByText("Requested item: SAVED_DRAFT")).toBeInTheDocument();
});
