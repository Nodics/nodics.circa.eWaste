import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CarbonHoldings, MaterialEntitlements } from "./CarbonHoldings";
import { request } from "./api";

vi.mock("./api", () => ({ request: vi.fn() }));
const session = { token: "owner-token", loginId: "login-not-owner" };
const CARBON = "/nodics/wasteCarbon/v0/carbon/holdings";
const MATERIAL = "/nodics/wasteReward/v0/waste/material-value/allocations";
const ref = (code: string, module = "registry", schema = "evidence") => ({ module, schema, code });
const ownerRef = ref("canonical-owner", "profile", "customer");
const lot = {
  lotCode: "LOT-ISSUED", revision: 3, unitOfMeasure: "tCO2e", scale: 3, synthetic: false,
  issuanceRef: ref("issuance-99"), programRef: ref("program-v3"), state: "REALIZED",
  total: "7.125", totalSpendable: false, prospective: "2.125", realized: "5.000", reserved: "1.250", available: "3.750",
  eligibility: "NOT_CHECKED", transferable: null,
  allocationRefs: [{ allocationRef: ref("allocation-1"), contributionRef: ref("original-submission", "wasteSubmission", "wasteSubmission"), quantity: "4.000" }],
  acquisitionRefs: [{ operationKey: "bundle:component", manifestRef: ref("BUNDLE-9", "digitalCore", "digitalBundle"), quantity: "1.000",
    status: "TRANSFERRED", destinationHold: "HELD", finalizedAt: null }],
};
const allocation = {
  code: "allocation", contributionRef: ref("SUBMISSION-1", "wasteSubmission", "wasteSubmission"),
  receiptRef: ref("RECEIPT-1", "wasteReceipt", "wasteReceipt"), attributedValue: "40.00", beneficiaryValue: "20.00", rewardAmount: "60.00",
  status: "AWAITING_PAYMENT", spendableHere: false, paymentStatus: "NOT_CONFIRMED", paymentRef: null, ledgerRef: null, completedAt: null,
};
const batch = {
  batchCode: "BATCH-1", sourceLabel: "Material value", currency: "AED", currencyScale: 2, rewardScale: 2,
  synthetic: true, valuationRef: ref("valuation", "finance"), policyRef: { code: "selected-policy", version: "3" },
  programCode: "selected-program", rewardTypeCode: "points", allocations: [allocation],
};
const page = <T,>(items: T[], extra = {}) => ({ ownerRef, items, total: items.length, page: 1, limit: 50, ...extra });
const materials = () => page([batch], { source: "PERSISTED_ASSESSMENTS" });
beforeEach(() => {
  vi.mocked(request).mockImplementation(async path => path === CARBON ? page([lot]) : materials());
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it("reads direct Waste owner routes without browser owner selectors or any Loyalty request", async () => {
  render(<CarbonHoldings session={session} />);
  await screen.findByText("LOT-ISSUED");
  await screen.findByText("Awaiting recycler payment");
  expect(request).toHaveBeenCalledTimes(2);
  for (const path of [CARBON, MATERIAL]) expect(request).toHaveBeenCalledWith(path, session, { page: 1 }, "POST", { signal: expect.any(AbortSignal) });
  expect(screen.getByText("Customer: canonical-owner")).toBeInTheDocument();
  expect(screen.queryByText(/circaCarbon|Carbon units/)).toBeNull();
});

it("renders separate exact lot quantities and provenance without aggregating incompatible units", async () => {
  vi.mocked(request).mockImplementation(async path => path === CARBON ? page([lot, {
    ...lot, lotCode: "LOT-OTHER-UNIT", unitOfMeasure: "kgCO2e", available: "0.000", synthetic: true,
  }]) : materials());
  render(<CarbonHoldings session={session} />);
  const row = (await screen.findByRole("heading", { name: "Carbon holding · T-ISSUED" })).closest("article")!;
  expect(within(row).getByText("LOT-ISSUED", { selector: "code" })).toBeInTheDocument();
  for (const [label, quantity] of [["Prospective", "2.125"], ["Realized", "5.000"], ["Available (unreserved)", "3.750"],
    ["Reserved", "1.250"], ["Total (not spendable)", "7.125"]]) {
    expect(within(row).getByText(label, { selector: "dt" }).parentElement).toHaveTextContent(quantity + " tCO2e");
  }
  await userEvent.click(within(row).getByText("Provenance"));
  expect(within(row).getByText("registry/evidence/issuance-99")).toBeInTheDocument();
  expect(within(row).getByText("digitalCore/digitalBundle/BUNDLE-9")).toBeInTheDocument();
  expect(within(row).getByText("wasteSubmission/wasteSubmission/original-submission")).toBeInTheDocument();
  expect(within(row).getByText("Eligibility not checked")).toBeInTheDocument();
  expect(within(row).getByText("Held for bundle completion")).toBeInTheDocument();
  expect(within(row).queryByRole("button", { name: /sell|transfer|retire/i })).toBeNull();
  const other = screen.getByRole("heading", { name: "Carbon holding · HER-UNIT" }).closest("article")!;
  expect(within(other).getByText("LOT-OTHER-UNIT", { selector: "code" })).toBeInTheDocument();
  expect(within(other).getByText("Synthetic record")).toBeInTheDocument();
  expect(within(other).getByText("Available (unreserved)").parentElement).toHaveTextContent("0.000 kgCO2e");
});

it("keeps prospective-only records nonspendable without inventing registry eligibility", async () => {
  vi.mocked(request).mockImplementation(async path => path === CARBON ? page([{
    ...lot, state: "PROSPECTIVE", total: "7.125", prospective: "7.125", realized: "0.000", reserved: "0.000", available: "0.000",
  }]) : materials());
  render(<CarbonHoldings session={session} />);
  const row = (await screen.findByRole("heading", { name: "Carbon holding · T-ISSUED" })).closest("article")!;
  expect(within(row).getByText("LOT-ISSUED", { selector: "code" })).toBeInTheDocument();
  expect(within(row).getByText("Available (unreserved)").parentElement).toHaveTextContent("0.000");
  expect(within(row).getByText("Total (not spendable)")).toBeInTheDocument();
  expect(within(row).getByText("Eligibility not checked")).toBeInTheDocument();
});

it("renders owner-projected precision without a frontend scale ceiling", async () => {
  vi.mocked(request).mockImplementation(async path => path === CARBON
    ? page([{ ...lot, scale: 9, available: "3.750000001" }])
    : materials());
  render(<CarbonHoldings session={session} />);
  const row = (await screen.findByRole("heading", { name: "Carbon holding · T-ISSUED" })).closest("article")!;
  expect(within(row).getByText("LOT-ISSUED", { selector: "code" })).toBeInTheDocument();
  expect(within(row).getByText("Available (unreserved)").parentElement).toHaveTextContent("3.750000001 tCO2e");
});

it("keeps original contributor attribution and material payment distinct from spendable rewards", async () => {
  render(<MaterialEntitlements session={session} />);
  const row = (await screen.findByRole("heading", { name: "SUBMISSION-1" })).closest("article")!;
  expect(within(row).getByText("Attributed material value").parentElement).toHaveTextContent("40.00 AED");
  expect(within(row).getByText("Contributor entitlement").parentElement).toHaveTextContent("20.00 AED");
  expect(within(row).getByText("Calculated rewards (not a balance)").parentElement).toHaveTextContent("60.00 points");
  expect(within(row).getByText("Recycler payment not confirmed")).toBeInTheDocument();
  expect(within(row).queryByText("Loyalty entry")).toBeNull();
  expect(screen.getByText("Original customer contributor: canonical-owner")).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
});

it("shows Enterprise payment confirmed and credit pending separately, then renders only evidenced completion", async () => {
  const pending = { ...batch, allocations: [{ ...allocation, status: "CREDIT_PENDING", paymentStatus: "CONFIRMED", paymentRef: ref("payment") }] };
  vi.mocked(request).mockResolvedValueOnce(page([pending], { source: "PERSISTED_ASSESSMENTS", ownerRef: ref("enterprise", "profile", "enterprise") }));
  render(<MaterialEntitlements session={{ ...session, kind: "ENTERPRISE", enterpriseCode: "enterprise" }} />);
  await screen.findByText("Credit reconciliation pending");
  expect(screen.getByText("Original Enterprise contributor: enterprise")).toBeInTheDocument();
  expect(screen.getByText("Recycler payment confirmed")).toBeInTheDocument();
  expect(screen.queryByText("Credited in Loyalty")).toBeNull();
  const completed = { ...pending, allocations: [{ ...pending.allocations[0], status: "COMPLETED",
    ledgerRef: ref("ledger", "loyaltyLedger", "rewardLedgerEntry"), completedAt: "2026-10-18T12:00:00.000Z" }] };
  vi.mocked(request).mockResolvedValueOnce(page([completed], { source: "PERSISTED_ASSESSMENTS", ownerRef: ref("enterprise", "profile", "enterprise") }));
  await userEvent.click(screen.getByRole("button", { name: "Refresh material entitlements" }));
  await screen.findByText("Credited in Loyalty");
  expect(screen.getByText("Calculated rewards (not a balance)")).toBeInTheDocument();
  expect(screen.getByText("loyaltyLedger/rewardLedgerEntry/ledger")).toBeInTheDocument();
});

it("an owner failure keeps the other projection usable and retry repeats only the failed read", async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path === CARBON) throw Error("private server payload");
    return materials();
  });
  render(<CarbonHoldings session={session} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("private server payload")).toBeNull();
  await screen.findByText("Awaiting recycler payment");
  vi.mocked(request).mockResolvedValueOnce(page([lot]));
  await userEvent.click(screen.getByRole("button", { name: "Retry carbon holdings" }));
  await screen.findByText("LOT-ISSUED");
  expect(vi.mocked(request).mock.calls.filter(call => call[0] === MATERIAL)).toHaveLength(1);
});

it("paginates owner rows without adding identities or reloading material data", async () => {
  vi.mocked(request).mockImplementation(async (path, _session, body) => {
    if (path === MATERIAL) return materials();
    const selectedPage = (body as { page: number }).page;
    return page([{ ...lot, lotCode: selectedPage === 1 ? "LOT-1" : "LOT-2" }], { total: 2, limit: 1, page: selectedPage });
  });
  render(<CarbonHoldings session={session} />);
  await screen.findByText("LOT-1");
  expect(screen.getByRole("button", { name: "Previous carbon pages" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Next carbon pages" }));
  await screen.findByText("LOT-2");
  expect(screen.queryByText("LOT-1")).toBeNull();
  expect(screen.getByRole("button", { name: "Next carbon pages" })).toBeDisabled();
  expect(vi.mocked(request).mock.calls.filter(call => call[0] === MATERIAL)).toHaveLength(1);
});

it("shows empty states without zero-value phantom holdings or entitlement", async () => {
  vi.mocked(request).mockImplementation(async path => page([], path === MATERIAL ? { source: "PERSISTED_ASSESSMENTS" } : {}));
  render(<CarbonHoldings session={session} />);
  await screen.findByText("No carbon holdings recorded.");
  await screen.findByText("No material value entitlements recorded.");
  expect(screen.queryByText("Available (unreserved)")).toBeNull();
  expect(screen.queryByText("Calculated rewards (not a balance)")).toBeNull();
});

it("rejects malformed decimal, spendability and completed-credit evidence instead of displaying inferred values", async () => {
  vi.mocked(request).mockImplementation(async path => path === CARBON ? page([{ ...lot, available: 3.75 }]) :
    page([{ ...batch, allocations: [{ ...allocation, status: "COMPLETED" }] }], { source: "PERSISTED_ASSESSMENTS" }));
  render(<CarbonHoldings session={session} />);
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(screen.queryByText("LOT-ISSUED")).toBeNull();
  expect(screen.queryByText("Credited in Loyalty")).toBeNull();
  vi.mocked(request).mockResolvedValueOnce(page([{ ...lot, totalSpendable: true }]));
  await userEvent.click(screen.getByRole("button", { name: "Retry carbon holdings" }));
  await screen.findByText("Carbon holdings could not be loaded.");
});

it("clears previous owner data immediately and discards late results on session changes", async () => {
  let finish: (value: unknown) => void = () => {};
  vi.mocked(request).mockImplementation(path => path === CARBON ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(materials()));
  const view = render(<CarbonHoldings session={session} />);
  await screen.findByText("Awaiting recycler payment");
  const oldSignal = vi.mocked(request).mock.calls.find(call => call[0] === CARBON)![4]!.signal!;
  vi.mocked(request).mockImplementation(async path => page([], path === MATERIAL ? { source: "PERSISTED_ASSESSMENTS" } : {}));
  view.rerender(<CarbonHoldings session={{ token: "new-token", loginId: "other" }} />);
  expect(screen.queryByText("SUBMISSION-1")).toBeNull();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { finish(page([lot])); });
  await screen.findByText("No carbon holdings recorded.");
  expect(screen.queryByText("LOT-ISSUED")).toBeNull();
});

it("cancels both read signals on unmount without any mutation command", () => {
  vi.mocked(request).mockImplementation(() => new Promise(() => {}));
  const view = render(<CarbonHoldings session={session} />);
  const calls = vi.mocked(request).mock.calls;
  view.unmount();
  expect(calls).toHaveLength(2);
  for (const call of calls) expect(call[4]!.signal!.aborted).toBe(true);
});

it.each(["CUSTOMER", "ENTERPRISE"] as const)("rejects foreign Enterprise holdings for a %s session", async kind => {
  vi.mocked(request).mockImplementation(async path => page<unknown>(path === CARBON ? [lot] : [batch], {
    ownerRef: ref("foreign-enterprise", "profile", "enterprise"),
    ...(path === MATERIAL ? { source: "PERSISTED_ASSESSMENTS" } : {}),
  }));
  render(<CarbonHoldings session={{ ...session, kind, enterpriseCode: "current-enterprise" }} />);
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(screen.queryByText("LOT-ISSUED")).toBeNull();
  expect(screen.queryByText("SUBMISSION-1")).toBeNull();
});

it("retires holdings when represented Enterprise changes even with the same actor and token", async () => {
  vi.mocked(request).mockImplementation(async path => page<unknown>(path === CARBON ? [lot] : [batch], {
    ownerRef: ref("first", "profile", "enterprise"),
    ...(path === MATERIAL ? { source: "PERSISTED_ASSESSMENTS" } : {}),
  }));
  const view = render(<CarbonHoldings session={{ ...session, kind: "ENTERPRISE", enterpriseCode: "first" }} />);
  await screen.findByText("LOT-ISSUED");
  const signals = vi.mocked(request).mock.calls.map(call => call[4]!.signal!);
  vi.mocked(request).mockImplementation(async path => page([], {
    ownerRef: ref("second", "profile", "enterprise"),
    ...(path === MATERIAL ? { source: "PERSISTED_ASSESSMENTS" } : {}),
  }));
  view.rerender(<CarbonHoldings session={{ ...session, kind: "ENTERPRISE", enterpriseCode: "second" }} />);
  expect(screen.queryByText("LOT-ISSUED")).toBeNull();
  expect(screen.queryByText("SUBMISSION-1")).toBeNull();
  expect(signals.every(signal => signal.aborted)).toBe(true);
  await screen.findByText("No carbon holdings recorded.");
  await screen.findByText("Original Enterprise contributor: second");
});
