import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CircaApp, Login, TransactionPage } from "./CircaApp";
import { readSession, saveSession, type EnterpriseSession, type Offer } from "./api";
vi.mock("./CollectionMap", () => ({ CollectionMap: () => <div>Map</div> }));
vi.mock("./cms", async importOriginal => ({ ...await importOriginal<typeof import("./cms")>(), usePublishedPage: () => ({ page: null, error: "" }) }));
const session: EnterpriseSession = { kind: "ENTERPRISE", enterpriseCode: "company", token: "employee-access", loginId: "staff" };
const response = (data: unknown) => new Response(JSON.stringify({ data }));
let calls: { path: string; options?: RequestInit }[];
beforeEach(() => {
  saveSession(null); sessionStorage.clear(); calls = []; history.replaceState({}, "", "/wallet");
  document.cookie = "nodics_axis_csrf=employee-csrf; path=/";
  document.cookie = "nodics_customer_csrf=; max-age=0; path=/";
  vi.stubGlobal("scrollTo", vi.fn());
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const path = String(url); calls.push({ path, options });
    if (path.endsWith("/employee/browser/restore") || path.endsWith("/employee/browser/authenticate"))
      return response({ authToken: session.token, loginId: session.loginId });
    if (path.endsWith("/identity/scopes/me")) return response({ principalCode: "staff", principalType: "human", scopes: [], deniedScopes: [] });
    if (path.endsWith("/employee/browser/logout")) return response({ signedOut: true });
    if (path.endsWith("/experience")) return response({ presentation: {}, centres: [], categories: [], itemTypes: [] });
    if (path.endsWith("/marketplace")) return response({ assets: [], coupons: [] });
    if (path === "/nodics/loyaltyApi/v0/participant/wallet") return response({ owner: { ownerType: "ENTERPRISE", ownerCode: "company" }, wallet: null, balances: [], entries: [] });
    if (path.endsWith("/enterprise-memberships/workspace")) return response({ contractVersion: 1, owner: "profile", renderer: "axis.enterprise-memberships", enterpriseCode: "company", items: [] });
    throw Error("Unexpected test request: " + path);
  });
});
afterEach(() => { saveSession(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["/wallet", "/account/wallet"]) ("routes %s to canonical Enterprise wallet without customer account/inbox/submission requests", async path => {
  history.replaceState({}, "", path); saveSession(session); render(<CircaApp />);
  await screen.findByText("No Enterprise wallet has been provisioned.");
  await waitFor(() => expect(calls.some(call => call.path.endsWith("/identity/scopes/me"))).toBe(true));
  expect(screen.getByRole("navigation", { name: "Enterprise account navigation" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit eWaste" })).not.toBeInTheDocument();
  expect(calls.filter(call => call.path.startsWith("/nodics/eWaste/")).map(call => call.path)).toEqual(["/nodics/eWaste/v0/experience"]);
  expect(calls.some(call => call.path.includes("/customer/") || call.path.includes("/inbox"))).toBe(false);
  expect(calls.filter(call => call.path.includes("/participant/wallet")).every(call =>
    (call.options?.headers as Record<string, string>).Authorization === "Bearer employee-access")).toBe(true);
});
it("removes owner view at logout and calls Employee logout, not Customer logout", async () => {
  saveSession(session); render(<CircaApp />); await screen.findByText("No Enterprise wallet has been provisioned.");
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("button", { name: "Sign in or register" });
  expect(screen.queryByRole("navigation", { name: "Enterprise account navigation" })).not.toBeInTheDocument();
  expect(readSession()).toBeNull(); expect(calls.some(call => call.path.endsWith("/employee/browser/logout"))).toBe(true);
  expect(calls.some(call => call.path.endsWith("/customer/browser/logout"))).toBe(false);
});
it("keeps personal Employee participation separate from Enterprise sign-in", async () => {
  const onLogin = vi.fn(); render(<Login onLogin={onLogin} onClose={vi.fn()} sample={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Use employee account" }));
  expect(screen.queryByLabelText("Enterprise code")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Enterprise" }));
  expect(screen.getByLabelText("Enterprise code")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Enterprise code"), { target: { value: "company" } });
  fireEvent.change(screen.getByLabelText("Employee login"), { target: { value: "staff" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.submit(screen.getByRole("form", { name: "Enterprise sign in" }));
  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(session));
  expect(calls.map(call => call.path)).toEqual(["/nodics/profile/v0/employee/browser/authenticate", "/nodics/profile/v0/identity/scopes/me"]);
});
it("requires a governed Commerce binding before Enterprise checkout without a personal fallback", () => {
  const offer: Offer = { code: "offer", name: "Item", rewardPrice: 10, kind: "ASSET", revision: 1 };
  render(<TransactionPage offer={offer} session={session} wallet={null} onLogin={vi.fn()} onComplete={vi.fn()} />);
  expect(screen.getByText("This offer is not ready for checkout.")).toBeInTheDocument();
  const review = screen.getByRole("button", { name: "Review purchase" });
  expect(review).toBeDisabled(); fireEvent.click(review); expect(calls).toHaveLength(0);
});
it("Enterprise Commerce preparation retains its Employee bearer and current Enterprise rather than using eWaste wallet", async () => {
  const offer: Offer = { code: "product", name: "Bundle", rewardPrice: "10.00", kind: "ASSET", revision: 1,
    commerce: { storeCode: "catalogue-store", currency: "POINT", jurisdiction: "AE", locale: "en",
      programCode: "catalogue-program", rewardTypeCode: "catalogue-points", variantCode: "catalogue-variant" } };
  render(<TransactionPage offer={offer} session={session} wallet={null} onLogin={vi.fn()} onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Review purchase" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No reward wallet is available");
  expect(calls.map(call => call.path)).toEqual(["/nodics/loyaltyApi/v0/participant/wallet"]);
  expect(calls[0].options?.headers).toMatchObject({ Authorization: "Bearer employee-access", "x-enterprise-code": "company" });
});
it("unknown personal account deep links stay inside the Enterprise shell", async () => {
  saveSession(session); history.replaceState({}, "", "/account/items"); render(<CircaApp />);
  await screen.findByText("This section is unavailable in an Enterprise session.");
  await act(async () => { await Promise.resolve(); });
  expect(within(screen.getByRole("main")).queryByText("Your items")).not.toBeInTheDocument();
  expect(calls.some(call => call.path.includes("/account/items"))).toBe(false);
});
