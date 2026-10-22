import { afterEach, expect, it, vi } from "vitest";
import { request } from "../../api";
import {
  carbonComponent,
  certificateComponent,
  createManifest,
  listingTerms,
  readCarbonHoldings,
  submitIntent,
  withinAvailable,
} from "./bundleClient";
import {
  carbonPage,
  certificate,
  digest,
  giftReceipt,
  intent,
  listingContext,
  lot,
  manifestCode,
  manifestReceipt,
  ownerRef,
  publishedReceipt,
  session,
} from "./bundleFixtures";
vi.mock("../../api", () => ({ request: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("reads canonical Carbon with page only and never uses reward or prospective balances", async () => {
  vi.mocked(request).mockResolvedValue(carbonPage);
  const controller = new AbortController();
  const result = await readCarbonHoldings(
    session,
    ownerRef,
    1,
    controller.signal,
  );
  expect(request).toHaveBeenCalledWith(
    "/nodics/wasteCarbon/v0/carbon/holdings",
    session,
    { page: 1 },
    "POST",
    { signal: controller.signal },
  );
  expect(carbonComponent(result.items[0]!, "3.125")).toEqual({
    kind: "REALIZED_CARBON",
    reference: {
      module: "wasteCarbon",
      schema: "wasteCarbonLot",
      code: lot.lotCode,
    },
    quantity: "3.125",
    expectedRevision: 4,
    unitOfMeasure: "tCO2e",
  });
  expect(() => carbonComponent(result.items[0]!, "4.125")).toThrow();
  expect(() =>
    carbonComponent({ ...result.items[0]!, state: "PROSPECTIVE" }, "1"),
  ).toThrow();
});
it.each([
  { ...carbonPage, ownerRef: { ...ownerRef, code: "foreign" } },
  { ...carbonPage, items: [lot, lot], total: 2 },
  { ...carbonPage, total: 2 },
  { ...carbonPage, items: [{ ...lot, available: 3.125 }] },
  { ...carbonPage, items: [{ ...lot, scale: -1 }] },
  { ...carbonPage, items: [{ ...lot, transferable: true }] },
])("rejects inconsistent Carbon owner snapshots", async (raw) => {
  vi.mocked(request).mockResolvedValue(raw);
  await expect(readCarbonHoldings(session, ownerRef, 1)).rejects.toThrow();
});
it("preserves exact decimals beyond floating-point precision and rejects excess scale", () => {
  expect(
    withinAvailable("9007199254740993.001", "9007199254740993.002", 3),
  ).toBe(true);
  expect(
    withinAvailable("9007199254740993.003", "9007199254740993.002", 3),
  ).toBe(false);
  expect(() => withinAvailable("0.0011", "1", 3)).toThrow();
  expect(withinAvailable("0.000", "1", 3)).toBe(false);
});
it("uses owner-projected precision without copied caps or scale-sized allocations", async () => {
  vi.mocked(request).mockResolvedValue({
    ...carbonPage,
    items: [{ ...lot, scale: 9, available: "1.000000001" }],
  });
  const result = await readCarbonHoldings(session, ownerRef, 1);
  expect(result.items[0]!.scale).toBe(9);
  expect(carbonComponent(result.items[0]!, "1.000000001").quantity).toBe(
    "1.000000001",
  );
  expect(withinAvailable("1.2", "1.20", Number.MAX_SAFE_INTEGER)).toBe(true);
  expect(withinAvailable("1.21", "1.2", 2)).toBe(false);
  expect(withinAvailable("10", "9.99", 2)).toBe(false);
  expect(withinAvailable("9.99", "10", 2)).toBe(true);
});
it("does not invent listing policy limits, precision defaults or governed selections", () => {
  const selected = {
    ...listingContext,
    reward: { ...listingContext.reward, scale: 20 },
  };
  const name = "A".repeat(181),
    amount = "1234567890123456789012345678901234567890.00000000000000000001";
  expect(listingTerms(selected, "FIXED", name, amount, "", "")).toMatchObject({
    name,
    amount,
    reward: selected.reward,
  });
  expect(() =>
    listingTerms(
      {
        ...selected,
        reward: { ...selected.reward, scale: undefined as never },
      },
      "FIXED",
      name,
      "1",
      "",
      "",
    ),
  ).toThrow();
});
it("projects shared certificate selection without copied labels or arbitrary component authority", () => {
  expect(certificateComponent(certificate)).toEqual(
    intent.manifest.components[0],
  );
  expect(() =>
    certificateComponent({ ...certificate, revision: -1 }),
  ).toThrow();
});
it("retains explicit governed listing selections and nullable dates without local defaults", () => {
  expect(
    listingTerms(listingContext, "FIXED", "Package", "12.30", "", ""),
  ).toEqual({
    ...listingContext,
    saleMode: "FIXED",
    name: "Package",
    amount: "12.30",
    startsAt: null,
    endsAt: null,
  });
  expect(() =>
    listingTerms(listingContext, "AUCTION", "Package", "12.301", "", ""),
  ).toThrow();
  expect(() =>
    listingTerms(
      listingContext,
      "FIXED",
      "Package",
      "1",
      "2026-10-22T10:00",
      "2026-10-21T10:00",
    ),
  ).toThrow();
  expect(() =>
    listingTerms(
      listingContext,
      "FIXED",
      "Package",
      "1",
      "2026-02-30T10:00",
      "",
    ),
  ).toThrow();
  expect(() =>
    listingTerms(
      {
        ...listingContext,
        reward: { ...listingContext.reward, programCode: "" },
      },
      "FIXED",
      "Package",
      "1",
      "",
      "",
    ),
  ).toThrow();
});
it("verifies original manifest identity, exact components and retained receipt", async () => {
  vi.mocked(request).mockResolvedValue(manifestReceipt(intent.manifest));
  expect(await createManifest(session, intent.manifest)).toEqual({
    code: manifestCode,
    revision: 0,
    digest,
  });
  expect(request).toHaveBeenCalledWith(
    "/nodics/digitalCore/v0/bundles",
    session,
    intent.manifest,
  );
  for (const patch of [
    { acknowledged: true },
    { ...manifestReceipt(intent.manifest), idempotencyKey: "foreign" },
    {
      ...manifestReceipt(intent.manifest),
      ownerRef: { ...ownerRef, code: "foreign" },
    },
    { ...manifestReceipt(intent.manifest), components: [] },
  ]) {
    vi.mocked(request).mockResolvedValue(patch);
    await expect(createManifest(session, intent.manifest)).rejects.toThrow();
  }
});
it("gifting sends the exact original manifest and recipient with no sale or payment fields", async () => {
  vi.mocked(request).mockImplementation(async (_path, _session, body) =>
    giftReceipt(body as Record<string, unknown>),
  );
  const outcome = await submitIntent(session, intent, {
    code: manifestCode,
    revision: 0,
    digest,
  });
  expect(outcome.status).toBe("PENDING");
  expect(request).toHaveBeenCalledWith(
    "/nodics/digitalCore/v0/gifts",
    session,
    {
      manifestCode,
      manifestRevision: 0,
      idempotencyKey: intent.operationKey,
      confirmed: true,
      recipientRef: intent.recipientRef,
    },
  );
  vi.mocked(request).mockResolvedValue({
    ...giftReceipt({}),
    status: "RESERVING",
  });
  await expect(
    submitIntent(session, intent, { code: manifestCode, revision: 0, digest }),
  ).rejects.toThrow();
});
it.each(["FIXED", "AUCTION"] as const)(
  "publishes %s only through Digital and requires actual publication evidence",
  async (mode) => {
    const sale = {
      manifest: intent.manifest,
      operationKey: intent.operationKey,
      mode,
      terms: listingTerms(listingContext, mode, "Package", "12.30", "", ""),
    };
    vi.mocked(request).mockImplementation(async (_path, _session, body) =>
      publishedReceipt(body as Record<string, unknown>),
    );
    expect(
      (
        await submitIntent(session, sale, {
          code: manifestCode,
          revision: 0,
          digest,
        })
      ).status,
    ).toBe("PUBLISHED");
    expect(vi.mocked(request).mock.calls[0]![0]).toBe(
      "/nodics/digitalCore/v0/bundle-listings",
    );
    vi.mocked(request).mockResolvedValue({
      ...publishedReceipt(sale.terms),
      confirmed: false,
    });
    await expect(
      submitIntent(session, sale, { code: manifestCode, revision: 0, digest }),
    ).rejects.toThrow();
    if (mode === "AUCTION") {
      vi.mocked(request).mockResolvedValue({
        ...publishedReceipt(sale.terms),
        auction: { roundCode: "foreign", storeCode: "foreign" },
      });
      await expect(
        submitIntent(session, sale, {
          code: manifestCode,
          revision: 0,
          digest,
        }),
      ).rejects.toThrow();
    }
  },
);
