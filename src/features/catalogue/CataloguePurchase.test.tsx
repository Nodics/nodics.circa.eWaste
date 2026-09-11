import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionPage } from "../../CircaApp";
import { request, type Offer, type Wallet } from "../../api";
vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  request: vi.fn(),
}));
vi.mock("../../CollectionMap", () => ({ CollectionMap: () => null }));
const offer: Offer = {
  code: "CPN_1",
  kind: "COUPON",
  name: "Repair credit",
  rewardPrice: 10,
  revision: "v7",
  available: true,
};
const wallet: Wallet = {
  wallet: { code: "wallet", ownerCode: "buyer" },
  balances: [{ rewardTypeCode: "points", available: "100", reserved: "0" }],
  entries: [],
};
const call = vi.mocked(request);
beforeEach(() => {
  call.mockReset();
  call.mockResolvedValue(wallet);
});
afterEach(cleanup);
function view(value = offer) {
  const complete = vi.fn();
  render(
    <TransactionPage
      offer={value}
      wallet={wallet}
      session={{ token: "test", loginId: "buyer" }}
      onLogin={vi.fn()}
      onComplete={complete}
    />,
  );
  return complete;
}
it("opening and cancelling purchase review never sends a transaction", async () => {
  const user = userEvent.setup();
  view();
  await user.click(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  );
  const dialog = screen.getByRole("dialog", { name: "Review your purchase" });
  expect(within(dialog).getByText("90 points")).toBeVisible();
  expect(call).toHaveBeenCalledWith(
    "/nodics/eWaste/v0/wallet",
    expect.anything(),
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Close dialog" }),
  );
  expect(call).toHaveBeenCalledTimes(1);
});
it("only explicit confirmation submits the reviewed revision; retries reuse the idempotency key", async () => {
  const user = userEvent.setup();
  const complete = view();
  call
    .mockResolvedValueOnce(wallet)
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockResolvedValueOnce({ code: "ORDER_1", entitlementCode: "ENT_1" });
  await user.click(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  );
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  const dialog = screen.getByRole("dialog");
  await within(dialog).findByText("Temporary failure");
  await user.click(
    within(dialog).getByRole("button", { name: "Confirm purchase" }),
  );
  await screen.findByText("Your coupon is ready.");
  expect(complete).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[1][0]).toBe(
    "/nodics/eWaste/v0/marketplace/CPN_1/purchase",
  );
  expect(call.mock.calls[1][2]).toMatchObject({
    confirmed: true,
    expectedRevision: "v7",
  });
  expect(call.mock.calls[2][2]).toEqual(call.mock.calls[1][2]);
});
it("unavailable products cannot open purchase review", () => {
  view({ ...offer, available: false });
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeDisabled();
  expect(call).not.toHaveBeenCalled();
});
it("asset owners are identified without treating a coupon with no owner as owned", () => {
  view({ ...offer, kind: "ASSET", ownerCode: "buyer" });
  expect(screen.getByText("You own this asset.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Review purchase/ })).toBeNull();
});

it("purchase review refreshes a stale wallet before displaying the remaining balance", async () => {
  const user = userEvent.setup();
  call.mockResolvedValueOnce({
    ...wallet,
    balances: [{ rewardTypeCode: "points", available: "125", reserved: "0" }],
  });
  view();
  await user.click(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  );
  expect(await screen.findByText("115 points")).toBeVisible();
  expect(call).toHaveBeenCalledTimes(1);
});
it("failed balance refresh cannot open a purchase confirmation", async () => {
  const user = userEvent.setup();
  call.mockRejectedValueOnce(new Error("Wallet unavailable"));
  view();
  await user.click(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  );
  expect(await screen.findByText("Wallet unavailable")).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});
