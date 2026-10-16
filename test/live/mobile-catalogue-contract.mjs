/** Isolated browser contract fixtures, not demo records, imports or retained-data acceptance. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { installReadOnlyGuard, localAcceptanceOrigin } from "./support/read-only-guard.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = localAcceptanceOrigin(process.env.CIRCA_SITE_URL || "http://127.0.0.1:3600");
const out = path.resolve(process.env.CIRCA_MOBILE_CATALOGUE_EVIDENCE || path.join(root, "test-results/mobile-catalogue-contract"));
const artworkRoot = path.resolve(root, "../../nodics.kickoff/modules/circa.ewaste/data/sample-v001/content/assets/circa-media/files");
const media = new Map();
for (const [code, file] of [
  ["circa-asset-laptop", "asset-laptop.svg"],
  ["circa-coupon-market", "coupon-market.svg"],
  ["circa-hero-circular-value", "circa-hero-circular-value.png"],
  ["circa-hero-second-life", "circa-hero-second-life.png"],
]) media.set(code, { body: await fs.readFile(path.join(artworkRoot, file)), contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/png" });

const API = "/nodics/eWaste/v0";
const APP = "/nodics/eWaste/v0";
const loginId = "buyer@fixture.invalid";
const assets = [
  { code: "FIXTURE_LAPTOP", name: "Fixture laptop", condition: "GOOD" },
  { code: "FIXTURE_SPARE", name: "Fixture spare laptop", condition: "FAIR" },
].map(value => ({ ...value, kind: "ASSET", category: { code: "LAPTOP", label: "Laptop" }, imageUrl: "/media/asset-laptop.svg", ownerCode: "fixture-seller", rewardPrice: 25, revision: "fixture-v1", available: true, biddingAvailable: false }));
const coupons = [{ code: "FIXTURE_COUPON", name: "Fixture repair coupon", kind: "COUPON", issuer: "Isolated fixture partner", imageUrl: "/media/coupon-market.svg", rewardPrice: 10, revision: "fixture-v1", available: true, expiresAt: "2099-12-31T23:59:59Z", terms: ["Isolated rendering fixture; not a redeemable offer."] }];
const wallet = { wallet: { code: "fixture-wallet", ownerCode: "fixture-buyer" }, balances: [{ rewardTypeCode: "points", available: "100", reserved: "0" }], entries: [] };
const authRoutes = new Set([
  "/nodics/profile/v0/customer/browser/authenticate",
  "/nodics/profile/v0/customer/browser/external/complete",
  `${API}/authentication/channels/TELEGRAM/entry`,
  `${API}/authentication/channels/TELEGRAM/link`,
]);

function listing(url) {
  const kind = url.searchParams.get("kind");
  let items = kind === "ASSET" ? assets : coupons;
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const condition = url.searchParams.get("condition");
  items = items.filter(item => (!q || item.name.toLowerCase().includes(q)) && (!condition || item.condition === condition));
  return {
    kind, items, total: items.length, page: 1, pageSize: Number(url.searchParams.get("pageSize")) || 12,
    facets: { categories: [{ code: "LAPTOP", label: "Laptop" }], conditions: [{ code: "GOOD", label: "GOOD" }, { code: "FAIR", label: "FAIR" }], issuers: [{ code: "Isolated fixture partner", label: "Isolated fixture partner" }] },
  };
}

// No SDK download or native device proof: this adapter is deliberately a browser test double.
async function mockTelegram(context) {
  await context.addInitScript(() => {
    const handlers = new Set();
    const state = { ready: 0, expand: 0, locationCalls: 0, backVisible: false };
    window.__circaTelegramFixture = {
      state,
      pressBack() {
        if (handlers.size !== 1) throw new Error(`Expected one native Back fixture handler, got ${handlers.size}`);
        [...handlers][0]();
      },
    };
    window.Telegram = { WebApp: {
      initData: "fixture-only-signed-launch-placeholder", platform: "fixture-browser",
      ready() { state.ready++; }, expand() { state.expand++; }, isVersionAtLeast: () => true,
      BackButton: {
        onClick(handler) { handlers.add(handler); }, offClick(handler) { handlers.delete(handler); },
        show() { state.backVisible = true; }, hide() { state.backVisible = false; },
      },
      LocationManager: {
        isInited: true, isLocationAvailable: false, isAccessRequested: true, isAccessGranted: false,
        init() { state.locationCalls++; throw new Error("Shop must not request fixture location"); },
        getLocation() { state.locationCalls++; throw new Error("Shop must not capture fixture location"); },
      },
    } };
    navigator.geolocation.getCurrentPosition = () => { throw new Error("Shop must not request browser location"); };
  });
}

async function isolateOwners(context) {
  const verifyGuard = await installReadOnlyGuard(context, base);
  const audit = { ownerFixtures: [], staticDispatches: [], unexpected: [], businessWrites: [], authenticationFixtures: 0, suppressedFontStylesheets: 0 };
  let linked = false;
  let denyWallet = false;
  // Registered after the parent guard: all owner HTTP is terminated here, including authentication.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const record = { method, pathname: url.pathname };
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data: value }) });
    // Use the application's system-font fallback without contacting a font provider.
    if (method === "GET" && url.origin === "https://fonts.googleapis.com" && url.pathname === "/css2") {
      audit.suppressedFontStylesheets++;
      return route.fulfill({ contentType: "text/css", body: "" });
    }
    if (url.origin !== base) {
      audit.unexpected.push(record);
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/nodics/")) {
      if (method === "GET" && (/^\/(?:@|src\/|node_modules\/|brand\/)/.test(url.pathname) || ["/mobile", "/telegram", "/favicon.ico"].includes(url.pathname))) {
        audit.staticDispatches.push(record);
        return route.fallback();
      }
      audit.unexpected.push(record);
      return route.abort("blockedbyclient");
    }
    audit.ownerFixtures.push(record);
    if (method === "POST" && authRoutes.has(url.pathname)) {
      audit.authenticationFixtures++;
      if (url.pathname.endsWith("/link")) {
        linked = true;
        return json({ contractVersion: 1, channel: "TELEGRAM", linked: true });
      }
      if (url.pathname.endsWith("/entry"))
        return json({ contractVersion: 1, channel: "TELEGRAM", requiresAuthentication: !linked, ...(linked ? { handoffToken: "fixture-handoff" } : {}) });
      return json({ authToken: "fixture-access-only", loginId });
    }
    if (method !== "GET") {
      audit.businessWrites.push(record);
      return json({ message: "Business commands are prohibited in isolated visual acceptance." }, 409);
    }
    if (url.pathname === `${APP}/experience`)
      return json({ presentation: { sampleMode: false }, categories: [], itemTypes: [], centres: [] });
    if (url.pathname === `${APP}/catalogue`) return json(listing(url));
    if (url.pathname.startsWith(`${APP}/catalogue/`)) {
      const code = decodeURIComponent(url.pathname.slice(`${APP}/catalogue/`.length));
      const offer = [...assets, ...coupons].find(item => item.code === code && item.kind === url.searchParams.get("kind"));
      return json(offer || { message: "Fixture product unavailable" }, offer ? 200 : 404);
    }
    if (url.pathname === `${API}/account`)
      return json({ customer: { code: "fixture-buyer", loginId }, submissions: [], assets: [], events: [] });
    if (url.pathname === `${API}/wallet`) {
      if (denyWallet) {
        denyWallet = false;
        return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "ERR_PERMISSION_DENIED", message: "Fixture owner denied wallet access" }) });
      }
      return json(wallet);
    }
    if (url.pathname === "/nodics/commsApi/v0/customer/communications") return json([]);
    if (url.pathname === "/nodics/cms/v0/delivery/pages/resolve")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ result: { contractVersion: 0, site: "circaSite", path: url.searchParams.get("path"), page: { renderer: "circa.page", components: [] } } }) });
    const image = media.get(url.pathname.replace("/nodics/media/v0/content/", ""));
    if (url.pathname.startsWith("/nodics/media/v0/content/") && image) return route.fulfill(image);
    audit.unexpected.push(record);
    return json({ message: "Unspecified owner fixture" }, 404);
  });
  return { audit, denyWalletOnce: () => { denyWallet = true; }, verify() {
    verifyGuard();
    assert.deepEqual(audit.businessWrites, [], "A business command was attempted; it was fulfilled locally and never dispatched");
    assert.deepEqual(audit.unexpected, [], "Unspecified routes fail closed instead of reaching an owner");
    assert(audit.staticDispatches.every(item => item.method === "GET" && !item.pathname.startsWith("/nodics/")));
  } };
}

async function imageEvidence(image) {
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  const pixels = await image.evaluate(node => {
    const canvas = document.createElement("canvas");
    canvas.width = 48; canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(node, 0, 0, 48, 32);
    const data = ctx.getImageData(0, 0, 48, 32).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 3] > 0) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return { naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, colors: colors.size };
  });
  expect(pixels.colors).toBeGreaterThan(8);
  return pixels;
}

async function noOverflow(page) {
  const result = await page.evaluate(() => {
    const shell = document.querySelector(".mobile-app").getBoundingClientRect();
    const selectors = [".mobile-content", ".mobile-catalogue main", ".listing-toolbar", ".catalogue-product-layout", ".mobile-tabs", "dialog[open]"];
    return {
      document: document.documentElement.scrollWidth <= innerWidth,
      elements: selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(node => {
        const box = node.getBoundingClientRect();
        const modal = node.tagName === "DIALOG";
        const containingDialog = node.closest("dialog[open]")?.getBoundingClientRect();
        const bounds = modal ? { left: 0, right: innerWidth } : containingDialog || shell;
        return { selector, fits: node.scrollWidth <= node.clientWidth + 1 && box.left >= bounds.left - 1 && box.right <= bounds.right + 1 };
      })),
    };
  });
  expect(result.document).toBe(true);
  expect(result.elements.filter(item => !item.fits)).toEqual([]);
}

await fs.mkdir(out, { recursive: true });
await fs.rm(path.join(out, "result.json"), { force: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    for (const host of ["mobile", "telegram"]) {
      const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: "block" });
      try {
        await mockTelegram(context);
        const owners = await isolateOwners(context);
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const prefix = `${host}-${viewport.width}`;
        const screenshots = [];
        const shot = async name => {
          const file = `${prefix}-${name}.png`;
          await page.screenshot({ path: path.join(out, file) });
          await noOverflow(page);
          screenshots.push(file);
        };
        const back = async () => host === "telegram"
          ? page.evaluate(() => window.__circaTelegramFixture.pressBack())
          : page.keyboard.press("Escape");
        const preserved = () => {
          const url = new URL(page.url());
          expect(url.pathname).toBe(`/${host}`);
          expect(url.searchParams.get("tgWebAppStartParam")).toBe("fixture-launch-context");
        };
        await page.goto(`${base}/${host}?tgWebAppStartParam=fixture-launch-context`);
        await expect(page.getByRole("button", { name: "Shop", exact: true })).toBeVisible();
        // Vite React StrictMode may initialize effects twice; navigation must add none.
        const initialSdk = await page.evaluate(() => ({ ...window.__circaTelegramFixture.state }));
        if (host === "telegram") expect(initialSdk.ready).toBeGreaterThan(0);
        await page.getByRole("button", { name: "Shop", exact: true }).tap();
        await expect(page.locator(".catalogue-card")).toHaveCount(2);
        await expect(page.locator("main")).toBeFocused();
        const pixels = await imageEvidence(page.locator(".catalogue-card img").first());
        await shot("asset-grid");
        await page.getByRole("button", { name: "Filters", exact: true }).focus();
        await page.keyboard.press("Enter");
        let filters = page.getByRole("dialog", { name: "Advanced filters" });
        await filters.getByLabel("Condition", { exact: true }).selectOption("GOOD");
        await shot("filters");
        await back();
        await expect(filters).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeFocused();
        expect(new URL(page.url()).searchParams.has("condition")).toBe(false);
        await page.getByRole("button", { name: "Filters", exact: true }).tap();
        filters = page.getByRole("dialog", { name: "Advanced filters" });
        await filters.getByLabel("Condition", { exact: true }).selectOption("GOOD");
        await filters.getByRole("button", { name: "Apply filters" }).tap();
        await expect(page.locator(".catalogue-card")).toHaveCount(1);
        await page.getByRole("button", { name: "Clear all", exact: true }).tap();
        await expect(page.locator(".catalogue-card")).toHaveCount(2);
        await page.getByRole("button", { name: "List view", exact: true }).tap();
        const quickTrigger = page.getByRole("button", { name: "Quick view: Fixture laptop", exact: true });
        await quickTrigger.tap();
        let quick = page.getByRole("dialog", { name: "Quick view", exact: true });
        await imageEvidence(quick.locator(".catalogue-gallery-main img"));
        await shot("quick-view");
        await back();
        await expect(quick).toHaveCount(0);
        await expect(quickTrigger).toBeFocused();
        await quickTrigger.tap();
        quick = page.getByRole("dialog", { name: "Quick view", exact: true });
        await quick.getByRole("link", { name: "Open full details" }).tap();
        await expect(page.locator(".catalogue-summary h1")).toHaveText("Fixture laptop");
        await expect(page.locator("main")).toBeFocused();
        await imageEvidence(page.locator(".catalogue-gallery-main img"));
        await shot("asset-detail");
        preserved();
        await page.getByRole("link", { name: "Back to assets", exact: true }).tap();
        await expect(page.locator(".catalogue-items-list")).toBeVisible();
        expect(new URL(page.url()).searchParams.get("layout")).toBe("list");
        // Also exercise direct card taps rather than only quick-view detail entry.
        await page.getByRole("link", { name: "View details: Fixture laptop", exact: true }).tap();
        await expect(page.locator(".catalogue-summary h1")).toHaveText("Fixture laptop");
        if (host === "telegram") {
          await back();
          await expect(page.locator(".catalogue-items-list")).toBeVisible();
        }
        await page.getByRole("link", { name: "Coupons", exact: true }).tap();
        await page.getByRole("link", { name: "View details: Fixture repair coupon", exact: true }).tap();
        await page.getByRole("button", { name: "Sign in to continue", exact: true }).tap();
        let auth = page.getByRole("dialog", { name: "Sign in to continue", exact: true });
        await expect(auth).toBeVisible();
        expect(await auth.evaluate(node => node.contains(document.activeElement))).toBe(true);
        await auth.getByRole("button", { name: "Close dialog", exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(auth.getByLabel("Email address")).toBeFocused();
        await shot("sign-in");
        await back();
        await expect(auth).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Sign in to continue", exact: true })).toBeFocused();
        await page.getByRole("button", { name: "Sign in to continue", exact: true }).tap();
        auth = page.getByRole("dialog", { name: "Sign in to continue", exact: true });
        await auth.getByLabel("Email address").fill(loginId);
        await auth.getByLabel("Password", { exact: true }).fill("fixture-only-not-a-real-credential");
        await auth.getByRole("button", { name: "Sign in", exact: true }).tap();
        await expect(auth).toHaveCount(0);
        await expect(page.getByRole("dialog", { name: "Review your purchase" })).toHaveCount(0);
        await page.getByRole("button", { name: /Review coupon purchase/ }).tap();
        const review = page.getByRole("dialog", { name: "Review your purchase", exact: true });
        await expect(review.getByText("90 points", { exact: true })).toBeVisible();
        await expect(review.getByRole("button", { name: "Confirm purchase" })).toBeEnabled();
        await shot("purchase-review-cancel-only");
        await back();
        await expect(review).toHaveCount(0);
        owners.denyWalletOnce();
        await page.getByRole("button", { name: /Review coupon purchase/ }).tap();
        await expect(page.getByRole("alert")).toContainText("Fixture owner denied wallet access");
        await expect(review).toHaveCount(0);
        await shot("owner-denied");
        preserved();
        expect(errors).toEqual([]);
        const sdk = await page.evaluate(() => window.__circaTelegramFixture.state);
        expect(sdk.locationCalls).toBe(0);
        if (host === "telegram") expect({ ready: sdk.ready, expand: sdk.expand }).toEqual({ ready: initialSdk.ready, expand: initialSdk.expand });
        owners.verify();
        results.push({ host, viewport, pixels, screenshots, audit: owners.audit, browserErrors: errors, sdk: { initial: initialSdk, final: sdk }, sdkProof: "browser test double only; not actual native-client acceptance" });
        console.log(`PASS ${prefix}: imagery, layout, taps, filters, focus, Back, mocked sign-in and cancelled review; zero business writes`);
      } finally {
        await context.close();
      }
    }
  }
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ passed: true, kind: "ISOLATED_MOBILE_CATALOGUE_BROWSER_CONTRACT", retainedDataAcceptance: false, nativeClientAcceptance: false, fixtureArtwork: "circa.ewaste module/data public asset-laptop.svg (read only)", results }, null, 2));
  console.log(`Evidence: ${out}`);
} finally {
  await browser.close();
}
