/** Independent customer history fixtures; no live purchase, redemption or wallet mutation. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PurchaseHistory } from "./PurchaseHistory";
import { request } from "./api";
vi.mock("./api", () => ({ API: "/nodics/eWaste/v0", request: vi.fn() }));
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
      claimStatus: "CLAIMED",
      purchasedAt: "2026-09-01T09:00:00Z",
    },
  ],
};
afterEach(() => vi.resetAllMocks());
it("refreshes authoritative redemption evidence without another purchase or debit", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(owned)
    .mockResolvedValueOnce({
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
          call[0].endsWith("/purchases") &&
          call[2] === undefined &&
          call[3] === "GET",
      ),
  ).toBe(true);
});
it("does not display one customer's history in another session", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(owned)
    .mockImplementationOnce(() => new Promise(() => {}));
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
  vi.mocked(request).mockResolvedValueOnce({
    ...owned,
    entitlements: [{ ...owned.entitlements[0], purchaseTerms: "not-an-array" }],
  });
  render(<PurchaseHistory session={session} offers={[]} />);
  await screen.findByText(/Purchase history could not be confirmed/);
  expect(screen.queryByRole("button", { name: "Show coupon code" })).toBeNull();
});
it("shows expired purchase validity without permitting token reveal", async () => {
  vi.mocked(request).mockResolvedValueOnce({
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
  vi.mocked(request).mockResolvedValueOnce(owned).mockResolvedValueOnce({
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
  expect(vi.mocked(request)).toHaveBeenCalledTimes(2);
});
