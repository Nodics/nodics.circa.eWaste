import {
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { request } from "../../api";
import { WasteDetailView } from "./WasteDetail";
import type { WasteDetail } from "./wasteTypes";

vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  request: vi.fn(),
}));

const detail: WasteDetail = {
  contractVersion: 1,
  item: {
    code: "ASSET_1",
    resource: "assets",
    revision: 7,
    descriptor: {
      contractVersion: 1,
      code: "ASSET_1",
      status: "APPROVED",
      stage: "REVIEWED",
      identity: {
        name: "Reviewed device",
        description: null,
        brand: null,
        model: null,
      },
      classification: {
        family: { code: null, name: null },
        category: { code: null, name: null },
        itemType: { code: null, name: null },
      },
      physical: {
        quantity: 1,
        size: { value: "SMALL", basis: "UNKNOWN" },
        weight: { value: null, unit: "KG", basis: "UNKNOWN" },
        weightEstimate: { min: null, max: null, unit: "KG", basis: "UNKNOWN" },
        dimensionsEstimate: null,
      },
      materials: [],
      condition: { value: "UNKNOWN", basis: "UNKNOWN" },
      environment: {
        assessment: null,
        provisional: false,
        observations: {
          recyclability: { value: "UNKNOWN", basis: "UNKNOWN" },
          contamination: { value: "UNKNOWN", basis: "UNKNOWN" },
          recoveryPotential: { value: "UNKNOWN", basis: "UNKNOWN" },
          hazards: [],
        },
      },
      review: { decision: "APPROVED", comment: null, reviewedAt: null },
    },
    status: { code: "OWNED", label: "Owned", tone: "success", group: "OWNED" },
    photo: null,
    submittedAt: null,
    reviewedAt: null,
    updatedAt: null,
    actions: [{ code: "LIST", label: "List for trade" }],
    nextStep: { title: "Owned", description: "You own this asset." },
    ownership: {
      isCurrentOwner: true,
      originalReward: null,
      rewardTypeCode: null,
      illustrativeCarbonUnits: null,
      askingPrice: null,
      settlementStatus: null,
    },
  },
  relatedAsset: null,
  sourceSubmission: null,
  collectionPoint: null,
  history: [],
};
const call = vi.mocked(request);
beforeEach(() => {
  call.mockReset();
  call.mockResolvedValue(detail);
});
afterEach(cleanup);

function view() {
  render(
    <WasteDetailView
      selection={{ resource: "assets", code: "ASSET_1" }}
      session={{ token: "test", loginId: "owner" }}
      copy={(_, fallback) => fallback}
      endpoint="/waste"
      onOpen={vi.fn()}
      href={() => "/account/items"}
      onContinue={vi.fn()}
      onChanged={vi.fn()}
      onBack={vi.fn()}
      sections={[{ code: "overview", label: "Overview" }]}
    />,
  );
}

it("routes asset trading through the canonical bundle composer", async () => {
  view();
  expect(
    await screen.findByRole("link", { name: "List for trade" }),
  ).toHaveAttribute(
    "href",
    "/account/bundles?certificate=ASSET_1&mode=FIXED",
  );
  expect(call).toHaveBeenCalledTimes(1);
  expect(
    call.mock.calls.some(([path]) => path.endsWith("/list")),
  ).toBe(false);
});

it("routes asset gifting through the canonical bundle composer", async () => {
  call.mockResolvedValue({
    ...detail,
    item: {
      ...detail.item,
      actions: [{ code: "GIFT", label: "Gift this asset" }],
    },
  });
  view();
  expect(
    await screen.findByRole("link", { name: "Gift this asset" }),
  ).toHaveAttribute(
    "href",
    "/account/bundles?certificate=ASSET_1&mode=GIFT",
  );
});
