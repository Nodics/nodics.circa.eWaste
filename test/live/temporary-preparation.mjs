/** Live rejection/exit checks: no fixture submissions or Media are created. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.CIRCA_SITE_URL || "http://localhost:3600";
const out = "/tmp/circa-preparation";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["geolocation"] });
const page = await context.newPage();
let authorization;
page.on("request", request => { if (request.url().includes("/eWaste/") && request.headers().authorization) authorization = request.headers().authorization; });
page.on("response", async response => {
  if (response.url().endsWith("/arrival")) {
    const value = unwrap(await response.json());
    console.log("Arrival", {status:response.status(), nextAction:value.nextAction, centre:value.selectedCentre?.code, count:value.centres?.length});
  }
});
const unwrap = input => { for (let i=0;i<6 && input && !Array.isArray(input);i++) { if(input.data!==undefined) input=input.data; else if(input.result!==undefined) input=input.result; else break; } return input; };
try {
  await page.goto(base + "/account/items");
  await page.getByRole("button", { name: /^Sign in/ }).first().click();
  const auth = page.getByRole("dialog");
  await auth.getByLabel("Email address").fill(process.env.CIRCA_CUSTOMER_LOGIN || "customer@circa.local");
  await auth.getByLabel("Password", { exact:true }).fill(process.env.CIRCA_CUSTOMER_PASSWORD || "CircaDemo!2026");
  await auth.getByRole("button", { name:"Sign in",exact:true }).click();
  await expect(page.locator(".waste-item-card").first()).toBeVisible();
  const headers = { Authorization: authorization, "x-enterprise-code":"default" };
  const list = async view => unwrap(await (await page.request.get(`${base}/nodics/eWaste/v0/account/items?view=${view}&limit=48`, {headers})).json());
  const before = { submissions: await list("submissions"), drafts: await list("drafts"), assets: await list("assets") };
  const unfinished = ["DRAFT","MEDIA_STAGED","METADATA_SUGGESTED","AWAITING_SUBMITTER_CONFIRMATION"];
  expect(before.submissions.items.every(item => !unfinished.includes(item.status.code))).toBe(true);
  expect(before.drafts.items.every(item => unfinished.includes(item.status.code))).toBe(true);
  const experience = unwrap(await (await page.request.get(base + "/nodics/circa.ewaste/v0/experience",{headers})).json());
  const centre = experience.centres.find(item => item.location?.status === "ACTIVE");
  expect(centre).toBeTruthy();
  await context.setGeolocation({ latitude:centre.location.latitude, longitude:centre.location.longitude, accuracy:5 });
  for (const mobile of [false,true]) {
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
    await page.goto(base + (mobile?"/mobile?view=drafts":"/account/items?view=drafts"));
    await expect(page.getByText("Pick up where you left off")).toBeVisible();
    await expect(page.locator(".waste-item-card")).toHaveCount(0);
    await expect(page.locator(".waste-draft-card")).toHaveCount(Math.min(12,before.drafts.total));
    await expect(page.locator(".waste-draft-card .private-photo-status").filter({hasText:"Loading item photo…"})).toHaveCount(0);
    await page.screenshot({path:`${out}/drafts-${mobile?"mobile":"desktop"}.png`,fullPage:true});
    if (mobile) {
      await page.getByRole("button",{name:"Home",exact:true}).click();
      await page.getByRole("button",{name:"Recycle an item",exact:true}).click();
    }
    else await page.getByRole("button",{name:"Submit Waste",exact:true}).first().click();
    await expect(page.getByLabel("Item photo",{exact:true})).toBeAttached({timeout:20000});
    await page.goto(base + (mobile?"/mobile?view=drafts":"/account/items?view=drafts"));
    await expect(page.getByText("Pick up where you left off")).toBeVisible();
  }
  const position = {latitude:centre.location.latitude,longitude:centre.location.longitude,accuracy:5,capturedAt:Date.now()};
  const old = await page.request.post(base + "/nodics/eWaste/v0/submissions", {headers,data:{idempotencyKey:"must-not-create-empty"}});
  expect(old.ok()).toBe(false);
  expect(unwrap(await old.json()).code).toBe("ERR_WASTE_EVIDENCE_REQUIRED");
  const invalid = await page.request.post(base + "/nodics/eWaste/v0/submissions/prepare", {headers,data:{idempotencyKey:"must-not-save-invalid-photo",position,collectionPointCode:centre.code,photo:{mimeType:"text/html",contentBase64:"aW52YWxpZA=="}}});
  expect(invalid.ok()).toBe(false);
  for (const view of ["submissions","drafts","assets"]) expect((await list(view)).total).toBe(before[view].total);
  console.log("PASS separate draft collections on desktop/mobile; location-only exit, early creation and invalid photo leave all record counts unchanged.");
} catch (error) {
  await page.screenshot({path:out+"/failure.png",fullPage:true});
  console.log(page.url(),await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
