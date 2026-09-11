/** Read-only checks of saved media on every customer page, including SVG sample artwork. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600";
const out = process.env.CIRCA_PHOTO_EVIDENCE || "/tmp/circa-photos";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
let authorization;
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => { if (response.status() >= 400 && response.url().includes("/nodics/")) console.log("HTTP", response.status(), new URL(response.url()).pathname); });
page.on("request", request => {
  if (request.url().includes("/eWaste/") && request.headers().authorization)
    authorization = request.headers().authorization;
});
const unwrap = input => {
  for (let n = 0; n < 6 && input && !Array.isArray(input); n++) {
    if (input.data !== undefined) input = input.data;
    else if (input.result !== undefined) input = input.result;
    else break;
  }
  return input;
};
const loaded = async image => {
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
};
try {
  await page.goto(base + "/account/items");
  await page.getByRole("button", { name: /^Sign in/ }).first().click();
  const auth = page.getByRole("dialog");
  await auth.getByLabel("Email address").fill(process.env.CIRCA_CUSTOMER_LOGIN || "customer@circa.local");
  await auth.getByLabel("Password", { exact: true }).fill(process.env.CIRCA_CUSTOMER_PASSWORD || "CircaDemo!2026");
  await auth.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".waste-item-card").first()).toBeVisible();
  const collections = {};
  for (const view of ["submissions", "drafts", "assets"]) {
    const records = [];
    let total = Infinity;
    for (let number = 1; records.length < total; number++) {
      const response = await page.request.get(`${base}/nodics/eWaste/v0/account/items?view=${view}&limit=48&page=${number}`, {
        headers: { Authorization: authorization, "x-enterprise-code": "default" },
      });
      expect(response.ok()).toBe(true);
      const data = unwrap(await response.json());
      expect(Array.isArray(data.items)).toBe(true);
      records.push(...data.items);
      total = data.total;
    }
    collections[view] = records;
    for (let number = 1; number <= Math.ceil(records.length / 12); number++) {
      await page.goto(`${base}/account/items?view=${view}&page=${number}`);
      const expected = records.slice((number - 1) * 12, number * 12);
      const cards = page.locator(view === "drafts" ? ".waste-draft-card" : ".waste-item-card");
      await expect(cards).toHaveCount(expected.length);
      for (const [index, item] of expected.entries()) {
        const card = cards.nth(index);
        if (item.photo?.code || item.photo?.url) await loaded(card.locator("img"));
        else if (view === "drafts") await expect(card.locator("img")).toHaveCount(0);
        else await expect(card.locator(".waste-photo-empty")).toContainText("No photo yet");
      }
      await expect(page.locator(".private-photo-status")).toHaveCount(0);
      await page.screenshot({ path: `${out}/${view}-${number}.png`, fullPage: true });
    }
  }
  const sample = collections.assets.find(item => item.photo?.code?.startsWith("circa-asset-"));
  expect(sample).toBeTruthy();
  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.goto(base + (mobile ? "/mobile?view=assets" : "/account/items?view=assets"));
    const card = page.locator(".waste-item-card").filter({ has: page.getByRole("heading", { name: sample.descriptor.identity.name, exact: true }) });
    await loaded(card.locator("img"));
    await card.getByRole("button", { name: /^Quick view:/ }).click();
    await loaded(page.getByRole("dialog", { name: "Quick view" }).locator(".waste-gallery-image img"));
    await page.screenshot({ path: `${out}/quick-${mobile ? "mobile" : "desktop"}.png` });
    await page.getByRole("button", { name: "Open full details" }).click();
    await loaded(page.locator(".waste-gallery-image img"));
    await page.screenshot({ path: `${out}/detail-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  console.log("PASS all saved photos across", collections.submissions.length, "submissions,", collections.drafts.length, "drafts and", collections.assets.length, "owned assets; SVG quick view and detail on desktop and shared mobile.");
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  console.log("Failed page", page.url(), await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
