/** Runs the connected local sample through a real browser. Creates one new customer and submission; optional staff approval and listing use an explicitly supplied reviewer session file. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const output =
  process.env.CIRCA_EVIDENCE_DIR || path.join(root, "test-results/live");
fs.mkdirSync(output, { recursive: true });
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600",
  email = `journey.${Date.now()}@circa.local`,
  password = "CircaDemo!2026",
  itemName = `Live browser recycling tablet ${Date.now()}`;
fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify({email,itemName}),{mode:0o600});
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response",async response=>{if(response.status()>=400 && response.url().includes('/nodics/')){try{const data=await response.json();console.log('HTTP failure',response.status(),new URL(response.url()).pathname,data.code,data.message)}catch{}}});
page.setDefaultTimeout(30000);
function unwrap(value) {
  while (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.data !== undefined || value.result !== undefined)
  )
    value = value.data ?? value.result;
  return value;
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await dialog.getByLabel("Name", { exact: true }).fill("Journey Customer");
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Log out" }).waitFor();
  console.log("PASS Profile registration and sign-in");
  const exp = unwrap(
    await (await fetch(base + "/nodics/circa.ewaste/v0/experience")).json(),
  );
  const centre = exp.centres.find(
    (c) => c.code === (process.env.CIRCA_COLLECTION_CENTRE || "cc-dxb-01"),
  );
  if (!centre) throw Error("No located centre available");
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({
      latitude: centre.location.latitude,
      longitude: centre.location.longitude,
      accuracy: 5,
    });
  await page
    .getByRole("button", { name: "Open Submit Waste assistant" })
    .click();
  await page
    .getByRole("heading", { name: "Take a photo. We’ll identify your item." })
    .waitFor();
  if (
    await page
      .getByRole("button", { name: "Share location", exact: true })
      .count()
  )
    throw Error("Existing grant added a redundant location prompt");
  console.log("PASS granted location automatically continues to photo");
  const photo = await fetch(
    base + "/nodics/media/v0/content/circa-hero-second-life",
  );
  if (!photo.ok) throw Error("Published sample photo is unavailable");
  await page
    .getByLabel("Item photo", { exact: true })
    .setInputFiles({
      name: "sample-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(await photo.arrayBuffer()),
    });
  await Promise.race([
    page.getByRole('button',{name:'Confirm and submit',exact:true}).waitFor({timeout:150000}),
    page.getByRole('button',{name:'Enter essential details',exact:true}).waitFor({timeout:150000})
  ]);
  if(await page.getByRole('button',{name:'Enter essential details',exact:true}).isVisible()){
    await page.getByRole('button',{name:'Enter essential details',exact:true}).click();
    await page.getByLabel('Item name',{exact:true}).fill(itemName);
    await page.getByRole('button',{name:'Save correction',exact:true}).click();
    await page.getByRole('button',{name:'Confirm and submit',exact:true}).waitFor();
    console.log('PASS rejected or inconclusive analysis recovers into explicit business classification review');
  } else console.log('PASS private upload and actual Copilot photo analysis');
  await page.getByLabel("Message Circa assistant").fill("Why location?");
  await page.getByLabel("Send message", { exact: true }).click();
  await page.getByText(/Fresh location checks/).waitFor();
  await expect(
    page.getByRole("button", { name: "Confirm and submit", exact: true }),
  ).toBeEnabled();
  console.log("PASS side question preserves review readiness");
  await page.getByRole("button", { name: "Edit details or replace photo" }).click();
  await expect(page.getByLabel("Item type", {exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Quantity", {exact:true})).toHaveCount(0);
  await page.getByLabel("Item name", { exact: true }).fill(itemName);
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and submit", exact: true })
    .waitFor();
  console.log("PASS name-only customer correction automatically revalidates preview");
  await page.screenshot({ path: path.join(output, "submission-review.png") });
  await page
    .getByRole("button", { name: "Confirm and submit", exact: true })
    .click();
  await page.getByRole("heading", { name: "Submission received" }).waitFor();
  const code = (await page.locator(".receipt > small").innerText()).trim();
  console.log("PASS confirmed Waste receipt", code);
  await page.screenshot({ path: path.join(output, "submission-receipt.png") });
  await page
    .getByRole("link", { name: "View My Account", exact: true })
    .click();
  await page.getByRole("heading", { name: itemName, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: itemName, exact: true }).waitFor();
  console.log("PASS account persistence after reload");
  if (process.env.CIRCA_REVIEW_SESSION_FILE) {
    const staff = JSON.parse(
      fs.readFileSync(process.env.CIRCA_REVIEW_SESSION_FILE),
    ).token;
    const queueResponse = await fetch(base + "/nodics/eWaste/v0/reviews", {
      headers: {
        Authorization: `Bearer ${staff}`,
        "x-enterprise-code": "default",
      },
    });
    const queue = unwrap(await queueResponse.json());
    let item = queue.find((item) => item.code === code);
    if (!item) throw Error("Submitted item missing from staff queue");
    // Every employee phase takes responsibility through the owner assignment API.
    async function claim(token) {
      const response = await fetch(base + "/nodics/eWaste/v0/review-workspace/" + code + "/assignment", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "x-enterprise-code": "default", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLAIM", confirmed: true, expectedRevision: item.revision, idempotencyKey: code + ":live-claim:" + item.revision }),
      });
      if (!response.ok) throw Error("Reviewer assignment failed");
      item = unwrap(await response.json());
    }
    const contextResponse = await fetch(
      base + "/nodics/eWaste/v0/operations/context",
      {
        headers: {
          Authorization: `Bearer ${staff}`,
          "x-enterprise-code": "default",
        },
      },
    );
    if (!contextResponse.ok) throw Error("Reviewer policy unavailable");
    const policy = unwrap(await contextResponse.json());
    if (policy.requireVerification) {
      if (!process.env.CIRCA_VERIFIER_SESSION_FILE)
        throw Error(
          "Independent verification requires CIRCA_VERIFIER_SESSION_FILE",
        );
      const verifier = JSON.parse(
        fs.readFileSync(process.env.CIRCA_VERIFIER_SESSION_FILE),
      ).token;
      await claim(verifier);
      const verified = await fetch(
        base + "/nodics/eWaste/v0/reviews/" + code + "/verify",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${verifier}`,
            "x-enterprise-code": "default",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            verifiedFacts: { name: itemName, brand: "Reviewer confirmed brand", materials: [{ref:{module:"wasteMaterial",schema:"wasteMaterialType",code:"PLASTIC"}}] },
            confirmed: true,
            expectedRevision: item.revision,
            idempotencyKey: code + ":verification-proof",
          }),
        },
      );
      if (!verified.ok) throw Error("Independent verification failed");
      item = unwrap(await verified.json()).submission;
      console.log("PASS independent verification before approval");
    }
    await claim(staff);
    const response = await fetch(base + "/nodics/eWaste/v0/reviews/" + code, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staff}`,
        "x-enterprise-code": "default",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "APPROVED",
        verifiedFacts: { name: itemName },
        reason: "Local sample acceptance review",
        expectedRevision: item.revision,
        confirmed: true,
        idempotencyKey: code + ":live-proof",
      }),
    });
    const result = unwrap(await response.json());
    if (!response.ok || result.settlementStatus === "PENDING")
      throw Error("Approval settlement did not complete");
    console.log("PASS owner API approval and Loyalty settlement");
    if(result.submission?.metadata?.outcomeDelivery?.status !== 'DELIVERED')throw Error('Outcome notification did not complete');
    console.log('PASS persisted review notification delivered through Communication');
    await page.goto(base + "/account/assets/WASTE_ASSET_" + code);
    await page.getByRole('heading',{name:itemName,exact:true}).waitFor();
    await page.getByRole('tab',{name:'Specifications',exact:true}).click();
    await expect(page.getByText('Reviewer confirmed brand',{exact:true})).toBeVisible();
    await expect(page.getByText('Plastic',{exact:true})).toBeVisible();
    await page.screenshot({path:path.join(output,'reviewed-asset.png'),fullPage:true});
    console.log('PASS full customer asset descriptor preserves reviewer corrections');
    if(process.env.CIRCA_LISTING_TEST === 'true') {
    await page.getByRole("button", { name: "List for trade" }).click();
    await page
      .getByRole("spinbutton", { name: "Price in reward points" })
      .fill("12");
    await page.getByRole("button", { name: "Confirm listing" }).click();
    await page
      .getByText("Your asset is now listed at 12 reward points.", {
        exact: true,
      })
      .waitFor();
    await page.goto(base + "/shop");
    await page
      .getByRole("link", { name: `View ${itemName}`, exact: true })
      .waitFor();
    console.log("PASS new listing immediately visible in Online discovery");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("button", { name: "Expand map" }).click();
  await page.getByRole("button", { name: "Collapse map" }).click();
  await page.screenshot({
    path: path.join(output, "home-mobile.png"),
    fullPage: true,
  });
  if (await page.evaluate(() => document.body.scrollWidth > innerWidth))
    throw Error("Mobile horizontal overflow");
  if (errors.length) throw Error("Browser errors: " + errors.join("; "));
  console.log("PASS mobile layout, map continuity and no page errors");
  fs.writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        status: "PASSED",
        email,
        submissionCode: code,
        staffApproval: !!process.env.CIRCA_REVIEW_SESSION_FILE,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("FAIL", error.message);
  console.error((await page.locator("body").innerText()).slice(-1800));
  await page.screenshot({ path: path.join(output, "failure.png") });
  process.exitCode = 1;
} finally {
  await browser.close();
}
