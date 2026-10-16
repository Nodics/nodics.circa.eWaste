/** Read-only customer workspace acceptance against the local sample account. Commands are previewed and cancelled. */
import { chromium, expect as playwrightExpect } from "@playwright/test";
import fs from "node:fs/promises";
import { installReadOnlyGuard } from "./support/read-only-guard.mjs";
const expect = playwrightExpect.configure({ timeout: 60000 });
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600",
  out = process.env.CIRCA_WORKSPACE_EVIDENCE || "/tmp/circa-workspace";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" }),
  errors = [];
const verifyReadOnly = await installReadOnlyGuard(page.context(), base);
const observations = { submissionNotification: "NOT_EXERCISED_RETAINED_DATA" };
let matchingSubmissionNotices = null;
let inboxRequest = null;
const inboxCounts = { desktop: null, mobile: null };
const isInbox = request => request.method() === "GET" && new URL(request.url()).pathname === "/nodics/commsApi/v0/customer/communications";
page.on("request", request => {
  if (isInbox(request)) {
    inboxRequest = request;
    matchingSubmissionNotices = null;
  }
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", async (response) => {
  if (response.status() === 200 && response.request() === inboxRequest) {
    let messages = await response.json().catch(() => null);
    for (let i = 0; i < 6 && messages && !Array.isArray(messages); i++) {
      if (messages.success === false || String(messages.code || "").startsWith("ERR_")) { messages = null; break; }
      if (messages.data !== undefined) messages = messages.data;
      else if (messages.result !== undefined) messages = messages.result;
      else break;
    }
    if (response.request() === inboxRequest && Array.isArray(messages))
      matchingSubmissionNotices = messages.filter(message => message.source?.module === "eWaste" &&
        message.source.type === "wasteSubmission" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(message.source.code)).length;
  }
  if (response.status() >= 400 && response.url().includes("/nodics/")) {
    const result = await response.json().catch(() => null);
    const code = typeof result?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(result.code) ? result.code : "UNKNOWN";
    console.log("HTTP", response.status(), new URL(response.url()).pathname, code);
  }
});
const inboxReady = async (dialog, host) => {
  await expect(dialog).toBeVisible();
  await expect.poll(() => matchingSubmissionNotices !== null).toBe(true);
  await expect(dialog.getByRole("button", { name: "Check for updates", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  inboxCounts[host] = matchingSubmissionNotices;
  await expect(dialog.locator(".customer-update-item")).toHaveCount(inboxCounts[host]);
  await expect.poll(() => dialog.locator(".customer-update,.customer-updates-empty").count()).toBeGreaterThan(0);
};
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
    page.locator(".account-page > .waste-workspace"),
  ).toBeVisible();
  await expect(page.locator(".account-page > .page-heading")).toHaveCount(0);
  await expect(page.getByText("Review updates", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: out + "/banner-first.png" });
  matchingSubmissionNotices = null;
  inboxRequest = null;
  await page.locator(".header-actions").getByRole("link", { name: "Updates", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  const updates = page.getByRole("dialog", { name: "Your updates" });
  await inboxReady(updates, "desktop");
  await expect(updates).not.toContainText("http://localhost");
  await expect(updates).not.toContainText("WST_");
  await expect(updates).not.toContainText("Reviewer comment:");
  if (matchingSubmissionNotices > 0) {
    await expect(updates.locator(".customer-update-photo img").first()).toBeVisible();
    observations.submissionNotification = "ENRICHED_NOTIFICATION_EXERCISED";
  } else {
    expect(await updates.locator(".customer-update,.customer-updates-empty").count()).toBeGreaterThan(0);
  }
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
  const labelBounds = await page.locator(".waste-toolbar .listing-search").boundingBox();
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
  matchingSubmissionNotices = null;
  inboxRequest = null;
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  const mobileUpdates = page.getByRole("dialog", { name: "Your updates" });
  await inboxReady(mobileUpdates, "mobile");
  await expect(mobileUpdates).not.toContainText("WST_");
  await page.screenshot({ path: out + "/updates-mobile.png" });
  const updateDetail = mobileUpdates.getByRole("link", { name: "View item details" }).first();
  if (inboxCounts.mobile > 0) {
    await updateDetail.click();
    await expect(page.locator(".waste-detail h1")).toBeVisible();
    await expect(page).toHaveURL(/\/mobile\?.*submission=/);
    observations.submissionNotification = "ENRICHED_NOTIFICATION_EXERCISED";
  } else {
    expect(await mobileUpdates.locator(".customer-update,.customer-updates-empty").count()).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
  verifyReadOnly();
  await fs.writeFile(out + "/result.json", JSON.stringify({ passed: true, observations, matchingSubmissionNotices, inboxCounts, businessWrites: 0 }, null, 2) + "\n");
  console.log(
    "PASS live owner listing, status and text filters, quick view, direct detail/reload, specifications/history, assets, mobile asset deep link and layout.",
  );
} catch (error) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
