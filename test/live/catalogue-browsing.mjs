/** Read-only live Shop/Coupons acceptance. Purchase review is opened and cancelled; no order or entitlement is created. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600";
const out =
  process.env.CIRCA_CATALOGUE_EVIDENCE || "/tmp/circa-marketplace/live";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  purchases = [],
  listingRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    /\/marketplace\/.*\/purchase/.test(request.url())
  )
    purchases.push(request.url());
  if (/\/catalogue\?/.test(request.url())) listingRequests.push(request.url());
});
const settled = async () => {
  await expect(page.locator(".catalogue-results-heading")).not.toContainText(
    "Updating",
  );
  await expect(page.locator(".catalogue-loading")).toHaveCount(0);
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
  await page.goto(base + "/shop");
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await screenshot("shop-grid-desktop");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".catalogue-items-list")).toBeVisible();
  await screenshot("shop-list-desktop");
  await page.getByLabel("Per page").selectOption("6");
  await settled();
  const firstPageName = await page
    .locator(".catalogue-card h2")
    .first()
    .innerText();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await settled();
  await expect(page.locator(".listing-pagination")).toContainText("Page 2");
  expect(await page.locator(".catalogue-card h2").first().innerText()).not.toBe(
    firstPageName,
  );
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
  expect(new URL(page.url()).searchParams.get("page")).toBe("2");
  await page.reload();
  await expect(page.locator(".catalogue-summary h1")).toHaveText(name);
  await screenshot("shop-detail-desktop");
  await page.getByRole("link", { name: "Back to assets" }).click();
  await settled();
  await expect(page.locator(".catalogue-items-list")).toBeVisible();
  await expect(page.locator(".listing-pagination")).toContainText("Page 2");
  expect(await page.locator(".catalogue-card h2").first().innerText()).toBe(
    name,
  );
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  let filters = page.getByRole("dialog", { name: "Advanced filters" });
  await filters
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Laptop Computer" });
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await settled();
  expect(await page.locator(".catalogue-card").count()).toBeGreaterThan(0);
  await expect(page.locator(".catalogue-applied-filters")).toContainText(
    "Laptop Computer",
  );
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await settled();
  await page
    .getByRole("combobox", { name: "Sort by", exact: true })
    .selectOption("POINTS_DESC");
  await settled();
  const prices = await page
    .locator(".catalogue-card-price strong")
    .allTextContents();
  expect(prices.map(Number)).toEqual(prices.map(Number).sort((a, b) => b - a));
  await page
    .getByRole("searchbox", { name: "Search marketplace" })
    .fill("nonexistent-item-qa-42017");
  await settled();
  await expect(
    page.getByRole("heading", { name: "No matching products" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await settled();
  // Begin a settled request context before injecting one deliberate transient failure.
  await page.goto(base + "/shop");
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await page.route(
    "**/circa.ewaste/v0/catalogue?**",
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
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await page.goto(base + "/coupons");
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
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await settled();
  await expect(page.locator(".catalogue-card")).toHaveCount(1);
  await page.locator(".catalogue-quick-trigger").first().click();
  await expect(
    quick.getByText("EcoMart", { exact: true }).first(),
  ).toBeVisible();
  await quick.getByRole("link", { name: "Open full details" }).click();
  await expect(page.locator(".catalogue-summary h1")).toBeVisible();
  await expect(
    page.getByText(
      "Eligibility requirements have not been provided by the publisher.",
    ),
  ).toBeVisible();
  await screenshot("coupon-detail-desktop");
  // Login is permitted; the financial action is previewed and cancelled.
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
  await expect(
    review.getByRole("button", { name: "Confirm purchase" }),
  ).toBeVisible();
  await screenshot("coupon-purchase-review");
  await review.getByRole("button", { name: "Close dialog" }).click();
  await page.goto(base + "/shop/CIRCA_COUPON_CPN-ECO-15");
  await expect(
    page.getByRole("heading", { name: "Product details unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Review.*purchase/ }),
  ).toHaveCount(0);
  for (const path of ["/shop", "/coupons"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + path);
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
  await fs.writeFile(
    out + "/result.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "server pagination",
          "sorting",
          "search",
          "filters apply/cancel",
          "quick view",
          "independent detail reload",
          "URL-preserved return",
          "error recovery",
          "cross-kind rejection",
          "purchase review cancellation",
          "desktop/mobile layouts",
          "shared My Account controls",
        ],
        directDetail: detailHref,
        listingRequests: listingRequests.length,
        purchaseRequests: purchases.length,
        browserErrors: errors,
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
