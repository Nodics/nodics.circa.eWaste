/** Independent customer history fixtures; no live purchase, redemption or wallet mutation. */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PurchaseHistory } from "./PurchaseHistory";
import { AccountSectionPage } from "./AccountSections";
import { request } from "./api";
vi.mock("./api", () => ({ request: vi.fn() }));
vi.mock("./OrderReview", () => ({ OrderReview: () => null }));
const session = { token: "fixture-token", loginId: "fixture@example.test" };
const owned = {
  orders: [],
  entitlements: [
    {
      code: "owned",
      productCode: "offer",
      orderCode: "order",
      status: "ACTIVE",
      digitalDeliveryType: "COUPON_CODE",
      providerCode: "provider-coupon",
      claimStatus: "CLAIMED",
      purchasedAt: "2026-09-01T09:00:00Z",
    },
  ],
};
afterEach(() => vi.resetAllMocks());
function history(value: { orders: unknown[]; entitlements: unknown[] }) {
  vi.mocked(request).mockResolvedValueOnce(value.orders).mockResolvedValueOnce({ entitlements: value.entitlements });
}
it("personal account history renders common purchase keys without eWaste catalogue or legacy history", async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === "/nodics/order/v0/orders?limit=100") return [{
      code: "purchase-current", totalAmount: "10.00", currency: "POINTS",
      status: "COMPLETED", created: "2026-10-20T00:00:00Z",
    }];
    if (path === "/nodics/digitalCore/v0/entitlements") return { entitlements: [] };
    throw Error("eWaste catalogue unavailable");
  });
  render(<AccountSectionPage section="purchases" session={session} />);
  await screen.findByText("purchase-current");
  expect(vi.mocked(request).mock.calls.map(([path]) => path)).toEqual([
    "/nodics/order/v0/orders?limit=100", "/nodics/digitalCore/v0/entitlements",
  ]);
});
it("refreshes authoritative redemption evidence without another purchase or debit", async () => {
  history(owned);
  history({
      ...owned,
      entitlements: [
        {
          ...owned.entitlements[0],
          status: "REDEEMED",
          claimStatus: "REDEEMED",
          evidence: {
            merchantRedemption: {
              merchantCode: "merchant",
              merchantReceiptReference: "receipt-1",
              storeRef: {
                moduleName: "store",
                schemaName: "store",
                code: "outlet-1",
              },
              storeRevision: 3,
              confirmedAt: "2026-09-30T08:00:00Z",
            },
          },
        },
      ],
    });
  const user = userEvent.setup();
  render(<PurchaseHistory session={session} offers={[]} />);
  await screen.findByText(/Awaiting merchant fulfillment/);
  await user.click(screen.getByRole("button", { name: "Refresh purchases" }));
  await screen.findByText("receipt-1");
  expect(screen.getByText("Merchant: merchant")).toBeVisible();
  expect(screen.getByText("Outlet: outlet-1")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Show coupon code" })).toBeNull();
  expect(document.querySelector("time")?.getAttribute("datetime")).toBe(
    "2026-09-30T08:00:00Z",
  );
  expect(
    vi
      .mocked(request)
      .mock.calls.every(
        (call) =>
          ["/nodics/order/v0/orders?limit=100", "/nodics/digitalCore/v0/entitlements"].includes(call[0]) &&
          call[2] === undefined &&
          call[3] === "GET",
      ),
  ).toBe(true);
});
it("does not display one customer's history in another session", async () => {
  history(owned);
  vi.mocked(request).mockImplementation(() => new Promise(() => {}));
  const view = render(<PurchaseHistory session={session} offers={[]} />);
  await screen.findByText("offer");
  view.rerender(
    <PurchaseHistory
      session={{ token: "other-fixture", loginId: "other@example.test" }}
      offers={[]}
    />,
  );
  await waitFor(() => expect(screen.queryByText("offer")).toBeNull());
});
it("rejects malformed history without exposing coupon actions", async () => {
  history({
    ...owned,
    entitlements: [{ ...owned.entitlements[0], purchaseTerms: "not-an-array" }],
  });
  render(<PurchaseHistory session={session} offers={[]} />);
  await screen.findByText(/Purchase history could not be confirmed/);
  expect(screen.queryByRole("button", { name: "Show coupon code" })).toBeNull();
});
it("shows expired purchase validity without permitting token reveal", async () => {
  history({
    ...owned,
    entitlements: [
      { ...owned.entitlements[0], validTo: "2000-01-01T00:00:00Z" },
    ],
  });
  render(<PurchaseHistory session={session} offers={[]} />);
  await screen.findByText(/Expired 01\/01\/2000/);
  expect(screen.queryByRole("button", { name: "Show coupon code" })).toBeNull();
});
it("does not accept an acknowledgement or deferred response as a revealed token", async () => {
  history(owned);
  vi.mocked(request).mockResolvedValueOnce({
    status: "REVEAL_DEFERRED",
    token: "not-authorized",
  });
  const user = userEvent.setup();
  render(<PurchaseHistory session={session} offers={[]} />);
  await user.click(
    await screen.findByRole("button", { name: "Show coupon code" }),
  );
  await screen.findByText(/coupon code is not available yet/);
  expect(screen.queryByText("not-authorized")).toBeNull();
  expect(vi.mocked(request)).toHaveBeenCalledTimes(3);
  expect(vi.mocked(request).mock.calls[2].slice(0, 3)).toEqual([
    "/nodics/digitalCore/v0/entitlements/owned/reveal", session, { confirmed: true },
  ]);
});
it("does not offer coupon reveal for a non-coupon entitlement", async () => {
  history({ ...owned, entitlements: [{ ...owned.entitlements[0], digitalDeliveryType: "DIGITAL_FILE" }] });
  render(<PurchaseHistory session={session} offers={[]} />); await screen.findByText("offer");
  expect(screen.queryByRole("button", { name: "Show coupon code" })).not.toBeInTheDocument();
});
it("failed owner refresh marks retained history stale and removes reveal controls", async () => {
  history(owned);
  const user = userEvent.setup(); render(<PurchaseHistory session={session} offers={[]} />);
  await screen.findByRole("button", { name: "Show coupon code" });
  vi.mocked(request).mockRejectedValueOnce(Error("Scope unavailable")).mockResolvedValueOnce({ entitlements: owned.entitlements });
  await user.click(screen.getByRole("button", { name: "Refresh purchases" }));
  await screen.findByText("Scope unavailable");
  expect(screen.getByText(/Displayed history may be out of date/)).toHaveAttribute("role", "status");
  expect(screen.queryByRole("button", { name: "Show coupon code" })).not.toBeInTheDocument();
});
it("Enterprise switch ignores a late token and never carries it to the next owner", async () => {
  const enterprise = { ...session, kind: "ENTERPRISE" as const, enterpriseCode: "buyer" };
  history({ ...owned, entitlements: [{ ...owned.entitlements[0], ownerRef: { type: "ENTERPRISE", code: "buyer" },
    ownerId: "buyer", participantEnterpriseCode: "buyer" }] });
  let complete!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const user = userEvent.setup(), view = render(<PurchaseHistory session={enterprise} offers={[]} />);
  await user.click(await screen.findByRole("button", { name: "Show coupon code" }));
  history({ orders: [], entitlements: [] });
  view.rerender(<PurchaseHistory session={{ ...enterprise, enterpriseCode: "next", token: "next-token" }} offers={[]} />);
  await screen.findByText("Your completed purchases will appear here.");
  await act(async () => complete({ status: "REVEALED", couponCode: "provider-coupon", token: "old-owner-secret" }));
  expect(screen.queryByText("old-owner-secret")).not.toBeInTheDocument();
  expect(vi.mocked(request).mock.calls.some(([url]) => url.includes("/eWaste/"))).toBe(false);
});
it.each([
  { couponCode: "different-coupon", token: "wrong-secret" },
  { token: "unbound-secret" },
  { couponCode: "provider-coupon", token: "contradictory-secret", tokenAvailable: false },
  { couponCode: "provider-coupon", couponToken: "legacy-alias-secret" },
])("rejects unbound, contradictory or noncanonical reveal evidence: %j", async outcome => {
  history(owned); vi.mocked(request).mockResolvedValueOnce({ status: "REVEALED", ...outcome });
  const user = userEvent.setup(); render(<PurchaseHistory session={session} offers={[]} />);
  await user.click(await screen.findByRole("button", { name: "Show coupon code" }));
  await screen.findByText(/coupon code is not available yet/);
  expect(document.querySelector(".coupon-token")).toBeNull();
});
