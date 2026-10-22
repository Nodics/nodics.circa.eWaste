import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateEnterpriseSession, endSession, enterpriseMemberships, enterpriseSessionHint, readSession,
  request, restoreSession, saveSession, setTelegramLaunch, switchEnterpriseSession, type EnterpriseSession } from "./api";

const current: EnterpriseSession = { kind: "ENTERPRISE", token: "employee-access", loginId: "staff@example.test", enterpriseCode: "enterprise-one" };
const choice = { code: "membership-two", revision: 4, enterpriseCode: "enterprise-two", enterpriseName: "Enterprise Two" };
const scope = { principalCode: current.loginId, principalType: "human", scopes: [], deniedScopes: [] };
const workspace = (items: unknown[] = [{ ...choice, status: "REGISTERED", accepted: true, actions: ["SWITCH"] }]) => ({
  contractVersion: 1, owner: "profile", renderer: "axis.enterprise-memberships", enterpriseCode: current.enterpriseCode, items,
});
const response = (data: unknown) => new Response(JSON.stringify({ code: "SUC_PRFL_00000", data }));
function csrf() { document.cookie = "nodics_axis_csrf=employee%2Fcsrf; path=/"; }
beforeEach(() => {
  saveSession(null); sessionStorage.clear(); localStorage.clear(); setTelegramLaunch(null);
  document.cookie = "nodics_axis_csrf=; max-age=0; path=/";
  document.cookie = "nodics_customer_csrf=; max-age=0; path=/";
});
afterEach(() => { saveSession(null); setTelegramLaunch(null); vi.restoreAllMocks(); });

describe("Profile-owned Enterprise session", () => {
  it("authenticates Employee credentials and confirms the issued human at Profile, with no Customer conversion", async () => {
    setTelegramLaunch("personal-launch");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response({ authToken: current.token, loginId: current.loginId }))
      .mockResolvedValueOnce(response(scope));
    const session = await authenticateEnterpriseSession(current.enterpriseCode, current.loginId, "password");
    expect(session).toEqual(current); expect(readSession()).toBeNull();
    expect(fetch.mock.calls[0]).toEqual(["/nodics/profile/v0/employee/browser/authenticate", expect.objectContaining({
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      body: JSON.stringify({ loginId: current.loginId, password: "password" }),
      headers: { "Content-Type": "application/json", "x-enterprise-code": current.enterpriseCode },
    })]);
    expect(fetch.mock.calls[1]).toEqual(["/nodics/profile/v0/identity/scopes/me", expect.objectContaining({ headers: {
      "Content-Type": "application/json", "x-enterprise-code": current.enterpriseCode, Authorization: "Bearer " + current.token,
    } })]);
    saveSession(session);
    expect(sessionStorage.length).toBe(1); expect(enterpriseSessionHint()).toBe(current.enterpriseCode);
    expect(sessionStorage.getItem("circa.enterprise-session")).not.toContain(current.token);
    expect(localStorage.length).toBe(0);
  });
  it.each([{ ...scope, principalType: "service" }, { ...scope, principalCode: "another-person" }, { ...scope, scopes: undefined }])(
    "refuses invalid or different fresh scope evidence %#", async invalid => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response({ authToken: "issued", loginId: current.loginId }))
        .mockResolvedValueOnce(response(invalid));
      await expect(authenticateEnterpriseSession(current.enterpriseCode, current.loginId, "password")).rejects.toThrow();
      expect(readSession()).toBeNull(); expect(enterpriseSessionHint()).toBeNull();
    });
  it("never promotes transient personal Employee proof into a stored participant session", () => {
    expect(() => saveSession({ kind: "EMPLOYEE", token: "proof", loginId: current.loginId })).toThrow();
    expect(readSession()).toBeNull();
  });
  it.each(["/nodics/eWaste/v0/wallet", "/nodics/eWaste/v0?query=1", "/nodics/profile/v0/customer/browser/authenticate",
    "/nodics/profile/v0/employee/browser/customer-participation/switch", "/nodics/commsApi/v0/inbox?page=1",
    "https://untrusted.test/read", "//untrusted.test/read", "/nodics/loyaltyApi/../eWaste/v0/wallet"]) (
    "blocks Enterprise credentials on personal or unsafe route %s", async path => {
      const fetch = vi.spyOn(globalThis, "fetch");
      await expect(request(path, current)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    });
  it("keeps personal Employee-to-Customer switch transport separate and uses its Employee CSRF", async () => {
    csrf(); const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ authToken: "customer" }));
    await request("/nodics/profile/v0/employee/browser/customer-participation/switch", { kind: "EMPLOYEE", token: "proof", loginId: current.loginId }, {});
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ "x-csrf-token": "employee/csrf", Authorization: "Bearer proof", "x-enterprise-code": "default" });
  });
  it("deduplicates Enterprise cookie restore and never restores it into a personal host", async () => {
    csrf(); sessionStorage.setItem("circa.enterprise-session", JSON.stringify(current.enterpriseCode));
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response({ authToken: current.token, loginId: current.loginId }))
      .mockResolvedValueOnce(response(scope));
    expect(await restoreSession()).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    const first = restoreSession({ allowEnterprise: true });
    expect(restoreSession({ allowEnterprise: true })).toBe(first);
    expect(await first).toEqual(current);
    expect(fetch.mock.calls[0]).toEqual(["/nodics/profile/v0/employee/browser/restore", expect.objectContaining({
      body: "{}", headers: { "Content-Type": "application/json", "x-enterprise-code": current.enterpriseCode, "x-csrf-token": "employee/csrf" },
    })]);
  });
  it("drops a late restore after local logout or a newer personal sign-in", async () => {
    csrf(); sessionStorage.setItem("circa.enterprise-session", JSON.stringify(current.enterpriseCode));
    let resolve!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(response(scope));
    const restored = restoreSession({ allowEnterprise: true });
    const personal = { token: "customer", loginId: "personal" }; saveSession(personal);
    resolve(response({ authToken: current.token, loginId: current.loginId }));
    expect(await restored).toEqual(personal); expect(readSession()).toEqual(personal); expect(enterpriseSessionHint()).toBeNull();
  });
  it("failed Enterprise restoration cannot fall back to Customer cookies", async () => {
    csrf(); document.cookie = "nodics_customer_csrf=customer; path=/";
    sessionStorage.setItem("circa.enterprise-session", JSON.stringify(current.enterpriseCode));
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(restoreSession({ allowEnterprise: true })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1); expect(readSession()).toBeNull();
  });
  it.each(["", "%broken"]) ("refuses absent/malformed Employee CSRF without using Customer proof (%s)", async cookie => {
    document.cookie = `nodics_axis_csrf=${cookie}; path=/`; document.cookie = "nodics_customer_csrf=customer; path=/";
    sessionStorage.setItem("circa.enterprise-session", JSON.stringify(current.enterpriseCode));
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(await restoreSession({ allowEnterprise: true })).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it("refreshes accepted membership proof, sends only code/revision under the OLD signed context, then confirms the NEW context", async () => {
    csrf(); saveSession(current);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(workspace()))
      .mockResolvedValueOnce(response({ authToken: "new-access", loginId: current.loginId, enterpriseCode: choice.enterpriseCode }))
      .mockResolvedValueOnce(response(scope));
    const next = switchEnterpriseSession(current, choice); expect(readSession()).toBeNull();
    expect(await next).toEqual({ ...current, token: "new-access", enterpriseCode: choice.enterpriseCode });
    expect(fetch.mock.calls[1]).toEqual(["/nodics/profile/v0/employee/browser/switch-enterprise", expect.objectContaining({
      body: JSON.stringify({ assignmentCode: choice.code, revision: choice.revision }), headers: {
        "Content-Type": "application/json", "x-enterprise-code": current.enterpriseCode, "x-csrf-token": "employee/csrf", Authorization: "Bearer " + current.token,
      },
    })]);
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ "x-enterprise-code": choice.enterpriseCode, Authorization: "Bearer new-access" });
    expect(readSession()).toBeNull(); // Host admits only after its own mounted-generation check.
  });
  it("rejects changed membership revision before any switch command", async () => {
    csrf(); saveSession(current);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(workspace([{ ...choice, revision: 5, status: "REGISTERED", accepted: true, actions: ["SWITCH"] }])));
    await expect(switchEnterpriseSession(current, choice)).rejects.toThrow("changed");
    expect(fetch).toHaveBeenCalledTimes(1); expect(readSession()).toBeNull();
  });
  it.each([{ ...choice, status: "PENDING", accepted: false, actions: ["SWITCH"] },
    { ...choice, status: "SUSPENDED", accepted: true, actions: ["SWITCH"] }])("rejects unaccepted or contradictory membership evidence %#", async item => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(workspace([item])));
    await expect(enterpriseMemberships(current)).rejects.toThrow();
  });
  it("does not retain the old session after an ambiguous switch acknowledgement", async () => {
    csrf(); saveSession(current);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(workspace())).mockResolvedValueOnce(response({ authToken: "new", enterpriseCode: "wrong" }));
    await expect(switchEnterpriseSession(current, choice)).rejects.toThrow(); expect(readSession()).toBeNull();
  });
  it("revokes Employee cookies with current context while clearing browser admission immediately", async () => {
    csrf(); saveSession(current); document.cookie = "nodics_customer_csrf=customer; path=/";
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ signedOut: true }));
    const signingOut = endSession(); expect(readSession()).toBeNull(); expect(enterpriseSessionHint()).toBeNull(); await signingOut;
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/nodics/profile/v0/employee/browser/logout", expect.objectContaining({
      headers: { "Content-Type": "application/json", "x-enterprise-code": current.enterpriseCode, "x-csrf-token": "employee/csrf" }, body: "{}",
    }));
  });
});
