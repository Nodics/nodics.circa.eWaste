import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
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

function view(
  quick = false,
  copy = (_key: string, fallback: string) => fallback,
) {
  render(
    <WasteDetailView
      selection={{ resource: "assets", code: "ASSET_1" }}
      session={{ token: "test", loginId: "owner" }}
      copy={copy}
      endpoint="/waste"
      onOpen={vi.fn()}
      href={() => "/account/items"}
      onContinue={vi.fn()}
      onChanged={vi.fn()}
      onBack={vi.fn()}
      quick={quick}
      sections={[
        { code: "overview", label: "Overview" },
        { code: "ownership", label: "Ownership" },
        { code: "environment", label: "Environmental impact" },
      ]}
    />,
  );
}

it("uses supplied copy for certificate labels, descriptions and empty evidence", async () => {
  view(false, (key, fallback) =>
    key.startsWith("certificate") ? `Custom ${key}` : fallback,
  );
  expect(
    await screen.findByRole("heading", { name: "Custom certificateHeading" }),
  ).toBeVisible();
  const certificate = screen.getByRole("region", {
    name: "Custom certificateEvidence",
  });
  for (const key of [
    "certificateReference",
    "certificateOwnershipStatus",
    "certificateReviewDecision",
    "certificateReviewed",
    "certificateDateMissing",
    "certificateEvidenceScope",
    "certificateHistoryMissing",
    "certificateAssessmentMissing",
    "certificateViewAssessment",
  ]) {
    expect(certificate).toHaveTextContent(`Custom ${key}`);
  }
  expect(certificate).toHaveTextContent("Owned");
});

it("routes asset trading through the canonical bundle composer", async () => {
  view();
  expect(
    await screen.findByRole("link", { name: "List for trade" }),
  ).toHaveAttribute("href", "/account/bundles?certificate=ASSET_1&mode=FIXED");
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls.some(([path]) => path.endsWith("/list"))).toBe(false);
});

it.each([false, true])(
  "promotes certificate evidence without claiming completion (quick=%s)",
  async (quick) => {
    view(quick);
    expect(
      await screen.findByRole("heading", { name: "Digital certificate" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Digital certificate evidence" }),
    ).toHaveTextContent("ASSET_1");
    expect(
      screen.getByText(
        "No dated lifecycle evidence is available for this certificate yet.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Environmental assessment not available."),
    ).toBeVisible();
    expect(
      screen.getByText(/Ownership does not confirm completed recycling/),
    ).toBeVisible();
  },
);

it("shows recorded lifecycle events and keeps rewards out of certificate transfers", async () => {
  const user = userEvent.setup();
  call.mockResolvedValue({
    ...detail,
    history: [
      {
        code: "REVIEWED",
        label: "Review recorded",
        at: "2026-10-21T12:00:00Z",
      },
    ],
  });
  view();
  expect(await screen.findByText(/Review recorded/)).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "View assessment evidence" }),
  );
  expect(
    screen.getByRole("tab", { name: "Environmental impact" }),
  ).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("tab", { name: "Ownership" }));
  expect(
    screen.getByText(
      /Reward points and carbon reward units stay with the contributor/,
    ),
  ).toBeVisible();
  expect(screen.queryByText(/units move with asset ownership/)).toBeNull();
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
  ).toHaveAttribute("href", "/account/bundles?certificate=ASSET_1&mode=GIFT");
});
