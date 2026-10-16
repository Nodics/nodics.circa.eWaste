/** Runs retained-data Web/mobile checks without repeating native financial demo commands. */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { localAcceptanceOrigin } from "./support/read-only-guard.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = localAcceptanceOrigin(process.env.CIRCA_SITE_URL || "http://localhost:3600");
const output = process.env.CIRCA_CLOSEOUT_EVIDENCE || "/tmp/circa-retained-data-closeout";
await fs.mkdir(output, { recursive: true });
const digest = value => createHash("sha256").update(value).digest("hex");
async function sourceEvidence() {
  const git = args => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error("Cannot pin browser acceptance source");
    return result.stdout;
  };
  const untracked = [];
  for (const file of git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean).sort())
    untracked.push({ path: file, sha256: digest(await fs.readFile(path.join(root, file))) });
  return { head: git(["rev-parse", "HEAD"]).trim(), trackedDiffSha256: digest(git(["diff", "--binary", "HEAD", "--", "."])), untracked };
}
const startedSource = await sourceEvidence();
const scenarios = [
  ["cms", "published-content.mjs"],
  ["catalogue", "catalogue-browsing.mjs"],
  ["account-navigation", "account-navigation.mjs"],
  ["account-dashboard", "account-dashboard.mjs"],
  ["customer-workspace", "customer-workspace.mjs"],
];
const results = [];
for (const [code, script] of scenarios) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(root, "test/live", script)], {
    cwd: root,
    env: { ...process.env, CIRCA_SITE_URL: base, CIRCA_URL: base },
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 1024 * 1024,
  });
  const passed = result.status === 0 && !result.error;
  results.push({
    code,
    status: passed ? "PASSED" : "FAILED",
    durationMs: Date.now() - started,
    ...(passed ? {} : {
      failureLocations: [...new Set((result.stderr || "").match(/test\/live\/[a-z0-9-]+\.mjs:\d+:\d+/g) || [])],
      runnerErrorCode: result.error?.code || null,
    }),
  });
  // Child assertions can contain authenticated UI; do not publish their output.
  console.log(`${passed ? "PASS" : "FAIL"}: ${code}`);
}
const finishedSource = await sourceEvidence();
const sourceUnchangedDuringRun = JSON.stringify(startedSource) === JSON.stringify(finishedSource);
const report = {
  completedAt: new Date().toISOString(),
  target: base,
  passed: sourceUnchangedDuringRun && results.every(result => result.status === "PASSED"),
  sourcePins: finishedSource,
  sourceUnchangedDuringRun,
  workingTreeMayContainChanges: true,
  scenarios: results,
  boundaries: {
    businessWritesBlocked: true,
    customerAuthenticationAllowed: true,
    nativeTelegramClientAcceptance: false,
    externalProviderAcceptance: false,
    humanUsabilityAcceptance: false,
    completedFinancialDemoReplayed: false,
    dataReset: false,
  },
};
await fs.writeFile(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`Report: ${path.join(output, "result.json")}`);
process.exitCode = report.passed ? 0 : 1;
