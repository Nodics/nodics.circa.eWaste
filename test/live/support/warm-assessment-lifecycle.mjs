/** Connected WARM acceptance regression for an explicitly created local QA submission. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { expect } from "@playwright/test";
export async function validateAssessmentLifecycle({
  page,
  token,
  code,
  base,
  output,
  unwrap,
}) {
  async function call(route, auth, body, { port = 4370, ok = true } = {}) {
    const response = await fetch(`http://127.0.0.1:${port}/nodics/${route}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        "x-enterprise-code": "default",
        ...(auth ? { authorization: "Bearer " + auth } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const envelope = await response.json();
    if (ok && !response.ok)
      throw Error(
        JSON.stringify({
          route,
          status: response.status,
          code: envelope.code,
          message: envelope.message,
        }),
      );
    return ok
      ? unwrap(envelope)
      : { status: response.status, code: envelope.code };
  }
  const login = async (loginId) =>
    (
      await call(
        "profile/v0/employee/authenticate",
        null,
        { loginId, password: "CircaDemo!2026" },
        { port: 4300 },
      )
    ).authToken;
  const verifier = await login("verifier@circa.local"),
    approver = await login("approver@circa.local");
  let item = await call("eWaste/v0/review-workspace/" + code, verifier);
  assert.equal(item.metadata.suggestion.provider, "openai");
  const claim = async (auth) => {
    item = await call(
      "eWaste/v0/review-workspace/" + code + "/assignment",
      auth,
      {
        action: "CLAIM",
        confirmed: true,
        expectedRevision: item.revision,
        idempotencyKey: code + ":warm-claim:" + item.revision,
      },
    );
  };
  if (
    !item.metadata.preApprovalVerificationRef &&
    item.submissionStatus !== "APPROVED"
  ) {
    await claim(verifier);
    const checked = await call(
      "eWaste/v0/reviews/" + code + "/verify",
      verifier,
      {
        verifiedFacts: {
          name: "LOCAL QA — WARM assessment reference image",
          itemTypeCode: "LAPTOP",
          weightEstimate: { min: 1, max: 3, unit: "KG" },
        },
        confirmed: true,
        expectedRevision: item.revision,
        idempotencyKey: code + ":warm-verify",
      },
    );
    item = checked.submission;
  }
  if (item.submissionStatus !== "APPROVED") {
    await claim(approver);
    const approved = await call("eWaste/v0/reviews/" + code, approver, {
      decision: "APPROVED",
      evidenceReviewed: true,
      reason:
        "Local QA only: controlled reference image and 1–3 kg test input; no physical recycling claim.",
      confirmed: true,
      expectedRevision: item.revision,
      idempotencyKey: code + ":warm-approve",
    });
    assert.notEqual(approved.settlementStatus, "PENDING");
  }
  const route = "eWaste/v0/review-workspace/" + code + "/impact-assessments";
  let history = await call(route, verifier);
  const original = structuredClone(history.acceptedAssessment);
  assert.equal(
    original.assessment.methodology.providerCode,
    "EPA_WARM_ELECTRONICS",
  );
  assert.equal(
    original.assessment.factors.factorSetVersion,
    "EPA_WARM_V16_DEC2023",
  );
  assert.equal(
    original.assessment.inputs.weightSource,
    "ESTIMATED_RANGE_MIDPOINT",
  );
  assert.equal(original.assessment.inputs.weightMinKg, 1);
  assert.equal(original.assessment.inputs.weightMaxKg, 3);
  assert.equal(original.assessment.methodology.assessmentBasis, "POTENTIAL");
  const expected = (((0.02 + 1.06) * 1000) / 907.18474) * 2;
  const value = original.assessment.indicators.find(
    (x) => x.key === "avoidedEmissions",
  ).value;
  assert(Math.abs(Number(value) - expected) < 0.000001);
  console.log(
    "PASS approved asset stores WARM source, weight bounds, factor, scenario and potential savings",
    value,
  );
  const accountRoute =
    "eWaste/v0/account/items/WASTE_ASSET_" + code + "?view=assets";
  const customerBefore = await call(accountRoute, token);
  const rewards = structuredClone(customerBefore.item.ownership);
  const walletBefore = await call("eWaste/v0/wallet", token);
  const command = {
    reason: "Local QA: create a separately retained provider assessment",
    expectedRevision: history.assetRevision,
    confirmed: true,
    idempotencyKey: code + ":warm-reassess",
  };
  const unauthorized = await call(route, token, command, { ok: false });
  assert(unauthorized.status >= 400);
  history = await call(route, verifier, command);
  assert.equal(history.acceptedAssessmentCode, original.code);
  const candidate = history.items.find((x) => x.code !== original.code);
  assert(candidate);
  assert.deepEqual(
    history.items.find((x) => x.code === original.code),
    original,
  );
  const replay = await call(route, verifier, command);
  assert.equal(replay.total, history.total);
  const stale = await call(
    route,
    verifier,
    { ...command, idempotencyKey: code + ":warm-stale" },
    { ok: false },
  );
  assert(stale.status >= 400);
  const selection = {
    reason: "Local QA: explicitly accept the saved WARM candidate",
    assessmentCode: candidate.code,
    expectedRevision: history.assetRevision,
    confirmed: true,
    idempotencyKey: code + ":warm-select",
  };
  const wrongRole = await call(route + "/selection", verifier, selection, {
    ok: false,
  });
  assert(wrongRole.status >= 400);
  history = await call(route + "/selection", approver, selection);
  assert.equal(history.acceptedAssessmentCode, candidate.code);
  assert.equal(history.selectionHistory.total, 1);
  await call(route + "/selection", approver, selection);
  const after = await call(accountRoute, token);
  assert.equal(after.impactHistory.acceptedAssessmentCode, candidate.code);
  assert.equal(after.impactHistory.total, 2);
  assert.deepEqual(after.item.ownership, rewards);
  const walletAfter = await call("eWaste/v0/wallet", token);
  assert.deepEqual(walletAfter.balances, walletBefore.balances);
  assert.deepEqual(walletAfter.entries, walletBefore.entries);
  assert.equal(
    after.item.descriptor.environment.assessment.methodology.providerCode,
    "EPA_WARM_ELECTRONICS",
  );
  console.log(
    "PASS immutable candidate, explicit acceptance, exact retry, stale revision and role enforcement; customer reward balance unchanged",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(base + "/account/assets/WASTE_ASSET_" + code);
  await page
    .getByRole("tab", { name: "Environmental impact", exact: true })
    .click();
  await expect(
    page.getByText("Potential CO₂e savings", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Assessment history", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: output + "/customer-assessment-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/customer-assessment-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  fs.writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        status: "PASS",
        submissionCode: code,
        acceptedAssessmentCode: candidate.code,
        assessmentCount: history.total,
        selectionCount: history.selectionHistory.total,
        potentialKgCO2e: value,
        weightRangeKg: [1, 3],
        provider: original.assessment.methodology,
        customerRewardsUnchanged: true,
        limitations: [
          "Controlled local QA reference image and reviewed weight range",
          "Simulated browser location",
          "Does not certify actual recycling or issue carbon credits",
        ],
      },
      null,
      2,
    ),
  );
}
