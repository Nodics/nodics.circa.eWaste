import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PartnerRewardConversion } from "./PartnerRewardConversion";
import { request, type Session } from "./api";
import { pendingReferenceKey } from "./pendingReferences";
vi.mock("./api", () => ({ request: vi.fn(), commandKey: () => "quote-key" }));
const call = vi.mocked(request),
  base = "/nodics/loyaltyApi/v0/participant/partner-conversions/";
const session: Session = { token: "customer-proof", loginId: "customer" };
const owner = { ownerType: "CUSTOMER", ownerCode: "customer" };
const route = {
  integrationCode: "integration",
  partnerEnterpriseCode: "partner",
  accountLinkCode: "verified-link",
  programCode: "program",
  rewardTypeCode: "points",
  sourceScale: 2,
  termsReference: "terms",
  termsRevision: "1",
};
const choices = {
  enabled: true,
  owner,
  walletCode: "wallet",
  options: [route],
};
const quote = {
  ...route,
  owner,
  conversionCode: "conversion",
  walletCode: "wallet",
  status: "QUOTED",
  sourceAmount: "10.00",
  targetAmount: "22.50",
  targetScale: 2,
  targetUnit: "partner-rewards",
  quoteExpiresAt: "2099-01-01T00:00:00Z",
};
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });
const hintKey = (scope: string, who = session, owned = owner) => pendingReferenceKey(who, "partner-reward-conversion", owned, scope);
const hint = (scope: string) => JSON.parse(sessionStorage.getItem(hintKey(scope)) || "null");
async function review() {
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByLabelText("Partner account"),
    "0",
  );
  await user.type(screen.getByLabelText("Rewards"), "10");
  await user.click(screen.getByRole("button", { name: "Review conversion" }));
  await screen.findByRole("dialog");
  return user;
}
it("uses owner-calculated terms and confirms the retained quote without browser conversion arithmetic", async () => {
  call
    .mockResolvedValueOnce(choices)
    .mockResolvedValueOnce(quote)
    .mockResolvedValueOnce({ ...quote, status: "COMPLETED" });
  const complete = vi.fn();
  render(<PartnerRewardConversion session={session} onComplete={complete} />);
  const user = await review();
  expect(screen.getByText("22.50 partner-rewards")).toBeVisible();
  expect(call.mock.calls[1]).toEqual([
    base + "quote",
    session,
    {
      integrationCode: "integration",
      accountLinkCode: "verified-link",
      walletCode: "wallet",
      programCode: "program",
      rewardTypeCode: "points",
      amount: "10",
      idempotencyKey: "quote-key",
    },
  ]);
  await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
  await screen.findByText("COMPLETED");
  expect(call.mock.calls[2]).toEqual([
    base + "confirm",
    session,
    { conversionCode: "conversion" },
  ]);
  expect(complete).toHaveBeenCalledTimes(1);
});
it("uncertain confirmation reconciles the original reference rather than confirming or quoting again", async () => {
  call
    .mockResolvedValueOnce(choices)
    .mockResolvedValueOnce(quote)
    .mockRejectedValueOnce(new Error("Outcome unknown"))
    .mockResolvedValueOnce({ ...quote, status: "COMPLETED" });
  render(<PartnerRewardConversion session={session} />);
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
  await screen.findByText("Outcome unknown");
  expect(
    screen.queryByRole("button", { name: "Confirm conversion" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check conversion" }));
  await screen.findByText("COMPLETED");
  expect(call.mock.calls.map((row) => row[0])).toEqual([
    base + "options",
    base + "quote",
    base + "confirm",
    base + "status",
  ]);
});
it("disabled new routes still allow inspection of an existing conversion", async () => {
  call
    .mockResolvedValueOnce({ ...choices, enabled: false, options: [] })
    .mockResolvedValueOnce({ ...quote, status: "SUBMITTED" });
  render(<PartnerRewardConversion session={session} />);
  await screen.findByText("No eligible partner accounts are available.");
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Conversion reference"), "conversion");
  await user.click(screen.getByRole("button", { name: "Check conversion" }));
  await screen.findByText("SUBMITTED");
  expect(screen.queryByRole("button", { name: "Close conversion" })).toBeNull();
  expect(call.mock.calls.at(-1)).toEqual([
    base + "status",
    session,
    { conversionCode: "conversion" },
  ]);
});

it("retains intent before quote and confirmation reference before dispatch, storing no credentials or external details", async () => {
  call.mockImplementation(async (url) => {
    if (url === base + "options") return choices;
    if (url === base + "quote") {
      expect(hint("quote")).toEqual({ integrationCode: route.integrationCode, accountLinkCode: route.accountLinkCode,
        walletCode: "wallet", programCode: "program", rewardTypeCode: "points", amount: "10", idempotencyKey: "quote-key" });
      return quote;
    }
    expect(url).toBe(base + "confirm");
    expect(hint("conversion")).toEqual({ conversionCode: "conversion" });
    expect(hint("confirmation")).toEqual({ conversionCode: "conversion", attempted: true });
    return { ...quote, status: "SUBMITTED" };
  });
  render(<PartnerRewardConversion session={session} />);
  const user = await review(); await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
  await screen.findByText("SUBMITTED");
  const stored = JSON.stringify(Object.values(sessionStorage));
  expect(stored).not.toContain(session.token); expect(stored).not.toContain("targetAmount");
  expect(stored).not.toContain("accountReference"); expect(stored).not.toContain("termsReference");
});

it("reload and refreshed token recover an uncertain confirmation by status only, then clear after terminal owner evidence", async () => {
  call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote).mockRejectedValueOnce(new Error("Outcome unknown"));
  const view = render(<PartnerRewardConversion session={session} />);
  const user = await review(); await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
  await screen.findByText("Outcome unknown"); view.unmount();
  let resolve!: (value: unknown) => void;
  call.mockResolvedValueOnce(choices).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const refreshed = { ...session, token: "refreshed-proof" };
  const restored = render(<PartnerRewardConversion session={refreshed} />);
  await screen.findByRole("button", { name: "Check conversion" });
  expect(screen.queryByRole("button", { name: "Review conversion" })).toBeNull();
  await act(async () => resolve({ ...quote, status: "SUBMITTED" }));
  expect(screen.queryByRole("button", { name: "Close conversion" })).toBeNull();
  expect(call.mock.calls.at(-1)).toEqual([base + "status", refreshed, { conversionCode: "conversion" }]);
  expect(hint("confirmation")).not.toBeNull();
  restored.unmount(); call.mockResolvedValueOnce({ ...choices, enabled: false, options: [], walletCode: null })
    .mockResolvedValueOnce({ ...quote, status: "COMPLETED" });
  render(<PartnerRewardConversion session={refreshed} />); await screen.findByText("COMPLETED");
  expect(sessionStorage.length).toBe(0);
  expect(call.mock.calls.filter(([url]) => url === base + "confirm")).toHaveLength(1);
  expect(call.mock.calls.filter(([url]) => url === base + "quote")).toHaveLength(1);
});

it("a lost quote response repeats the identical saved key and intent on reload without confirming", async () => {
  call.mockResolvedValueOnce(choices).mockRejectedValueOnce(new Error("Quote outcome unknown"));
  const view = render(<PartnerRewardConversion session={session} />), user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Partner account"), "0");
  await user.type(screen.getByLabelText("Rewards"), "10");
  await user.click(screen.getByRole("button", { name: "Review conversion" }));
  await screen.findByText("Quote outcome unknown");
  const intent = hint("quote"); expect(screen.queryByRole("button", { name: "Review conversion" })).toBeNull();
  view.unmount(); call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote);
  render(<PartnerRewardConversion session={session} />); await screen.findByRole("dialog");
  const quotes = call.mock.calls.filter(([url]) => url === base + "quote");
  expect(quotes).toHaveLength(2); expect(quotes[0][2]).toEqual(intent); expect(quotes[1][2]).toEqual(intent);
  expect(call.mock.calls.some(([url]) => url === base + "confirm")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Close conversion" }));
  expect(sessionStorage.length).toBe(0); expect(call.mock.calls).toHaveLength(4);
});

it.each(["HOLDING", "HELD", "SUBMITTED", "CREDIT_CONFIRMED", "NO_CREDIT_CONFIRMED"])(
  "manual recovery of %s cannot dismiss or start a new conversion and survives reload", async status => {
    call.mockResolvedValueOnce(choices).mockResolvedValueOnce({ ...quote, status });
    const view = render(<PartnerRewardConversion session={session} />), user = userEvent.setup();
    await screen.findByLabelText("Partner account");
    await user.type(screen.getByLabelText("Conversion reference"), "conversion");
    await user.click(screen.getByRole("button", { name: "Check conversion" }));
    await screen.findByText(status);
    expect(screen.queryByRole("button", { name: "Close conversion" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm conversion" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("button", { name: "Review conversion" })).toBeNull();
    view.unmount(); call.mockResolvedValueOnce(choices).mockResolvedValueOnce({ ...quote, status });
    render(<PartnerRewardConversion session={session} />); await screen.findByText(status);
    expect(call.mock.calls.at(-1)?.[0]).toBe(base + "status");
  },
);

it("an attempted confirmation still QUOTED keeps its marker and only explicitly retries the same conversion", async () => {
  call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote).mockRejectedValueOnce(new Error("Unknown"));
  const view = render(<PartnerRewardConversion session={session} />), user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm conversion" })); await screen.findByText("Unknown");
  view.unmount(); call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote).mockResolvedValueOnce({ ...quote, status: "SUBMITTED" });
  render(<PartnerRewardConversion session={session} />);
  await screen.findByRole("button", { name: "Confirm original conversion" });
  expect(screen.queryByRole("button", { name: "Close conversion" })).toBeNull();
  expect(hint("confirmation")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Confirm original conversion" })); await screen.findByText("SUBMITTED");
  const confirmations = call.mock.calls.filter(([url]) => url === base + "confirm");
  expect(confirmations).toHaveLength(2); expect(confirmations[0][2]).toEqual(confirmations[1][2]);
  expect(call.mock.calls.filter(([url]) => url === base + "quote")).toHaveLength(1);
});

it.each(["quote", "confirmation"])("storage failure before %s prevents dispatch", async scope => {
  call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote);
  render(<PartnerRewardConversion session={session} />); const user = userEvent.setup();
  if (scope === "confirmation") await review();
  else {
    await user.selectOptions(await screen.findByLabelText("Partner account"), "0");
    await user.type(screen.getByLabelText("Rewards"), "10");
  }
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === hintKey(scope)) throw Error("Storage unavailable");
    return original.call(this, key, value);
  });
  const count = call.mock.calls.length;
  await user.click(screen.getByRole("button", { name: scope === "quote" ? "Review conversion" : "Confirm conversion" }));
  await screen.findByText(/reference cannot be saved/); expect(call.mock.calls).toHaveLength(count);
});

it("another actor or typed owner cannot inherit pending conversion hints", async () => {
  call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote).mockRejectedValueOnce(new Error("Unknown"));
  const view = render(<PartnerRewardConversion session={session} />), user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm conversion" })); await screen.findByText("Unknown");
  view.unmount();
  call.mockResolvedValueOnce({ ...choices, owner: { ownerType: "CUSTOMER", ownerCode: "different-customer" } });
  const another = render(<PartnerRewardConversion session={{ ...session, token: "other", loginId: "other" }} />);
  await screen.findByLabelText("Partner account"); expect(call.mock.calls.at(-1)?.[0]).toBe(base + "options");
  expect(hint("confirmation")).not.toBeNull(); another.unmount();
  call.mockResolvedValueOnce({ ...choices, owner: { ownerType: "CUSTOMER", ownerCode: "changed-canonical-owner" } });
  render(<PartnerRewardConversion session={session} />); await screen.findByLabelText("Partner account");
  expect(call.mock.calls.at(-1)?.[0]).toBe(base + "options");
});

it("corrupt retained input fails closed without a quote, confirm or new-attempt form", async () => {
  sessionStorage.setItem(hintKey("quote"), JSON.stringify({ idempotencyKey: "original", token: "must-not-be-accepted" }));
  call.mockResolvedValueOnce(choices); render(<PartnerRewardConversion session={session} />);
  await screen.findByText(/reference cannot be read/);
  expect(call).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button", { name: "Review conversion" })).toBeNull();
});

it("late completion cannot clear a different retained operation", async () => {
  let resolve!: (value: unknown) => void;
  call.mockResolvedValueOnce(choices).mockResolvedValueOnce(quote).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<PartnerRewardConversion session={session} />); const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
  sessionStorage.setItem(hintKey("conversion"), JSON.stringify({ conversionCode: "newer" }));
  await act(async () => resolve({ ...quote, status: "COMPLETED" }));
  await screen.findByText(/Check the original operation/);
  expect(hint("conversion")).toEqual({ conversionCode: "newer" });
  expect(hint("confirmation")).not.toBeNull();
});
it("Enterprise selection and quotes retain the represented owner and unchanged employee bearer", async () => {
  const enterprise: Session = {
    token: "employee",
    loginId: "staff",
    kind: "ENTERPRISE",
    enterpriseCode: "buyer",
  };
  const enterpriseOwner = { ownerType: "ENTERPRISE", ownerCode: "buyer" };
  call
    .mockResolvedValueOnce({ ...choices, owner: enterpriseOwner })
    .mockResolvedValueOnce({ ...quote, owner: enterpriseOwner });
  render(<PartnerRewardConversion session={enterprise} />);
  await review();
  expect(call.mock.calls.every((row) => row[1] === enterprise)).toBe(true);
});
it("foreign owner choices cannot be selected", async () => {
  call.mockResolvedValueOnce({
    ...choices,
    owner: { ownerType: "ENTERPRISE", ownerCode: "other" },
  });
  render(
    <PartnerRewardConversion
      session={{
        token: "employee",
        loginId: "staff",
        kind: "ENTERPRISE",
        enterpriseCode: "buyer",
      }}
    />,
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("a changed original outcome cannot complete or change reviewed amounts", async () => {
  call
    .mockResolvedValueOnce(choices)
    .mockResolvedValueOnce(quote)
    .mockResolvedValueOnce({
      ...quote,
      targetAmount: "900.00",
      status: "COMPLETED",
    });
  const complete = vi.fn();
  render(<PartnerRewardConversion session={session} onComplete={complete} />);
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
  await screen.findByText("The original conversion could not be confirmed.");
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByText("22.50 partner-rewards")).toBeVisible();
});
it("late choices from a previous identity are discarded", async () => {
  let resolve!: (value: unknown) => void;
  call
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce({ ...choices, options: [] });
  const view = render(<PartnerRewardConversion session={session} />);
  view.rerender(
    <PartnerRewardConversion
      session={{ token: "new-proof", loginId: "customer" }}
    />,
  );
  await screen.findByText("No eligible partner accounts are available.");
  await act(async () => resolve(choices));
  expect(screen.queryByRole("combobox")).toBeNull();
});
