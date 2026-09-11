/** Validates assessment actions through the actual Axis browser with local QA identities. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
const output = process.env.CIRCA_EVIDENCE_DIR || "/tmp/warm-assessments/live";
const { code } = JSON.parse(fs.readFileSync(output + "/session.json"));
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const [loginId, action] of [
    ["verifier@circa.local", "ASSESS"],
    ["approver@circa.local", "SELECT"],
  ]) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      }),
      page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(40000);
    await page.goto("http://localhost:3100/waste/assets/submissions");
    await page.locator('input[name="loginId"]').fill(loginId);
    await page.locator('input[name="password"]').fill("CircaDemo!2026");
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('input[name="loginId"]')).toHaveCount(0);
    await page.goto("http://localhost:3100/waste/assets/submissions");
    const status = page.getByRole("combobox", { name: /status/i });
    await status.click();
    await page.getByRole("option", { name: /^All/ }).click();
    await page.getByRole("textbox", { name: /Search submissions/i }).fill(code);
    await page
      .getByRole("textbox", { name: /Search submissions/i })
      .press("Enter");
    await page
      .getByRole("button", {
        name: "Open details: LOCAL QA — WARM assessment reference image",
        exact: true,
      })
      .click();
    const section = page.getByRole("region", { name: "Impact assessments" });
    await expect(section.getByText(/Assessment history/)).toBeVisible();
    if (action === "ASSESS") {
      await expect(
        section.getByRole("button", {
          name: "Accept this assessment",
          exact: true,
        }),
      ).toHaveCount(0);
      await section
        .getByRole("button", { name: "Calculate new assessment", exact: true })
        .click();
    } else {
      await expect(
        section.getByRole("button", {
          name: "Calculate new assessment",
          exact: true,
        }),
      ).toHaveCount(0);
      await section
        .getByRole("button", { name: "Accept this assessment", exact: true })
        .first()
        .click();
    }
    const confirmation = page.getByRole("dialog", {
      name: "Confirm assessment action",
      exact: true,
    });
    await expect(
      confirmation.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeDisabled();
    await confirmation
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill(
        "Local QA: " +
          action.toLowerCase() +
          " the independently saved assessment through Axis.",
      );
    await confirmation
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(section.getByRole("alert")).toContainText(
      action === "ASSESS" ? "Assessment saved" : "Accepted assessment updated",
    );
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: output + "/axis-" + action.toLowerCase() + "-desktop.png",
    });
    if (action === "SELECT") {
      await page.setViewportSize({ width: 390, height: 844 });
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + "/axis-assessment-mobile.png" });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    console.log(
      "PASS Axis role-scoped " +
        action +
        " with reason, confirmation and saved history",
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  const pages = browser.contexts().flatMap((c) => c.pages());
  if (pages.length) {
    await pages.at(-1).screenshot({ path: output + "/axis-failure.png" });
    console.error(
      (await pages.at(-1).locator("body").innerText()).slice(-1800),
    );
  }
  throw error;
} finally {
  await browser.close();
}
