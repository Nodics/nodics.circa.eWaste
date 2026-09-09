import { beforeEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { enterChannel, linkChannel } from "./channelAuthentication";
vi.mock("../api", () => ({ API: "/nodics/eWaste/v0", request: vi.fn() }));
const api = vi.mocked(request);
beforeEach(() => api.mockReset());
it("uses eWaste fallback without attempting another authentication method", async () => {
  api.mockResolvedValueOnce({
    contractVersion: 1,
    channel: "TELEGRAM",
    requiresAuthentication: true,
  });
  expect(await enterChannel("TELEGRAM", "proof")).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0][0]).toBe(
    "/nodics/eWaste/v0/authentication/channels/TELEGRAM/entry",
  );
  expect(api.mock.calls[0][2]).toEqual({ proof: "proof" });
});
it("completes only the backend-selected handoff directly with Profile", async () => {
  api.mockResolvedValueOnce({
    contractVersion: 1,
    channel: "TELEGRAM",
    requiresAuthentication: false,
    handoffToken: "one-use",
  });
  api.mockResolvedValueOnce({ authToken: "access", loginId: "same-customer" });
  expect(await enterChannel("TELEGRAM", "proof")).toEqual({
    token: "access",
    loginId: "same-customer",
  });
  expect(api.mock.calls[1][0]).toBe(
    "/nodics/profile/v0/customer/browser/external/complete",
  );
  expect(api.mock.calls[1][2]).toEqual({
    handoffToken: "one-use",
    proof: "proof",
  });
});
it("rejects invalid contracts and does not silently switch to account fallback on proof failure", async () => {
  api.mockResolvedValueOnce({
    contractVersion: 9,
    channel: "TELEGRAM",
    requiresAuthentication: false,
  });
  await expect(enterChannel("TELEGRAM", "proof")).rejects.toThrow(
    /unsupported/,
  );
  api.mockRejectedValueOnce(new Error("Invalid proof"));
  await expect(enterChannel("TELEGRAM", "proof")).rejects.toThrow(
    "Invalid proof",
  );
  expect(api).toHaveBeenCalledTimes(2);
});
it("delegates linking with the authenticated session and without caller-selected application or identity", async () => {
  const session = { token: "access", loginId: "same-customer" };
  api.mockResolvedValueOnce({
    contractVersion: 1,
    channel: "TELEGRAM",
    linked: true,
  });
  await linkChannel("TELEGRAM", "proof", session);
  expect(api.mock.calls[0]).toEqual([
    "/nodics/eWaste/v0/authentication/channels/TELEGRAM/link",
    session,
    { proof: "proof" },
  ]);
});
it("propagates link conflicts so the shell cannot continue as a different account", async () => {
  api.mockRejectedValueOnce(new Error("Already linked"));
  await expect(
    linkChannel("TELEGRAM", "proof", { token: "access", loginId: "other" }),
  ).rejects.toThrow("Already linked");
});
