import assert from "node:assert/strict";
import test from "node:test";
import { installReadOnlyGuard, localAcceptanceOrigin, permitsReadOnlyRequest } from "./read-only-guard.mjs";

test("acceptance refuses remote, credentialed and ambiguous base URLs", () => {
  assert.equal(localAcceptanceOrigin("http://127.0.0.1:3600"), "http://127.0.0.1:3600");
  for (const value of ["https://example.com", "http://localhost:3600/shop", "http://user:secret@localhost:3600", "http://localhost:3600?token=secret", "http://localhost:3600#secret"])
    assert.throws(() => localAcceptanceOrigin(value));
});

test("only same-origin customer session commands may write", () => {
  const origin = "http://localhost:3600";
  const auth = origin + "/nodics/profile/v0/customer/browser/authenticate";
  assert.equal(permitsReadOnlyRequest("POST", auth, origin), true);
  assert.equal(permitsReadOnlyRequest("GET", origin + "/nodics/eWaste/v0/purchases", origin), true);
  for (const [method, url] of [
    ["POST", origin + "/nodics/eWaste/v0/coupons/CPN/reveal"],
    ["POST", origin + "/nodics/eWaste/v0/marketplace/asset/purchase"],
    ["POST", origin + "/nodics/profile/v0/customer/registrations"],
    ["POST", auth + "?override=true"],
    ["POST", auth.replace("localhost", "127.0.0.1")],
    ["DELETE", origin + "/nodics/media/v0/media/asset"],
  ]) assert.equal(permitsReadOnlyRequest(method, url, origin), false);
});

test("blocked commands never continue and guard evidence excludes secrets", async () => {
  let handle;
  const context = { route: async (_, handler) => { handle = handler; } };
  const verify = await installReadOnlyGuard(context, "http://localhost:3600");
  let continued = 0, aborted = 0;
  await handle({
    request: () => ({ method: () => "POST", url: () => "http://localhost:3600/nodics/eWaste/v0/submit?token=private-proof" }),
    continue: async () => { continued++; },
    abort: async () => { aborted++; },
  });
  assert.equal(continued, 0);
  assert.equal(aborted, 1);
  assert.throws(verify, (error) => !JSON.stringify(error.actual).includes("private-proof"));
});
