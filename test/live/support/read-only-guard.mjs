/** Blocks business commands in retained-data browser acceptance before they reach an owner. */
import assert from "node:assert/strict";

const authenticationPaths = new Set([
  "/nodics/profile/v0/customer/browser/authenticate",
  "/nodics/profile/v0/customer/browser/restore",
  "/nodics/profile/v0/customer/browser/logout",
]);

/** Only documented local samples are permitted; this runner is not provider acceptance. */
export function localAcceptanceOrigin(value) {
  const url = new URL(value);
  assert(
    url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/",
    "Read-only acceptance requires an uncredentialed loopback HTTP origin",
  );
  return url.origin;
}

/** Query strings, headers, credentials and bodies are never retained as guard evidence. */
export function permitsReadOnlyRequest(method, value, origin) {
  const url = new URL(value);
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  return method === "POST" && url.origin === origin &&
    authenticationPaths.has(url.pathname) && !url.search;
}

/** Guard all pages in this context, including guest windows and popups. */
export async function installReadOnlyGuard(context, base) {
  const origin = localAcceptanceOrigin(base);
  const blocked = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (permitsReadOnlyRequest(request.method(), request.url(), origin)) {
      await route.continue();
      return;
    }
    blocked.push({ method: request.method(), pathname: new URL(request.url()).pathname });
    await route.abort("blockedbyclient");
  });
  return () => assert.deepEqual(blocked, [], "Business commands were blocked during read-only acceptance");
}
