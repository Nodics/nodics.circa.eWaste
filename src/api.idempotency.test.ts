import { afterEach, expect, it, vi } from "vitest";
import { request } from "./api";

afterEach(() => { vi.restoreAllMocks(); });
const reply = () => new Response(JSON.stringify({ data: { accepted: true } }));

it.each(["POST", "PUT", "PATCH", "DELETE", "post"])("forwards the exact supplied key for %s without changing the body", async method => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply());
  const body = Object.freeze({ idempotencyKey: "Checkout:Exact-Key_01|ABC.def@2", revision: 3 });
  await request("/nodics/commerce/v0/place", null, body, method);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/nodics/commerce/v0/place", expect.objectContaining({
    method, body: JSON.stringify(body), headers: expect.objectContaining({ "Idempotency-Key": body.idempotencyKey }),
  }));
});

it("preserves the caller's key on repeated attempts instead of generating a new one", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply());
  const body = { idempotencyKey: "same-command" };
  await request("/mutation", null, body); await request("/mutation", null, body);
  expect(fetch.mock.calls.map(([, options]) => (options?.headers as Record<string, string>)["Idempotency-Key"]))
    .toEqual(["same-command", "same-command"]);
});

it.each(["GET", "get", "HEAD"])("does not add an idempotency header to %s reads even with a supplied body key", async method => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply());
  await request("/read", null, { idempotencyKey: "read-key" }, method);
  expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("Idempotency-Key");
});

it.each([undefined, {}, { idempotencyKey: 7 }, { idempotencyKey: null }, ["key"]])("does not synthesize or coerce an absent string key %#", async body => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply());
  await request("/mutation", null, body, "POST");
  expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("Idempotency-Key");
});

it.each(["", " key", "key ", "key\n", "key\r", "key\r\nInjected: value", "key\u0000", "key\tvalue", "key\u0100"])(
  "rejects unsafe or normalization-prone string keys before dispatch %#", async idempotencyKey => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(request("/mutation", null, { idempotencyKey })).rejects.toThrow("header transport");
    expect(fetch).not.toHaveBeenCalled();
  });

it("does not forward an inherited key that would not be serialized in the mutation body", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply());
  await request("/mutation", null, Object.create({ idempotencyKey: "inherited" }));
  expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("Idempotency-Key");
});
