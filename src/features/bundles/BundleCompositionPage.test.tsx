import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AccountSectionPage,
  accountSections,
  readAccountSection,
  accountHref,
} from "../../AccountSections";
import { EnterpriseAccount } from "../../EnterpriseAccount";
import { request, commandKey, type EnterpriseSession } from "../../api";
import { BundleCompositionPage } from "./BundleCompositionPage";
import { readCompositionContext, type ManifestCommand } from "./bundleClient";
import {
  certificatePage,
  giftReceipt,
  listingContext,
  manifestReceipt,
  ownerRef,
  publishedReceipt,
  session,
} from "./bundleFixtures";
vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  request: vi.fn(),
  commandKey: vi.fn(),
}));
const endpoint = "/nodics/digitalCore/v0/bundles/composition-context";
let context: {
  contractVersion: number;
  ownerRef: typeof ownerRef;
  listings: { state: string; items: Record<string, unknown>[] };
};
let serial = 0;
beforeEach(() => {
  sessionStorage.clear();
  serial = 0;
  context = {
    contractVersion: 1,
    ownerRef,
    listings: {
      state: "AVAILABLE",
      items: [
        {
          ...listingContext,
          code: "binding",
          revision: 3,
          name: "Governed destination",
        },
      ],
    },
  };
  vi.mocked(commandKey).mockImplementation(() => "reviewed-" + ++serial);
  vi.mocked(request).mockImplementation(async (path, _session, body) => {
    if (path === endpoint) return structuredClone(context);
    if (path.endsWith("/holdings/certificates"))
      return { ...certificatePage, ownerRef: context.ownerRef };
    if (path.endsWith("/participants/search"))
      return {
        contractVersion: 1,
        items: [
          {
            ownerType: "CUSTOMER",
            ownerCode: "recipient-one",
            displayName: "Alex",
          },
        ],
      };
    if (path.endsWith("/bundles"))
      return manifestReceipt(body as ManifestCommand);
    if (path.endsWith("/gifts"))
      return {
        ...giftReceipt(body as Record<string, unknown>),
        ownerRef: context.ownerRef,
      };
    if (path.endsWith("/bundle-listings"))
      return publishedReceipt(body as Record<string, unknown>);
    throw Error("Unexpected request " + path);
  });
});
afterEach(() => vi.resetAllMocks());
const writes = () =>
  vi
    .mocked(request)
    .mock.calls.filter((call) =>
      ["/bundles", "/gifts", "/bundle-listings"].some((path) =>
        call[0].endsWith(path),
      ),
    );
it("mounts the Customer account composer with actual context and without eWaste account or marketplace reads", async () => {
  render(<AccountSectionPage section="bundles" session={session} />);
  expect(await screen.findByLabelText("Listing destination")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Fixed price" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Gift" })).toBeEnabled();
  expect(request).toHaveBeenCalledWith(
    endpoint,
    session,
    {},
    "POST",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(
    vi
      .mocked(request)
      .mock.calls.every((call) =>
        [endpoint, "/nodics/digitalCore/v0/holdings/certificates"].includes(
          call[0],
        ),
      ),
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});

it("preselects an eligible certificate and offer mode from an asset handoff", async () => {
  render(
    <BundleCompositionPage
      session={session}
      initialCertificateCode="certificate-one"
      initialMode="FIXED"
    />,
  );
  await userEvent
    .setup()
    .selectOptions(await screen.findByLabelText("Listing destination"), "binding");
  expect(
    await screen.findByRole("checkbox", { name: /certificate-one/ }),
  ).toBeChecked();
  expect(screen.getByRole("button", { name: "Fixed price" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
it("mounts Enterprise composition without modifying Employee bearer, owner or coupon navigation", async () => {
  const enterprise: EnterpriseSession = {
    kind: "ENTERPRISE",
    token: "employee",
    loginId: "actor",
    enterpriseCode: "company",
  };
  context.ownerRef = {
    module: "profile",
    schema: "enterprise",
    code: "company",
  };
  render(
    <EnterpriseAccount
      session={enterprise}
      path="/account/bundles"
      onSwitch={vi.fn()}
    />,
  );
  await screen.findByLabelText("Listing destination");
  expect(screen.getByRole("link", { name: "Entitlements" })).toHaveAttribute(
    "href",
    "/account/entitlements",
  );
  expect(screen.getByRole("link", { name: "Create bundle" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    vi.mocked(request).mock.calls.every((call) => call[1] === enterprise),
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});
it("exposes desktop and mobile navigation without losing mobile host launch parameters", () => {
  expect(accountSections.some((section) => section.code === "bundles")).toBe(
    true,
  );
  expect(
    readAccountSection(false, new URL("https://test/account/bundles")),
  ).toBe("bundles");
  expect(
    readAccountSection(true, new URL("https://test/mobile?account=bundles")),
  ).toBe("bundles");
  window.history.replaceState({}, "", "/mobile?host=telegram&account=overview");
  expect(accountHref("bundles", true)).toBe(
    "/mobile?host=telegram&account=bundles",
  );
  window.history.replaceState({}, "", "/");
});
it.each(["FIXED", "AUCTION"] as const)(
  "uses the selected backend combination in a reviewed %s command and locks selection",
  async (mode) => {
    const user = userEvent.setup();
    render(<BundleCompositionPage session={session} />);
    await user.selectOptions(
      await screen.findByLabelText("Listing destination"),
      "binding",
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /certificate-one/ }),
    );
    await user.click(
      screen.getByRole("button", {
        name: mode === "FIXED" ? "Fixed price" : "Auction",
      }),
    );
    await user.type(screen.getByLabelText("Bundle name"), "Reviewed bundle");
    await user.type(
      screen.getByLabelText(
        mode === "FIXED" ? "Price" : "Price (minimum bid)",
        { exact: true },
      ),
      "12.30",
    );
    fireEvent.change(screen.getByLabelText("Starts at"), {
      target: { value: "2030-05-03T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Ends at"), {
      target: { value: "2030-05-04T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Review bundle" }));
    expect(screen.getByLabelText("Listing destination")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Refresh bundle destinations" }),
    ).toBeDisabled();
    expect(writes()).toHaveLength(0);
    expect(screen.getByText("Destination: Governed destination")).toBeVisible();
    for (const value of [
      listingContext.storeCode,
      listingContext.priceBookCode,
      ...listingContext.categoryCodes,
      listingContext.reward.programCode,
      listingContext.reward.rewardTypeCode,
      "Pricebook",
      "Categories",
      "Reward program",
      "revision 3",
    ]) {
      expect(document.body.textContent).not.toContain(value);
    }
    await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
    await screen.findByText("Bundle published");
    expect(writes()[1]?.[2]).toEqual(
      expect.objectContaining({
        ...listingContext,
        saleMode: mode,
        amount: "12.30",
        startsAt: new Date("2030-05-03T10:00").toISOString(),
        endsAt: new Date("2030-05-04T10:00").toISOString(),
      }),
    );
  },
);
it.each(["DISABLED", "UNAVAILABLE"])(
  "keeps Gift reachable through the account when listing state is %s",
  async (state) => {
    context.listings = { state, items: [] };
    const user = userEvent.setup();
    render(<AccountSectionPage section="bundles" session={session} />);
    await user.click(
      await screen.findByRole("checkbox", { name: /certificate-one/ }),
    );
    expect(screen.getByRole("button", { name: "Fixed price" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Gift" }));
    await user.type(screen.getByLabelText("Find recipient"), "Alex");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("radio", { name: /Alex/ }));
    await user.click(screen.getByRole("button", { name: "Review bundle" }));
    await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
    await screen.findByText("Gift awaiting acceptance");
    expect(writes().map((call) => call[0])).toEqual([
      "/nodics/digitalCore/v0/bundles",
      "/nodics/digitalCore/v0/gifts",
    ]);
  },
);
it("keeps a failed publication locked to its original context and does not retry automatically", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((...args) =>
    args[0].endsWith("/bundle-listings")
      ? Promise.reject(Error("Outcome unknown"))
      : original(...args),
  );
  const user = userEvent.setup();
  render(<BundleCompositionPage session={session} />);
  await user.selectOptions(
    await screen.findByLabelText("Listing destination"),
    "binding",
  );
  await user.click(
    await screen.findByRole("checkbox", { name: /certificate-one/ }),
  );
  await user.click(screen.getByRole("button", { name: "Fixed price" }));
  await user.type(screen.getByLabelText("Bundle name"), "Bundle");
  await user.type(screen.getByLabelText("Price", { exact: true }), "1");
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Outcome unknown");
  expect(screen.getByLabelText("Listing destination")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Refresh bundle destinations" }),
  ).toBeDisabled();
  expect(writes()).toHaveLength(2);
});
it("rejects denied context instead of falling back to an inferred customer owner", async () => {
  vi.mocked(request).mockRejectedValue(Error("Denied"));
  render(<BundleCompositionPage session={session} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "owner access could not be confirmed",
  );
  expect(
    screen.queryByRole("button", { name: "Gift" }),
  ).not.toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
it("retires late context responses when the represented session changes", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<BundleCompositionPage session={session} />);
  const previous = structuredClone(context);
  context.ownerRef = { module: "profile", schema: "enterprise", code: "next" };
  context.listings = { state: "DISABLED", items: [] };
  view.rerender(
    <BundleCompositionPage
      session={{
        kind: "ENTERPRISE",
        token: "new",
        loginId: "staff",
        enterpriseCode: "next",
      }}
    />,
  );
  await screen.findByText("Listings are unavailable.");
  await act(async () => finish(previous));
  expect(
    screen.queryByLabelText("Listing destination"),
  ).not.toBeInTheDocument();
});
it.each([
  (row: typeof context) => {
    row.contractVersion = 2;
  },
  (row: typeof context) => {
    row.listings.items.push({ ...row.listings.items[0] });
  },
  (row: typeof context) => {
    row.listings.state = "DISABLED";
  },
  (row: typeof context) => {
    delete (row.listings.items[0]!.reward as Record<string, unknown>).scale;
  },
])(
  "refuses malformed or contradictory context projection %#",
  async (mutate) => {
    mutate(context);
    await expect(readCompositionContext(session)).rejects.toThrow();
  },
);
