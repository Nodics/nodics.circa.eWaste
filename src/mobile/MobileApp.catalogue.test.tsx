import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileApp } from "./MobileApp";
import {
  API,
  ApiError,
  request,
  type Experience,
  type Offer,
  type Session,
  type Wallet,
} from "../api";
import type { JourneyHost } from "../channels/journeyHost";

vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  request: vi.fn(),
  endSession: vi.fn(async () => {}),
}));
vi.mock("../cms", async (original) => ({
  ...(await original<typeof import("../cms")>()),
  usePublishedPage: () => ({ page: null }),
}));
vi.mock("./MobileCentres", () => ({
  MobileCentres: () => <h1>Collection centres</h1>,
}));
vi.mock("../OutcomeInbox", () => ({ CustomerUpdates: () => null }));
vi.mock("../CustomerAuthentication", () => ({
  CustomerAuthentication: ({
    onLogin,
  }: {
    onLogin: (value: Session) => Promise<void>;
  }) => (
    <button onClick={() => void onLogin({ token: "fresh", loginId: "buyer" })}>
      Complete shared sign-in
    </button>
  ),
}));

const call = vi.mocked(request);
const experience = { presentation: { sampleMode: false } } as Experience;
const coupon: Offer = {
  code: "CPN_1",
  kind: "COUPON",
  name: "Repair credit",
  rewardPrice: 10,
  revision: "v7",
  available: true,
  acquisitionRequirements: { type: "REWARDS" },
  commerce: {
    storeCode: "store",
    currency: "POINTS",
    jurisdiction: "AE",
    locale: "en",
    programCode: "program",
    rewardTypeCode: "points",
    variantCode: "unit",
  },
};
const asset: Offer = {
  ...coupon,
  code: "AST_1",
  kind: "ASSET",
  name: "Reused laptop",
  ownerCode: "seller",
  ownerRef: { module: "profile", schema: "customer", code: "seller" },
};
const wallet: Wallet = {
  wallet: { code: "wallet", ownerCode: "buyer" },
  balances: [{ rewardTypeCode: "points", available: "100", reserved: "0" }],
  entries: [],
};
const participantWallet = {
  ...wallet,
  owner: { ownerType: "CUSTOMER", ownerCode: "buyer" },
  balances: [
    { programCode: "program", rewardTypeCode: "points", available: "100" },
  ],
};
let back: (() => void) | undefined;
const host: JourneyHost = {
  kind: "telegram",
  permission: vi.fn(async () => "denied" as const),
  capture: vi.fn(),
  openMap: vi.fn(),
  bindBack: (handler) => {
    back = handler;
    return () => {
      if (back === handler) back = undefined;
    };
  },
};
function Harness({
  signedIn = false,
  activeHost = host,
}: {
  signedIn?: boolean;
  activeHost?: JourneyHost;
}) {
  const [session, setSession] = useState<Session | null>(
    signedIn ? { token: "test", loginId: "buyer" } : null,
  );
  return (
    <MobileApp
      session={session}
      experience={experience}
      host={activeHost}
      onLogin={setSession}
      onLogout={() => setSession(null)}
    />
  );
}
function detailUrl(kind = "coupons", product = "CPN_1") {
  history.replaceState(
    {},
    "",
    `/telegram?shop=${kind}&product=${encodeURIComponent(product)}&tgWebAppStartParam=launch-context&q=repair&layout=list&page=2`,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  back = undefined;
  call.mockReset();
  vi.mocked(host.permission).mockClear();
  vi.mocked(host.capture).mockClear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  history.replaceState({}, "", "/telegram?tgWebAppStartParam=launch-context");
  call.mockImplementation(async (path, _session, body) => {
    const url = String(path);
    const payload = body as Record<string, string>;
    if (url === `${API}/account`)
      return {
        customer: { code: "buyer", loginId: "buyer" },
        submissions: [],
        assets: [],
        events: [],
      };
    if (url === `${API}/wallet`) return wallet;
    if (url === "/nodics/loyaltyApi/v0/participant/wallet")
      return participantWallet;
    if (url === "/nodics/cart/v0/carts") return {};
    if (url.startsWith("/nodics/cart/v0/carts/") && url.endsWith("/entries")) {
      const cartCode = decodeURIComponent(url.split("/").at(-2)!);
      return {
        cart: { code: cartCode, revision: 3 },
        entries: [
          { code: payload.entryCode, productCode: payload.productCode },
        ],
        calculation: {
          code: "calculation",
          cartCode,
          currency: "POINTS",
          totalAmount: "10.00",
        },
      };
    }
    if (url === "/nodics/checkoutCore/v0/checkouts/place")
      return {
        status: "COMPLETED",
        code: payload.orderCode,
        orderCode: payload.orderCode,
        cartCode: payload.cartCode,
      };
    if (url.startsWith("/nodics/checkoutCore/v0/checkouts/commands/")) {
      const key = decodeURIComponent(url.split("/").at(-1)!);
      return {
        status: "COMPLETED",
        scopeQualified: true,
        orderCode: "purchase-" + key,
        cartCode: "purchase-" + key + "-cart",
      };
    }
    if (url.startsWith("/nodics/checkoutCore/v0/checkouts/"))
      return {
        status: "COMPLETED",
        code: decodeURIComponent(url.split("/").at(-1)!),
      };
    if (url === `${API}/marketplace`)
      return { assets: [asset], coupons: [coupon] };
    if (url === "/nodics/order/v0/orders?limit=100") return [];
    if (url === "/nodics/digitalCore/v0/entitlements")
      return { entitlements: [] };
    if (url.includes("/catalogue/"))
      return url.includes("kind=ASSET") ? asset : coupon;
    if (url.includes("/catalogue?")) {
      const offer = url.includes("kind=ASSET") ? asset : coupon;
      return {
        kind: offer.kind,
        items: [offer],
        total: 25,
        page: 2,
        pageSize: 12,
        facets: { categories: [], conditions: [], issuers: [] },
      };
    }
    throw new Error(`Unexpected fixture request: ${url}`);
  });
});
afterEach(() => {
  cleanup();
  history.replaceState({}, "", "/");
});
const commands = () =>
  call.mock.calls.filter(
    ([url]) => url === "/nodics/checkoutCore/v0/checkouts/place",
  );

it.each(["/mobile", "/telegram"])(
  "mounts guest catalogue and product navigation inside %s without device permissions or commands",
  async (path) => {
    history.replaceState({}, "", `${path}?tgWebAppStartParam=launch-context`);
    const user = userEvent.setup();
    render(
      <Harness
        activeHost={{ ...host, kind: path === "/mobile" ? "web" : "telegram" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Shop" }));
    await screen.findByRole("heading", { name: "Reused laptop" });
    await user.click(screen.getByRole("link", { name: "Coupons" }));
    await screen.findByRole("heading", { name: "Repair credit" });
    await user.click(screen.getByRole("button", { name: "List view" }));
    const href = screen
      .getByRole("link", { name: "View details: Repair credit" })
      .getAttribute("href");
    expect(href).toContain(path);
    expect(href).toContain("tgWebAppStartParam=launch-context");
    expect(href).toContain("layout=list");
    await user.click(
      screen.getByRole("link", { name: "View details: Repair credit" }),
    );
    await screen.findByRole("heading", { name: "Repair credit", level: 1 });
    expect(location.pathname).toBe(path);
    expect(
      screen.getByRole("button", { name: "Shop", current: "page" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sign in to continue" }),
    ).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Back to coupons" }));
    await screen.findByRole("heading", { name: "Repair credit", level: 2 });
    expect(location.search).toContain("layout=list");
    expect(location.search).not.toContain("product=");
    expect(commands()).toEqual([]);
    expect(host.permission).not.toHaveBeenCalled();
    expect(host.capture).not.toHaveBeenCalled();
    for (const [url] of call.mock.calls)
      expect(String(url)).not.toContain("tgWebAppStartParam");
  },
);

it("retains a direct product through shared sign-in and requires fresh review and explicit confirmation", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(
    await screen.findByRole("button", { name: "Sign in to continue" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Complete shared sign-in" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Review coupon purchase/ }),
  );
  const dialog = screen.getByRole("dialog", { name: "Review your purchase" });
  expect(within(dialog).getByText("10.00 POINTS")).toBeVisible();
  expect(within(dialog).getByText("100")).toBeVisible();
  expect(commands()).toEqual([]);
  await user.click(
    within(dialog).getByRole("button", { name: "Confirm purchase" }),
  );
  await screen.findByText("Your coupon is ready.");
  expect(commands()).toHaveLength(1);
  expect(commands()[0]).toEqual([
    "/nodics/checkoutCore/v0/checkouts/place",
    { token: "fresh", loginId: "buyer" },
    expect.objectContaining({
      expectedCartRevision: 3,
      calculationCode: "calculation",
      rewardAmount: "10.00",
      idempotencyKey: expect.any(String),
    }),
  ]);
  expect(location.search).toContain("product=CPN_1");
  expect(location.search).toContain("tgWebAppStartParam=launch-context");
  await user.click(screen.getByRole("link", { name: "Go to My Account" }));
  await screen.findByRole("heading", { name: "Your purchases & coupons" });
  expect(location.pathname).toBe("/telegram");
  expect(location.search).toContain("account=purchases");
  expect(location.search).not.toContain("shop=");
  expect(commands()).toHaveLength(1);
});

it("native Back dismisses sign-in, quick view, filters and review before returning to the catalogue", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(
    await screen.findByRole("button", { name: "Sign in to continue" }),
  );
  act(() => back?.());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(location.search).toContain("product=CPN_1");
  await user.click(screen.getByRole("button", { name: "Sign in to continue" }));
  await user.click(
    screen.getByRole("button", { name: "Complete shared sign-in" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Review coupon purchase/ }),
  );
  act(() => back?.());
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => back?.());
  await screen.findByRole("heading", { name: "Repair credit", level: 2 });
  expect(location.search).toContain("q=repair");
  expect(location.search).toContain("page=2");
  await user.click(
    screen.getByRole("button", { name: "Quick view: Repair credit" }),
  );
  await within(screen.getByRole("dialog")).findByRole("link", {
    name: "Open full details",
  });
  act(() => back?.());
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  act(() => back?.());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(commands()).toEqual([]);
});

it("opens quick-view details without leaving the Telegram shell", async () => {
  history.replaceState(
    {},
    "",
    "/telegram?shop=coupons&tgWebAppStartParam=launch-context",
  );
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(
    await screen.findByRole("button", { name: "Quick view: Repair credit" }),
  );
  await user.click(
    await within(screen.getByRole("dialog")).findByRole("link", {
      name: "Open full details",
    }),
  );
  await screen.findByRole("heading", { name: "Repair credit", level: 1 });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(location.pathname).toBe("/telegram");
  expect(commands()).toEqual([]);
});

it("shows owner permission denial without granting review and recovers only after another explicit read", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness signedIn />);
  const review = await screen.findByRole("button", {
    name: /Review coupon purchase/,
  });
  call.mockRejectedValueOnce(
    new ApiError("Purchase access denied", "ERR_PERMISSION_DENIED"),
  );
  await user.click(review);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Purchase access denied",
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(commands()).toEqual([]);
  await user.click(review);
  await screen.findByRole("dialog", { name: "Review your purchase" });
  expect(commands()).toEqual([]);
});

it("uncertain purchase stays in review and uses original command inspection without a second placement", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness signedIn />);
  await user.click(
    await screen.findByRole("button", { name: /Review coupon purchase/ }),
  );
  call.mockRejectedValueOnce(
    new Error("Outcome unconfirmed. Inspect your account before retrying."),
  );
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await within(screen.getByRole("dialog")).findByText(/Outcome unconfirmed/);
  expect(commands()).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Check purchase" }));
  await screen.findByText("Your coupon is ready.");
  expect(commands()).toHaveLength(1);
});

it("rejects invalid product links without issuing a product read and leaves the catalogue reachable", async () => {
  detailUrl("coupons", "../../other");
  const user = userEvent.setup();
  render(<Harness />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "product link is invalid",
  );
  expect(call).not.toHaveBeenCalled();
  await user.click(screen.getByRole("link", { name: "Back to coupons" }));
  await screen.findByRole("heading", { name: "Repair credit" });
  expect(commands()).toEqual([]);
});

it("restores shop selection on history navigation and clears it when selecting another tab", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByRole("heading", { name: "Repair credit", level: 1 });
  await user.click(screen.getByRole("button", { name: "Centres" }));
  expect(location.search).not.toContain("shop=");
  expect(location.search).not.toContain("product=");
  expect(location.search).toContain("tab=centres");
  act(() => {
    detailUrl();
    fireEvent.popState(window);
  });
  await screen.findByRole("heading", { name: "Repair credit", level: 1 });
  await user.click(screen.getByRole("button", { name: "Items" }));
  expect(location.search).not.toContain("shop=");
  expect(location.search).toContain("view=submissions");
  expect(location.search).toContain("tgWebAppStartParam=launch-context");
});

it("ignores late purchase results after customer session changes", async () => {
  detailUrl();
  const user = userEvent.setup();
  const props = { experience, host, onLogin: vi.fn(), onLogout: vi.fn() };
  const { rerender } = render(
    <MobileApp {...props} session={{ token: "test", loginId: "buyer" }} />,
  );
  await user.click(
    await screen.findByRole("button", { name: /Review coupon purchase/ }),
  );
  let resolve: (value: unknown) => void = () => {};
  call.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  rerender(<MobileApp {...props} session={null} />);
  await act(async () => resolve({ code: "LATE_ORDER" }));
  expect(screen.queryByText("Your coupon is ready.")).toBeNull();
  expect(screen.queryByText(/LATE_ORDER/)).toBeNull();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Sign in to continue" }),
    ).toBeVisible(),
  );
});

it("an expired wallet session requires shared sign-in and a new explicit review", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness signedIn />);
  const review = await screen.findByRole("button", {
    name: /Review coupon purchase/,
  });
  call.mockRejectedValueOnce(new ApiError("Sign in again", "ERR_AUTH_00001"));
  await user.click(review);
  await screen.findByRole("dialog", { name: "Sign in to continue" });
  expect(screen.queryByRole("button", { name: "Confirm purchase" })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Complete shared sign-in" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(
    await screen.findByRole("button", { name: /Review coupon purchase/ }),
  );
  await screen.findByRole("dialog", { name: "Review your purchase" });
  expect(commands()).toEqual([]);
});

it.each(["shop", "account"])(
  "account-session recovery respects the current %s destination",
  async (destination) => {
    detailUrl();
    const respond = call.getMockImplementation()!;
    let denied = false;
    call.mockImplementation(async (...args) => {
      if (args[0] === `${API}/account` && !denied) {
        denied = true;
        throw new ApiError(
          "Customer identity unavailable",
          "ERR_WASTE_CUSTOMER_REQUIRED",
        );
      }
      return respond(...args);
    });
    const user = userEvent.setup();
    render(<Harness signedIn />);
    await screen.findByText(/Sign in again to continue/);
    if (destination === "account")
      await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(
      screen.getByRole("button", { name: "Complete shared sign-in" }),
    );
    if (destination === "shop") {
      await screen.findByRole("heading", { name: "Repair credit", level: 1 });
      expect(
        screen.getByRole("button", { name: "Shop", current: "page" }),
      ).toBeVisible();
      expect(location.search).toContain("product=CPN_1");
    } else {
      await screen.findByRole("navigation", { name: "Dashboard shortcuts" });
      expect(
        screen.getByRole("button", { name: "Account", current: "page" }),
      ).toBeVisible();
      expect(location.search).toContain("account=overview");
      expect(location.search).not.toContain("shop=");
    }
    expect(commands()).toEqual([]);
  },
);

it("insufficient owner balance cannot open confirmation", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness signedIn />);
  const review = await screen.findByRole("button", {
    name: /Review coupon purchase/,
  });
  call.mockResolvedValueOnce({
    ...participantWallet,
    balances: [
      { programCode: "program", rewardTypeCode: "points", available: "1" },
    ],
  });
  await user.click(review);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "More points are needed",
  );
  expect(
    screen.getAllByText("More points are needed for this purchase."),
  ).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(commands()).toEqual([]);
});

it("the fresh owner wallet identifies an owned asset before opening confirmation", async () => {
  detailUrl("assets", "AST_1");
  const user = userEvent.setup();
  render(<Harness signedIn />);
  const review = await screen.findByRole("button", { name: /Review purchase/ });
  call.mockResolvedValueOnce({
    ...participantWallet,
    owner: { ownerType: "CUSTOMER", ownerCode: "seller" },
    wallet: { code: "seller-wallet", ownerCode: "seller" },
  });
  await user.click(review);
  expect(await screen.findByText("You own this bundle.")).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(commands()).toEqual([]);
});

it("listing errors reset within the host and empty results stay navigable", async () => {
  history.replaceState(
    {},
    "",
    "/telegram?shop=coupons&sort=INVALID&tgWebAppStartParam=launch-context",
  );
  call.mockRejectedValueOnce(new Error("Invalid catalogue sort"));
  const user = userEvent.setup();
  render(<Harness />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Invalid catalogue sort",
  );
  call.mockResolvedValueOnce({
    kind: "COUPON",
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
    facets: { categories: [], conditions: [], issuers: [] },
  });
  await user.click(screen.getByRole("button", { name: "Reset listing" }));
  await screen.findByRole("heading", { name: "No matching products" });
  expect(location.pathname).toBe("/telegram");
  expect(location.search).toContain("tgWebAppStartParam=launch-context");
  expect(location.search).toContain("sort=FEATURED");
  expect(commands()).toEqual([]);
});

it("native Back cannot dismiss a pending purchase or repeat its command", async () => {
  detailUrl();
  const user = userEvent.setup();
  render(<Harness signedIn />);
  await user.click(
    await screen.findByRole("button", { name: /Review coupon purchase/ }),
  );
  let resolve: (value: unknown) => void = () => {};
  call.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  act(() => back?.());
  expect(
    screen.getByRole("dialog", { name: "Review your purchase" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
  expect(commands()).toHaveLength(1);
  await act(async () =>
    resolve({
      status: "COMPLETED",
      code: (commands()[0][2] as { orderCode: string }).orderCode,
      orderCode: (commands()[0][2] as { orderCode: string }).orderCode,
      cartCode: (commands()[0][2] as { cartCode: string }).cartCode,
    }),
  );
  await screen.findByText("Your coupon is ready.");
});
