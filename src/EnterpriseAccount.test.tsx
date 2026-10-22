import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnterpriseAccount } from "./EnterpriseAccount";
import { type EnterpriseSession } from "./api";
const owners = vi.hoisted(() => ({ gifts: vi.fn(), transfer: vi.fn(), carbon: vi.fn() }));
vi.mock("./BundleGifts", () => ({ BundleGifts: (props: unknown) => { owners.gifts(props); return <p>Gift owner view</p>; } }));
vi.mock("./RewardTransfer", () => ({ RewardTransfer: (props: unknown) => { owners.transfer(props); return <p>Transfer owner view</p>; } }));
vi.mock("./CarbonHoldings", () => ({ CarbonHoldings: (props: unknown) => { owners.carbon(props); return <p>Carbon owner view</p>; } }));
const session: EnterpriseSession = { kind: "ENTERPRISE", token: "employee", loginId: "staff", enterpriseCode: "company" };
const reply = (data: unknown) => new Response(JSON.stringify({ data }));
const wallet = { owner: { ownerType: "ENTERPRISE", ownerCode: "company", actorCode: "staff" },
  wallet: { code: "wallet", ownerType: "ENTERPRISE", ownerCode: "company" },
  balances: [{ code: "balance", programCode: "governed-program", rewardTypeCode: "points", available: "123456789012345.6789", reserved: "1.0000" }],
  entries: [{ code: "entry", entryType: "CREDIT", rewardTypeCode: "points", amount: "10.0000", postedAt: "2026-10-19T10:00:00Z" }] };
const account = (path: string, owner = session) => <EnterpriseAccount session={owner} path={path} onSwitch={vi.fn()} />;
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

it("renders exact canonical wallet units under Employee bearer/Enterprise context without eWaste reads", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
    if (url === "/nodics/loyaltyApi/v0/participant/wallet") return reply(wallet);
    if (url === "/nodics/loyaltyApi/v0/participant/partner-conversions/options") return reply({
      enabled: false, owner: { ownerType: "ENTERPRISE", ownerCode: "company" }, walletCode: "wallet", options: [],
    });
    throw Error("Unexpected owner endpoint " + url);
  }); render(account("/wallet"));
  expect(await screen.findByText("123456789012345.6789")).toBeInTheDocument();
  expect(screen.getByText("governed-program")).toBeInTheDocument(); expect(screen.getByText("1.0000")).toBeInTheDocument();
  await screen.findByText("No eligible partner accounts are available.");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/nodics/loyaltyApi/v0/participant/wallet", "/nodics/loyaltyApi/v0/participant/partner-conversions/options",
  ]);
  expect(fetch).toHaveBeenNthCalledWith(1, "/nodics/loyaltyApi/v0/participant/wallet", expect.objectContaining({
    headers: { "Content-Type": "application/json", "x-enterprise-code": "company", Authorization: "Bearer employee" },
  }));
  expect(fetch).toHaveBeenNthCalledWith(2, "/nodics/loyaltyApi/v0/participant/partner-conversions/options", expect.objectContaining({
    method: "POST", body: "{}",
    headers: { "Content-Type": "application/json", "x-enterprise-code": "company", Authorization: "Bearer employee" },
  }));
  expect(owners.transfer).toHaveBeenCalledWith({ session });
});
it("shows unprovisioned wallet without synthetic zeroes or transfer commands", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ ...wallet, wallet: null, balances: [], entries: [] })); render(account("/wallet"));
  expect(await screen.findByText("No Enterprise wallet has been provisioned.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument(); expect(owners.transfer).not.toHaveBeenCalled();
});
it.each([{ ...wallet, owner: { ownerType: "USER", ownerCode: "staff" } },
  { ...wallet, wallet: { ...wallet.wallet, ownerCode: "other" } }, { ...wallet, wallet: null },
  { ...wallet, balances: [{ ...wallet.balances[0], available: 12 }] }])("refuses invalid wallet owner/value evidence %#", async value => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(value)); render(account("/wallet"));
  expect(await screen.findByRole("alert")).toHaveTextContent("wallet is unavailable"); expect(owners.transfer).not.toHaveBeenCalled();
});
it("clears old owner records before a new session resolves and ignores the late old response", async () => {
  let resolve!: (value: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce(reply({ owner: { ownerType: "ENTERPRISE", ownerCode: "next" }, wallet: null, balances: [], entries: [] }));
  const view = render(account("/wallet")); view.rerender(account("/wallet", { ...session, token: "next-token", enterpriseCode: "next" }));
  await screen.findByText("No Enterprise wallet has been provisioned.");
  await act(async () => resolve(reply(wallet)));
  expect(screen.queryByText("123456789012345.6789")).not.toBeInTheDocument();
});
it("passes typed Enterprise ownership to shared gifts and unchanged Employee session to carbon", () => {
  const fetch = vi.spyOn(globalThis, "fetch"); const view = render(account("/account/gifts"));
  expect(owners.gifts).toHaveBeenCalledWith({ session, ownerRef: { module: "profile", schema: "enterprise", code: "company" } });
  view.rerender(account("/account/carbon")); expect(owners.carbon).toHaveBeenCalledWith({ session }); expect(fetch).not.toHaveBeenCalled();
});
it("does not mount personal account sections or make a personal fallback request", () => {
  const fetch = vi.spyOn(globalThis, "fetch"); render(account("/account/items"));
  expect(screen.getByText("This section is unavailable in an Enterprise session.")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
it("renders canonical Bidding account projection without querying personal eWaste bid history", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ bids: [{ code: "bid", productCode: "asset-product", amount: "21.40", currency: "POINT", status: "PENDING" }] }));
  render(account("/account/bids")); await screen.findByText("21.40 POINT");
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/nodics/bidding/v0/bids", expect.anything());
});
const entitlement = { code: "entitlement", productCode: "product", orderCode: "order", status: "ACTIVE", claimStatus: "UNCLAIMED",
  digitalDeliveryType: "COUPON_CODE", providerCode: "coupon", enterpriseCode: "merchant", participantEnterpriseCode: "company", ownerId: "company", ownerRef: { type: "ENTERPRISE", code: "company" },
  purchasedAt: "2026-10-19T10:00:00Z" };
it.each(["/account/entitlements", "/account/purchases"])("reuses shared history and real Digital reveal at %s, retaining buyer Employee proof across merchant namespace", async path => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
    if (url === "/nodics/order/v0/orders?limit=100") return reply([{ code: "order", totalAmount: "10.00", currency: "POINT", created: entitlement.purchasedAt, status: "COMPLETED",
      enterpriseCode: "merchant", evidence: { ownerRef: { module: "profile", schema: "enterprise", code: "company" } } }]);
    if (url === "/nodics/digitalCore/v0/entitlements") return reply({ entitlements: [entitlement] });
    if (url === "/nodics/digitalCore/v0/entitlements/entitlement/reveal") return reply({ status: "REVEALED", couponCode: "coupon", token: "secret-coupon-code" });
    throw Error("Unexpected owner endpoint " + url);
  });
  render(account(path)); await screen.findByText("product");
  expect(screen.queryByRole("button", { name: "Request order review" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show coupon code" }));
  await screen.findByText("secret-coupon-code");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/nodics/order/v0/orders?limit=100", "/nodics/digitalCore/v0/entitlements", "/nodics/digitalCore/v0/entitlements/entitlement/reveal"]);
  expect(fetch.mock.calls.every(([, options]) => (options?.headers as Record<string, string>).Authorization === "Bearer employee" &&
    (options?.headers as Record<string, string>)["x-enterprise-code"] === "company")).toBe(true);
  expect(fetch.mock.calls[2][1]?.body).toBe(JSON.stringify({ confirmed: true }));
});
it.each([undefined, { type: "CUSTOMER", code: "company" }, { type: "ENTERPRISE", code: "other" }])("refuses ambiguous or wrong typed buyer even when merchant namespace matches the session: %j", async ownerRef => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async url => reply(String(url).includes("/orders?") ? [] :
    { entitlements: [{ ...entitlement, enterpriseCode: "company", ownerRef }] }));
  render(account("/account/entitlements"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enterprise purchase ownership could not be confirmed");
  expect(screen.queryByRole("button", { name: "Show coupon code" })).not.toBeInTheDocument();
  expect(screen.queryByText("product")).not.toBeInTheDocument();
});
it.each([{ participantEnterpriseCode: "merchant" }, { participantEnterpriseCode: undefined }, { ownerId: "staff" }])(
  "refuses contradictory retained participant fields despite matching typed owner: %j", async patch => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async url => reply(String(url).includes("/orders?") ? [] :
      { entitlements: [{ ...entitlement, ...patch }] }));
    render(account("/account/entitlements"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enterprise purchase ownership could not be confirmed");
    expect(screen.queryByRole("button", { name: "Show coupon code" })).not.toBeInTheDocument();
  });
it("denied commerce scope is unavailable, not an empty list or another identity", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "ERR_AUTH_00003" }), { status: 403 }));
  render(account("/account/entitlements")); await screen.findByRole("alert");
  expect(screen.queryByText("Your completed purchases will appear here.")).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledTimes(2);
});
it("offers only accepted membership choices and requires explicit review before switching", async () => {
  const accepted = { code: "assignment", revision: 3, enterpriseCode: "two", enterpriseName: "Two" };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ contractVersion: 1, owner: "profile", renderer: "axis.enterprise-memberships", enterpriseCode: "company", items: [
    { ...accepted, accepted: true, status: "REGISTERED", actions: ["SWITCH"] },
    { ...accepted, code: "pending", enterpriseCode: "three", enterpriseName: "Three", accepted: false, status: "PENDING", actions: ["ACCEPT"] },
  ] }));
  const onSwitch = vi.fn(); render(<EnterpriseAccount session={session} path="/account" onSwitch={onSwitch} />);
  await screen.findByRole("option", { name: "Two (two)" }); expect(screen.queryByRole("option", { name: "Three (three)" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Switch Enterprise"), { target: { value: "assignment" } });
  fireEvent.click(screen.getByRole("button", { name: "Switch" })); expect(onSwitch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm switch" }));
  await waitFor(() => expect(onSwitch).toHaveBeenCalledExactlyOnceWith(accepted));
});
