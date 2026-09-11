/** Read-only customer workspace acceptance against the local sample account. Commands are previewed and cancelled. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600",
  out = process.env.CIRCA_WORKSPACE_EVIDENCE || "/tmp/circa-workspace";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", async (response) => {
  if (response.status() >= 400 && response.url().includes("/nodics/"))
    console.log("HTTP", response.status(), new URL(response.url()).pathname);
});
try {
  await page.goto(base + "/account/items");
  await page
    .getByRole("button", { name: /^Sign in/ })
    .first()
    .click();
  const auth = page.getByRole("dialog");
  await auth
    .getByLabel("Email address")
    .fill(process.env.CIRCA_CUSTOMER_LOGIN || "customer@circa.local");
  await auth
    .getByLabel("Password", { exact: true })
    .fill(process.env.CIRCA_CUSTOMER_PASSWORD || "CircaDemo!2026");
  await auth.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".waste-item-card").first()).toBeVisible();
  await expect(page.locator(".waste-banner img")).toBeVisible();
  await expect(page.locator(".waste-results-heading")).not.toContainText(
    "Updating",
  );
  await page.screenshot({ path: out + "/listing-desktop.png", fullPage: true });
  await expect(
    page.locator(".account-page > .waste-workspace:first-child"),
  ).toBeVisible();
  await expect(page.locator(".account-page > .page-heading")).toHaveCount(0);
  await expect(page.getByText("Review updates", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: out + "/banner-first.png" });
  await page.locator(".header-actions").getByRole("link", { name: "Updates", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  const updates = page.getByRole("dialog", { name: "Your updates" });
  await expect(updates.locator(".customer-update-item").first()).toBeVisible();
  await expect(updates).not.toContainText("http://localhost");
  await expect(updates).not.toContainText("WST_");
  await expect(updates).not.toContainText("Reviewer comment:");
  await expect(
    updates.locator(".customer-update-photo img").first(),
  ).toBeVisible();
  await page.screenshot({ path: out + "/updates-desktop.png" });
  await updates.getByRole("button", { name: "Close dialog" }).click();
  const firstName = await page
    .locator(".waste-item-card h2")
    .first()
    .innerText();
  await page.locator(".waste-quick-trigger").first().click();
  const quick = page.getByRole("dialog", { name: "Quick view" });
  await expect(quick.locator("h1")).toHaveText(firstName);
  await expect(page).toHaveURL(/\/account\/items(?:\?|$)/);
  await expect(quick.locator(".waste-gallery-image img")).toBeVisible();
  await page.screenshot({ path: out + "/quick-view-desktop.png" });
  await quick.getByRole("button", { name: "Open full details" }).click();
  await expect(page.locator(".waste-detail h1")).toHaveText(firstName);
  await expect(page).toHaveURL(/\/account\/submissions\//);
  const detailURL = page.url();
  await page.reload();
  await expect(page.locator(".waste-detail h1")).toHaveText(firstName);
  await expect(page.locator(".waste-gallery-image img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".waste-gallery-image img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.locator(".site-header")).not.toHaveClass(/is-scrolled/);
  await page.screenshot({
    path: out + "/detail-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Specifications", exact: true }).click();
  await expect(page.locator(".waste-specifications")).toBeVisible();
  await page.getByRole("tab", { name: "Review & history" }).click();
  await expect(page.locator(".waste-history")).toBeVisible();
  await page.getByRole("link", { name: "Your items", exact: true }).click();
  await page.getByRole("button", { name: /^Rejected\s/ }).click();
  await expect(page.locator(".waste-results-heading")).not.toContainText(
    "Updating",
  );
  await expect(
    page.locator(".waste-item-card .waste-status").first(),
  ).toContainText("Rejected");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Advanced filters" })
    .getByRole("button", { name: "Cancel", exact: true })
    .count()
    .then(async (n) => {
      if (n)
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      else
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Close dialog" })
          .click();
    });
  await page
    .getByRole("searchbox", { name: "Search your items" })
    .fill("no-such-item-987654321");
  await expect(page.locator(".waste-empty")).toContainText("No items match");
  await page
    .getByRole("button", { name: "Clear all", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Owned assets", exact: true }).click();
  await expect(page.locator(".waste-item-card").first()).toBeVisible();
  await page.locator(".waste-item-card h2 a").first().click();
  await expect(page.locator(".waste-detail h1")).toBeVisible();
  await expect(page).toHaveURL(/\/account\/assets\//);
  const assetCode = new URL(page.url()).pathname.split("/").at(-1);
  if (
    await page
      .getByRole("button", { name: "List for trade", exact: true })
      .count()
  ) {
    await page
      .getByRole("button", { name: "List for trade", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Price in reward points",
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  const gift = page.getByRole("button", {
    name: "Gift this asset",
    exact: true,
  });
  if (await gift.count()) {
    await gift.click();
    await expect(
      page.getByRole("dialog").getByLabel("Recipient email"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/mobile?asset=" + assetCode);
  await expect(page.locator(".waste-detail h1")).toBeVisible();
  await expect(page.locator(".mobile-tabs")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: out + "/detail-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Your items", exact: true }).click();
  await expect(page.locator(".waste-item-card").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(page.locator(".waste-item-card img").first()).toBeVisible();
  const searchBounds = await page
    .getByRole("searchbox", { name: "Search your items" })
    .boundingBox();
  const labelBounds = await page.locator(".waste-search").boundingBox();
  expect(searchBounds.y + searchBounds.height).toBeLessThanOrEqual(
    labelBounds.y + labelBounds.height + 1,
  );
  await page.screenshot({ path: out + "/listing-mobile.png", fullPage: true });
  await page.locator(".waste-quick-trigger").first().click();
  await expect(
    page.getByRole("dialog", { name: "Quick view" }).locator("h1"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Quick view" })
      .locator(".waste-gallery-image img"),
  ).toBeVisible();
  await page.screenshot({ path: out + "/quick-view-mobile.png" });
  await page
    .getByRole("dialog", { name: "Quick view" })
    .getByRole("button", { name: "Close dialog" })
    .click();
  await page.locator(".header-actions").getByRole("link", { name: "Updates", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  const mobileUpdates = page.getByRole("dialog", { name: "Your updates" });
  await expect(
    mobileUpdates.locator(".customer-update-item").first(),
  ).toBeVisible();
  await expect(mobileUpdates).not.toContainText("WST_");
  await page.screenshot({ path: out + "/updates-mobile.png" });
  await mobileUpdates
    .getByRole("link", { name: "View item details" })
    .first()
    .click();
  await expect(page.locator(".waste-detail h1")).toBeVisible();
  await expect(page).toHaveURL(/\/mobile\?.*submission=/);
  expect(errors).toEqual([]);
  console.log(
    "PASS live owner listing, status and text filters, quick view, direct detail/reload, specifications/history, assets, mobile asset deep link and layout.",
  );
} catch (error) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
