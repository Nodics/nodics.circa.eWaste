/** Read-only account navigation checks; never bids, reveals coupons, or submits orders. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600";
const output = "/tmp/circa-dashboard";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base + "/account");
  await page
    .getByRole("button", { name: /^Sign in/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Email address")
    .fill(process.env.CIRCA_CUSTOMER_LOGIN || "customer@circa.local");
  await dialog
    .getByLabel("Password", { exact: true })
    .fill(process.env.CIRCA_CUSTOMER_PASSWORD || "CircaDemo!2026");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.locator(".dashboard-donut")).toBeVisible();
  await expect(page.locator(".dashboard-metric")).toHaveCount(4);
  await expect(
    page.locator(".dashboard-metric > strong", { hasText: "—" }),
  ).toHaveCount(0);
  await expect(page.locator(".waste-workspace")).toHaveCount(0);
  await page.locator(".dashboard-recent").scrollIntoViewIfNeeded();
  await expect(
    page.locator(".dashboard-recent .private-photo-loading"),
  ).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: output + "/desktop.png", fullPage: true });
  await page.getByRole("link", { name: "View all submissions" }).click();
  await expect(page).toHaveURL(/\/account\/items\?/);
  await expect(page.locator(".waste-banner h1")).toBeVisible();
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.locator(".dashboard-donut")).toBeVisible();
  await page.getByRole("link", { name: /^Reward points/ }).click();
  await expect(page).toHaveURL(base + "/account/wallet");
  await expect(
    page.getByRole("heading", { name: "Transaction history" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".dashboard-donut")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: output + `/web-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(base + "/mobile?account=overview&tgWebAppVersion=8.0#launch");
  await expect(page.locator(".dashboard-donut")).toBeVisible();
  expect(
    await page
      .locator(".account-dashboard")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: output + "/mobile.png", fullPage: true });
  await page
    .locator(".dashboard-metric")
    .filter({ hasText: "In review" })
    .click();
  await expect(page.locator(".waste-banner h1")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("status")).toBe("PENDING");
  expect(new URL(page.url()).searchParams.get("tgWebAppVersion")).toBe("8.0");
  expect(new URL(page.url()).hash).toBe("#launch");
  await page.goBack();
  await expect(page.locator(".dashboard-donut")).toBeVisible();
  await page
    .locator(".dashboard-charts")
    .screenshot({ path: output + "/mobile-charts.png" });
  await page.getByRole("link", { name: /^Reward points/ }).click();
  await expect(
    page.getByRole("heading", { name: "Transaction history" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your wallet", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/account?view=drafts");
  await expect(page).toHaveURL(base + "/account/items?view=drafts");
  await expect(page.locator(".waste-banner h1")).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "PASS dashboard cards, charts, wallet drill-down, legacy links, desktop/mobile filters and back navigation, reload, host context, and responsive layouts.",
  );
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  console.log(page.url(), await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
