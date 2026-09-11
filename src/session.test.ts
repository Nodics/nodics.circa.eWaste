import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readSession, saveSession, restoreSession, endSession } from "./api";
beforeEach(() => {
  saveSession(null);
  sessionStorage.clear();
  document.cookie = "nodics_customer_csrf=csrf-proof; Path=/";
});
afterEach(() => {
  saveSession(null);
  document.cookie = "nodics_customer_csrf=; Max-Age=0; Path=/";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.cookie = "nodics_docker_customer_csrf=; Max-Age=0; Path=/";
});
it("keeps access credentials in memory and discards legacy storage", () => {
  sessionStorage.setItem(
    "circa.session",
    JSON.stringify({ token: "legacy", loginId: "old" }),
  );
  expect(readSession()).toBeNull();
  expect(sessionStorage.getItem("circa.session")).toBeNull();
  saveSession({ token: "new", loginId: "customer" });
  expect(readSession()?.token).toBe("new");
  expect(sessionStorage.getItem("circa.session")).toBeNull();
});
it("restores once through the customer cookie endpoint with CSRF and no refresh token in JavaScript", async () => {
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    expect(options.credentials).toBe("same-origin");
    expect(options.headers).toMatchObject({ "x-csrf-token": "csrf-proof" });
    return {
      ok: true,
      json: async () => ({
        result: { authToken: "access", loginId: "customer" },
      }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const [a, b] = await Promise.all([restoreSession(), restoreSession()]);
  expect(a).toEqual(b);
  expect(a?.token).toBe("access");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("a late restore cannot resurrect a signed-out session", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  const pending = restoreSession();
  saveSession(null);
  resolve({
    ok: true,
    json: async () => ({ result: { authToken: "stale", loginId: "customer" } }),
  });
  expect(await pending).toBeNull();
  expect(readSession()).toBeNull();
});
it("logout clears memory and revokes the customer cookie session", async () => {
  saveSession({ token: "access", loginId: "customer" });
  const fetcher = vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => ({ result: true }),
  }));
  vi.stubGlobal("fetch", fetcher);
  await endSession();
  expect(readSession()).toBeNull();
  expect(fetcher.mock.calls[0][0]).toBe(
    "/nodics/profile/v0/customer/browser/logout",
  );
});

it("uses the configured CSRF cookie when local environments share a hostname", async () => {
  vi.stubEnv("VITE_CUSTOMER_CSRF_COOKIE_NAME", "nodics_docker_customer_csrf");
  document.cookie = "nodics_docker_customer_csrf=docker-proof; Path=/";
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    expect(options.headers).toMatchObject({ "x-csrf-token": "docker-proof" });
    return {
      ok: true,
      json: async () => ({
        result: { authToken: "docker-access", loginId: "customer" },
      }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  expect((await restoreSession())?.token).toBe("docker-access");
});
