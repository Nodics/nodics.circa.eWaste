import { afterEach, expect, it, vi } from "vitest";
import { request } from "./api";
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("a stalled connection times out with recoverable customer copy", async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const result = request("/test", null, {}, "POST", { timeoutMs: 100 });
  const check = expect(result).rejects.toMatchObject({
    code: "ERR_NETWORK_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(101);
  await check;
});
it("offline transport and non-JSON failure do not leak raw network diagnostics", async () => {
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("internal transport detail"));
  await expect(request("/test")).rejects.toMatchObject({
    code: "ERR_NETWORK_UNAVAILABLE",
  });
  mock.mockResolvedValueOnce(
    new Response("<html>proxy error</html>", { status: 502 }),
  );
  await expect(request("/test")).rejects.toThrow("temporarily unavailable");
});
it("owner validation codes survive transport handling and keep the customer correction path", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        success: false,
        code: "ERR_CIRCA_ARRIVAL_REQUIRED",
        message: "Check arrival again",
      }),
      { status: 400 },
    ),
  );
  await expect(request("/test")).rejects.toMatchObject({
    code: "ERR_CIRCA_ARRIVAL_REQUIRED",
    message: "Check arrival again",
  });
});
