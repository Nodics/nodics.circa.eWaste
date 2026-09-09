import {
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircaApp } from "./CircaApp";
import { API, unwrap, saveSession, type Submission } from "./api";
vi.mock("./CollectionMap", () => ({
  CollectionMap: () => <div aria-label="Collection centre map">Map</div>,
}));
const experience = {
  presentation: { sampleMode: true },
  centres: [{ code: "centre-1", name: { en: "Community collection centre" } }],
  categories: [{ code: "TABLET", name: { en: "Tablet" } }],
  itemTypes: [
    { code: "TABLET_DEVICE", categoryCode: "TABLET", name: { en: "Tablet" } },
  ],
};
const submissions: Submission[] = ["APPROVED", "SUBMITTED", "REJECTED"].map(
  (status, i) => ({
    code: "submission-" + i,
    revision: 1,
    submissionStatus: status,
    submittedFacts: { name: "Device " + i, quantity: 1 },
    metadata: {
      submittedAt: "2026-09-01",
      ...(status === "REJECTED"
        ? { publicReason: "Please provide a clearer photo." }
        : {}),
    },
  }),
);
const account = {
  customer: { code: "customer-1", loginId: "customer@example.test" },
  assets: [],
  events: [],
  submissions,
};
const wallet = {
  wallet: { code: "wallet-1" },
  balances: [
    { rewardTypeCode: "points", available: "118", reserved: "3" },
    { rewardTypeCode: "circaCarbon", available: "152", reserved: "0" },
  ],
  entries: [],
};
let calls: { url: string; method: string; body: Record<string, unknown> }[];
let draft: Submission;
beforeEach(() => {
  sessionStorage.clear();
  saveSession(null);
  document.cookie = "nodics_customer_csrf=; Max-Age=0; Path=/";
  history.replaceState({}, "", "/");
  calls = [];
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: "granted" })) },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((resolve) =>
        resolve({
          coords: { latitude: 25, longitude: 55, accuracy: 5 },
          timestamp: Date.now(),
        }),
      ),
    },
  });
  draft = {
    code: "draft-1",
    revision: 1,
    submissionStatus: "DRAFT",
    submittedFacts: {},
    metadata: {},
  };
  vi.stubGlobal("scrollTo", vi.fn());
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const body =
        typeof options?.body === "string" ? JSON.parse(options.body) : {};
      calls.push({ url: String(url), method: options?.method || "GET", body });
      if (url.includes("/delivery/pages/resolve"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              contractVersion: 0,
              site: "circaSite",
              path: "/",
              page: {
                code: "test-home",
                renderer: "circa.page",
                components: ["shell", "wallet", "centres"].map(
                  (kind, index) => ({
                    code: kind,
                    renderer: "circa." + kind,
                    rendererContractVersion: 1,
                    properties: {},
                    index,
                  }),
                ),
              },
            },
          }),
        };
      let data: unknown;
      if (url.endsWith("/purchases")) data = { orders: [], entitlements: [] };
      else if (url.endsWith("/experience")) data = experience;
      else if (url.endsWith("/marketplace")) data = { assets: [], coupons: [] };
      else if (url.endsWith("/customer/browser/authenticate"))
        data = { authToken: "test-customer-token" };
      else if (url.endsWith("/account")) data = account;
      else if (url.endsWith("/wallet")) data = wallet;
      else if (url === API + "/submissions") {
        draft = { ...draft, submittedFacts: body };
        data = draft;
      } else if (url.endsWith("/arrival")) {
        draft = {
          ...draft,
          revision: draft.revision + 1,
          submittedFacts: {
            ...draft.submittedFacts,
            preferredCollectionPointCode: "centre-1",
          },
        };
        data = {
          draft,
          nextAction: "PHOTO",
          selectedCentre: experience.centres[0],
          nearbyCentres: experience.centres,
          centres: experience.centres,
        };
      } else if (url.endsWith("/messages")) {
        draft = { ...draft, revision: draft.revision + 1 };
        data = {
          message: "Fresh location confirms arrival. Your draft is unchanged.",
          draft,
        };
      } else if (url.endsWith("/draft-1")) data = draft;
      else throw new Error("Unexpected test request " + url);
      return { ok: true, status: 200, json: async () => ({ data }) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function signIn() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Sign in/ }));
  const dialog = screen.getByRole("dialog", { name: "Welcome back" });
  await user.type(
    within(dialog).getByLabelText("Email address"),
    "customer@example.test",
  );
  await user.type(
    within(dialog).getByLabelText("Password"),
    "example password",
  );
  await user.click(within(dialog).getByRole("button", { name: "Sign in" }));
  await screen.findAllByRole("link", { name: "My Account" });
  return user;
}
describe("connected Circa journeys", () => {
  it("keeps personal values private until login and clears them immediately at logout", async () => {
    render(<CircaApp />);
    await screen.findByLabelText("Collection centre map");
    expect(screen.queryByText("118")).not.toBeInTheDocument();
    const user = await signIn();
    await screen.findByText("118");
    expect(screen.getByText("152")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.queryByText("118")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("circa.session")).toBeNull();
  });
  it("loads account statuses from the API and shows the recorded rejection reason", async () => {
    saveSession({ token: "test", loginId: "customer@example.test" });
    history.replaceState({}, "", "/account");
    render(<CircaApp />);
    await screen.findByRole("heading", { name: "Device 0" });
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Submission status filter"),
      "REJECTED",
    );
    expect(
      screen.queryByRole("heading", { name: "Device 0" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Please provide a clearer photo."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /View details/ }));
    expect(
      screen.getByRole("dialog", { name: "Device 2" }),
    ).toBeInTheDocument();
  });
  it("captures granted location automatically and preserves the journey across help and resume", async () => {
    saveSession({ token: "test", loginId: "customer@example.test" });
    render(<CircaApp />);
    const user = userEvent.setup();
    await screen.findByLabelText("Collection centre map");
    await user.click(
      screen.getByRole("button", { name: "Open Submit Waste assistant" }),
    );
    await screen.findByText("Take a photo. We’ll identify your item.");
    expect(
      screen.queryByRole("button", { name: "Share location" }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Message Circa assistant"),
      "Why location?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/Fresh location confirms arrival/);
    expect(calls.some((c) => c.url.endsWith("/arrival"))).toBe(true);
    expect(calls.some((c) => /confirm|earn|purchase/.test(c.url))).toBe(false);
    const conversation = calls.find((c) => c.url.endsWith("/messages"));
    expect(conversation?.body.expectedRevision).toBe(2);
    expect(sessionStorage.getItem("circa.draft.customer@example.test")).toBe(
      "draft-1",
    );
    await user.click(
      screen.getByRole("button", { name: "Minimize assistant" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Open Submit Waste assistant" }),
    );
    await screen.findByText("Take a photo. We’ll identify your item.");
    expect(screen.getByText("Community collection centre")).toBeInTheDocument();
  });
  it("unwraps supported nested transport envelopes without changing record arrays", () => {
    expect(unwrap({ data: { result: [{ code: "one" }] } })).toEqual([
      { code: "one" },
    ]);
  });
});
