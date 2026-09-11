/** Read-only account navigation checks; never bids, reveals coupons, or submits orders. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600";
const output = "/tmp/circa-account-nav";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base + "/account/items");
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
  await expect(page.locator(".waste-banner h1")).toBeVisible();
  await expect(
    page.locator(".purchase-history,.account-ownership-activity"),
  ).toHaveCount(0);
  await page.locator(".header-actions").getByRole("link", { name: "My Account", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.screenshot({ path: output + "/desktop-menu.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Account navigation" }),
  ).toHaveCount(0);
  for (const [label, route, heading] of [
    ["Bids", "bids", "Your bids"],
    ["Purchases & coupons", "purchases", "Your purchases & coupons"],
    ["Ownership activity", "activity", "Ownership activity"],
  ]) {
    await page.locator(".header-actions").getByRole("link", { name: "My Account", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
    await page
      .getByRole("navigation", { name: "Account navigation" })
      .getByRole("link", { name: new RegExp("^" + label) })
      .click();
    await expect(page).toHaveURL(base + "/account/" + route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      page.locator(".account-section-page [role=status]"),
    ).toHaveCount(0);
    await expect(page.locator(".waste-workspace")).toHaveCount(0);
    await expect(page.locator(".coupon-token")).toHaveCount(0);
    await page.screenshot({
      path: output + "/desktop-" + route + ".png",
      fullPage: true,
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.locator(".dashboard-welcome h1")).toBeVisible();
  await expect(page.locator(".waste-workspace")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".header-actions").getByRole("link", { name: "My Account", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  const narrowMenu = await page
    .getByRole("navigation", { name: "Account navigation" })
    .boundingBox();
  expect(narrowMenu.x).toBeGreaterThanOrEqual(0);
  expect(narrowMenu.x + narrowMenu.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: output + "/narrow-web-menu.png" });
  await page.keyboard.press("Escape");
  await page.goto(base + "/mobile?account=overview&tgWebAppVersion=8.0");
  await expect(
    page.getByRole("navigation", { name: "Dashboard shortcuts" }),
  ).toBeVisible();
  await page.screenshot({ path: output + "/mobile-menu.png" });
  for (const [label, route, heading] of [
    ["Bids", "bids", "Your bids"],
    ["Purchases & coupons", "purchases", "Your purchases & coupons"],
    ["Ownership activity", "activity", "Ownership activity"],
  ]) {
    await page
      .getByRole("navigation", { name: "Dashboard shortcuts" })
      .getByRole("link", { name: new RegExp("^" + label) })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      page.locator(".account-section-page [role=status]"),
    ).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("account")).toBe(route);
    expect(new URL(page.url()).searchParams.get("tgWebAppVersion")).toBe("8.0");
    expect(
      await page
        .locator(".account-section-page")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await expect(page.locator(".coupon-token")).toHaveCount(0);
    await page.screenshot({ path: output + "/mobile-" + route + ".png" });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to dashboard" }).click();
    await expect(
      page.getByRole("navigation", { name: "Dashboard shortcuts" }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: /^View my items/ }).click();
  await expect(page.locator(".waste-banner h1")).toBeVisible();
  await expect(
    page.locator(".purchase-history,.account-ownership-activity"),
  ).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("account")).toBe(false);
  const guest = await browser.newPage();
  await guest.goto(base + "/account/purchases");
  await expect(
    guest.getByRole("button", { name: "Sign in or register" }),
  ).toBeVisible();
  await expect(guest.locator(".purchase-history")).toHaveCount(0);
  await guest.close();
  expect(errors).toEqual([]);
  console.log(
    "PASS desktop/mobile account navigation, direct-link reload, sign-in boundary, clean item listing, private coupon codes, and responsive layouts.",
  );
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  console.log(page.url(), await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
