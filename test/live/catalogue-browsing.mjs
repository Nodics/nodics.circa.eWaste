/** Read-only live Shop/Coupons acceptance. Purchase review is opened and cancelled; no order or entitlement is created. */
import { chromium, expect as playwrightExpect } from "@playwright/test";
import fs from "node:fs/promises";
import { installReadOnlyGuard } from "./support/read-only-guard.mjs";
// Functional acceptance allows owner API deadlines; this is not a latency benchmark.
const expect = playwrightExpect.configure({ timeout: 60000 });
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600";
const out =
  process.env.CIRCA_CATALOGUE_EVIDENCE || "/tmp/circa-marketplace/live";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-US", serviceWorkers: "block" });
const verifyReadOnly = await installReadOnlyGuard(page.context(), base);
const errors = [],
  purchases = [],
  listingRequests = [];
const observations = { pagination: "NOT_EXERCISED_RETAINED_DATA", purchaseReview: "NOT_EXERCISED" };
const listingReads = new Map();
let listingSequence = 0;
const parameterKey = (params) => JSON.stringify([...params].sort(([a], [b]) => a.localeCompare(b)));
// Mirrors readCatalogueQuery/catalogueParams and CataloguePage's layout-free API query.
function currentListingParams(value) {
  const url = new URL(value), params = new URLSearchParams();
  for (const key of ["q", "category", "condition", "issuer", "minPoints", "maxPoints", "validUntil"])
    if (url.searchParams.get(key)) params.set(key, url.searchParams.get(key));
  const sort = url.searchParams.has("sort") ? url.searchParams.get("sort") : "FEATURED";
  if (sort) params.set("sort", sort);
  params.set("page", /^[1-9]\d{0,3}$/.test(url.searchParams.get("page") || "") ? url.searchParams.get("page") : "1");
  const pageSize = Number(url.searchParams.get("pageSize"));
  params.set("pageSize", String([6, 12, 24, 48].includes(pageSize) ? pageSize : 12));
  params.set("kind", url.pathname === "/shop" ? "ASSET" : "COUPON");
  return params;
}
function ownerData(value) {
  for (let i = 0; i < 6 && value && !Array.isArray(value); i++) {
    if (value.success === false || String(value.code || "").startsWith("ERR_")) throw Error("Owner response failed");
    if (value.data !== undefined) value = value.data;
    else if (value.result !== undefined) value = value.result;
    else break;
  }
  return value;
}
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    /\/marketplace\/.*\/purchase/.test(request.url())
  )
    purchases.push(request.url());
  const url = new URL(request.url());
  if (request.method() === "GET" && url.pathname === "/nodics/eWaste/v0/catalogue") {
    listingRequests.push(request.url());
    listingReads.set(request, { sequence: ++listingSequence, key: parameterKey(url.searchParams), state: "pending" });
  }
});
page.on("response", async response => {
  const read = listingReads.get(response.request());
  if (!read) return;
  try {
    if (await response.finished() || !response.ok()) throw Error("Catalogue response failed");
    read.data = ownerData(await response.json());
    read.state = "completed";
  } catch {
    read.state = "failed";
  }
});
page.on("requestfailed", request => {
  const read = listingReads.get(request);
  if (read) read.state = "failed";
});
const settled = async (afterSequence) => {
  let read;
  await expect.poll(() => {
    const key = parameterKey(currentListingParams(page.url()));
    read = [...listingReads.values()].filter(value => value.sequence > afterSequence && value.key === key).at(-1);
    return !!read && read.state !== "pending";
  }).toBe(true);
  expect(read.state).toBe("completed");
  const params = currentListingParams(page.url());
  expect(read.key).toBe(parameterKey(params));
  expect(read.data.kind).toBe(params.get("kind"));
  expect(read.data.page).toBe(Number(params.get("page")));
  expect(read.data.pageSize).toBe(Number(params.get("pageSize")));
  expect(Number.isSafeInteger(read.data.total) && read.data.total >= 0).toBe(true);
  expect(Array.isArray(read.data.items)).toBe(true);
  await expect(page.locator(".catalogue-page [role=alert]")).toHaveCount(0);
  await expect(page.locator(".catalogue-results-heading")).not.toContainText(
    "Updating",
  );
  await expect(page.locator(".catalogue-loading")).toHaveCount(0);
  await expect(page.locator(".catalogue-results-heading > span")).toHaveText(`${read.data.total} products`);
  await expect(page.locator(".catalogue-card h2")).toHaveText(read.data.items.map(item => item.name));
  expect(read.sequence).toBe([...listingReads.values()].filter(value => value.key === read.key).at(-1).sequence);
  return read.data;
};
const changeListing = async action => {
  const afterSequence = listingSequence;
  await action();
  return settled(afterSequence);
};
const screenshot = async (name) => {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: `${out}/${name}.png` });
};
try {
  await changeListing(() => page.goto(base + "/shop"));
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await screenshot("shop-grid-desktop");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".catalogue-items-list")).toBeVisible();
  await screenshot("shop-list-desktop");
  const listing = await changeListing(() => page.getByLabel("Per page").selectOption("6"));
  const firstPageName = await page
    .locator(".catalogue-card h2")
    .first()
    .innerText();
  const next = page.getByRole("button", { name: "Next", exact: true });
  const listingPage = listing.page * listing.pageSize < listing.total ? 2 : 1;
  if (listingPage === 2) {
    await expect(next).toBeEnabled();
    await changeListing(() => next.click());
    await expect(page.locator(".listing-pagination")).toContainText("Page 2");
    expect(await page.locator(".catalogue-card h2").first().innerText()).not.toBe(firstPageName);
    observations.pagination = "EXERCISED_NATIVE";
  } else {
    await expect(page.locator(".listing-pagination")).toHaveCount(0);
  }
  const item = page.locator(".catalogue-card").first(),
    name = await item.locator("h2").innerText();
  const detailHref = await item
    .getByRole("link", { name: /^View details:/ })
    .getAttribute("href");
  await item.getByRole("button", { name: /^Quick view:/ }).click();
  const quick = page.getByRole("dialog", { name: "Quick view", exact: true });
  await expect(quick.getByRole("heading", { name, exact: true })).toBeVisible();
  const box = await quick.boundingBox();
  expect(box.width).toBeGreaterThan(700);
  await screenshot("shop-quick-desktop");
  await page.keyboard.press("Escape");
  await expect(quick).toHaveCount(0);
  await item.getByRole("button", { name: /^Quick view:/ }).click();
  await quick.getByRole("link", { name: "Open full details" }).click();
  await expect(page.locator(".catalogue-summary h1")).toHaveText(name);
  expect(Number(new URL(page.url()).searchParams.get("page") || 1)).toBe(listingPage);
  await page.reload();
  await expect(page.locator(".catalogue-summary h1")).toHaveText(name);
  await screenshot("shop-detail-desktop");
  await changeListing(() => page.getByRole("link", { name: "Back to assets" }).click());
  await expect(page.locator(".catalogue-items-list")).toBeVisible();
  if (listingPage === 2)
    await expect(page.locator(".listing-pagination")).toContainText("Page 2");
  else
    await expect(page.locator(".listing-pagination")).toHaveCount(0);
  expect(await page.locator(".catalogue-card h2").first().innerText()).toBe(
    name,
  );
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  let filters = page.getByRole("dialog", { name: "Advanced filters" });
  await filters
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Laptop Computer" });
  await changeListing(() => filters.getByRole("button", { name: "Apply filters" }).click());
  expect(await page.locator(".catalogue-card").count()).toBeGreaterThan(0);
  await expect(page.locator(".catalogue-applied-filters")).toContainText(
    "Laptop Computer",
  );
  await changeListing(() => page.getByRole("button", { name: "Clear all", exact: true }).click());
  await changeListing(() => page
    .getByRole("combobox", { name: "Sort by", exact: true })
    .selectOption("POINTS_DESC"));
  const prices = await page
    .locator(".catalogue-card-price strong")
    .allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  const numericPrices = prices.map(value => {
    const text = value.trim();
    expect(text).toMatch(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/);
    return Number(text.replaceAll(",", ""));
  });
  expect(numericPrices.every(Number.isFinite)).toBe(true);
  expect(numericPrices).toEqual([...numericPrices].sort((a, b) => b - a));
  await changeListing(() => page
    .getByRole("searchbox", { name: "Search marketplace" })
    .fill("nonexistent-item-qa-42017"));
  await expect(
    page.getByRole("heading", { name: "No matching products" }),
  ).toBeVisible();
  await changeListing(() => page.getByRole("button", { name: "Clear all", exact: true }).click());
  // Begin a settled request context before injecting one deliberate transient failure.
  await changeListing(() => page.goto(base + "/shop"));
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await page.route(
    "**/eWaste/v0/catalogue?**",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary catalogue failure" }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Refresh items" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await changeListing(() => page.getByRole("button", { name: "Try again" }).click());
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await changeListing(() => page.goto(base + "/coupons"));
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await screenshot("coupons-grid-desktop");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  filters = page.getByRole("dialog", { name: "Advanced filters" });
  await filters
    .getByLabel("Partner", { exact: true })
    .selectOption({ label: "EcoMart" });
  await filters.getByRole("button", { name: "Close dialog" }).click();
  expect(new URL(page.url()).searchParams.has("issuer")).toBe(false);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await filters
    .getByLabel("Partner", { exact: true })
    .selectOption({ label: "EcoMart" });
  await changeListing(() => filters.getByRole("button", { name: "Apply filters" }).click());
  expect(await page.locator(".catalogue-card").count()).toBeGreaterThan(0);
  await page.locator(".catalogue-quick-trigger").first().click();
  await expect(
    quick.getByText("EcoMart", { exact: true }).first(),
  ).toBeVisible();
  await quick.getByRole("link", { name: "Open full details" }).click();
  await expect(page.locator(".catalogue-summary h1")).toBeVisible();
  await expect(page.getByText("Eligibility requirements", { exact: true })).toBeVisible();
  await screenshot("coupon-detail-desktop");
  // Preserve the completed demo balance; never top it up for browser acceptance.
  await page.getByRole("button", { name: "Sign in to continue" }).click();
  const auth = page.getByRole("dialog");
  await auth
    .getByLabel("Email address")
    .fill(process.env.CIRCA_CUSTOMER_LOGIN || "customer@circa.local");
  await auth
    .getByLabel("Password", { exact: true })
    .fill(process.env.CIRCA_CUSTOMER_PASSWORD || "CircaDemo!2026");
  await auth.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: /Review coupon purchase/ }).click();
  const review = page.getByRole("dialog", { name: "Review your purchase" });
  await expect.poll(async () => await review.count() > 0 ||
    await page.getByText("More points are needed for this purchase.").count() > 0).toBe(true);
  if (await review.count()) {
    await expect(review.getByRole("button", { name: "Confirm purchase" })).toBeVisible();
    await screenshot("coupon-purchase-review");
    await review.getByRole("button", { name: "Close dialog" }).click();
    observations.purchaseReview = "OPENED_AND_CANCELLED";
  } else {
    await expect(review).toHaveCount(0);
    observations.purchaseReview = "INSUFFICIENT_BALANCE_PROTECTED";
    await screenshot("coupon-insufficient-balance");
  }
  await page.goto(base + "/shop/CIRCA_COUPON_CPN-ECO-15");
  await expect(
    page.getByRole("heading", { name: "Product details unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Review.*purchase/ }),
  ).toHaveCount(0);
  for (const path of ["/shop", "/coupons"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await changeListing(() => page.goto(base + path));
    await expect(page.locator(".catalogue-card").first()).toBeVisible();
    await screenshot(path.slice(1) + "-grid-mobile");
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await screenshot(path.slice(1) + "-list-mobile");
    await page.locator(".catalogue-quick-trigger").first().click();
    await expect(
      quick.getByRole("link", { name: "Open full details" }),
    ).toBeVisible();
    expect(
      await quick.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await screenshot(path.slice(1) + "-quick-mobile");
    await quick.getByRole("link", { name: "Open full details" }).click();
    await expect(page.locator(".catalogue-summary h1")).toBeVisible();
    await screenshot(path.slice(1) + "-detail-mobile");
  }
  // Shared control extraction must preserve all three customer collections.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/account/items");
  await expect(page.locator(".waste-toolbar")).toBeVisible();
  const bounds = [];
  for (const name of ["Submissions", "Owned assets", "Drafts"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".waste-results-heading")).not.toContainText(
      "Updating",
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    bounds.push(await page.locator(".waste-toolbar").boundingBox());
  }
  for (const box of bounds.slice(1))
    for (const key of ["x", "y", "width", "height"])
      expect(box[key]).toBeCloseTo(bounds[0][key], 0);
  await expect(
    page.getByRole("button", { name: "Grid view", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".waste-draft-items")).toHaveClass(
    /waste-items-list/,
  );
  expect(errors).toEqual([]);
  expect(purchases).toEqual([]);
  verifyReadOnly();
  await fs.writeFile(
    out + "/result.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "pagination availability agrees with retained data",
          "sorting",
          "search",
          "filters apply/cancel",
          "quick view",
          "independent detail reload",
          "URL-preserved return",
          "error recovery",
          "cross-kind rejection",
          "purchase review or insufficient-balance protection",
          "desktop/mobile layouts",
          "shared My Account controls",
        ],
        directDetail: detailHref,
        listingRequests: listingRequests.length,
        purchaseRequests: purchases.length,
        browserErrors: errors,
        observations,
        performanceAcceptance: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: Shop/Coupons live catalogue journey, shared account controls, desktop/mobile; no purchases submitted.",
  );
} finally {
  await browser.close();
}
