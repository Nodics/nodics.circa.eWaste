/** Authored CSRF namespace separation fixtures using mocked fetch only; NOT RUN. */
import { afterEach, expect, it, vi } from "vitest";
import { request } from "./api";
const path =
  "/nodics/profile/v0/employee/browser/customer-participation/switch";
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "nodics_axis_csrf=; Max-Age=0; Path=/";
  document.cookie = "nodics_customer_csrf=; Max-Age=0; Path=/";
});
it("uses matching Employee CSRF and bearer without substituting Customer companion", async () => {
  document.cookie = "nodics_axis_csrf=employee-companion; Path=/";
  document.cookie = "nodics_customer_csrf=customer-companion; Path=/";
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          enterpriseCode: "default",
          authToken: "customer",
          loginId: "fixture",
        },
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  await request(
    path,
    { token: "employee", loginId: "fixture" },
    { revision: 1 },
  );
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    path,
    expect.objectContaining({
      credentials: "same-origin",
      body: JSON.stringify({ revision: 1 }),
      headers: expect.objectContaining({
        "x-csrf-token": "employee-companion",
        Authorization: "Bearer employee",
        "x-enterprise-code": "default",
      }),
    }),
  );
});
it("does not send a switch when only Customer CSRF exists", async () => {
  document.cookie = "nodics_customer_csrf=customer-companion; Path=/";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    request(path, { token: "employee", loginId: "fixture" }, { revision: 1 }),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
