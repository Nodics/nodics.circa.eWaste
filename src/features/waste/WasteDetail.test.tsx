import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  const changed = vi.fn();
  render(
    <WasteDetailView
      selection={{ resource: "assets", code: "ASSET_1" }}
      session={{ token: "test", loginId: "owner" }}
      copy={(_, fallback) => fallback}
      endpoint="/waste"
      onOpen={vi.fn()}
      href={() => "/account/items"}
      onContinue={vi.fn()}
      onChanged={changed}
      onBack={vi.fn()}
      sections={[{ code: "overview", label: "Overview" }]}
    />,
  );
  return changed;
}

it.each(["Cancel", "Close dialog"])(
  "%s preserves the loaded asset and opener without another read",
  async (close) => {
    const user = userEvent.setup();
    view();
    const opener = await screen.findByRole("button", {
      name: "List for trade",
    });
    await user.click(opener);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: close }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Reviewed device" }),
    ).toBeVisible();
    expect(opener).toHaveFocus();
    expect(call).toHaveBeenCalledTimes(1);
  },
);

it("refreshes authoritative detail after a completed command is dismissed", async () => {
  const user = userEvent.setup();
  const changed = view();
  await user.click(
    await screen.findByRole("button", { name: "List for trade" }),
  );
  call
    .mockResolvedValueOnce({ message: "Listing requested" })
    .mockResolvedValue(detail);
  await user.type(
    screen.getByRole("spinbutton", { name: "Price in reward points" }),
    "25",
  );
  await user.click(screen.getByRole("button", { name: "Confirm listing" }));
  await screen.findByText("Listing requested");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[1]).toEqual([
    "/waste/assets/ASSET_1/list",
    { token: "test", loginId: "owner" },
    expect.objectContaining({
      expectedRevision: 7,
      confirmed: true,
      rewardPrice: 25,
    }),
  ]);
  await user.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(call).toHaveBeenCalledTimes(3));
  expect(call.mock.calls[2][0]).toBe(
    "/waste/account/items/ASSET_1?view=assets",
  );
});

it("rereads after an uncertain command failure without retrying the write", async () => {
  const user = userEvent.setup();
  const changed = view();
  await user.click(
    await screen.findByRole("button", { name: "List for trade" }),
  );
  call
    .mockRejectedValueOnce(new Error("Response unavailable"))
    .mockResolvedValue(detail);
  await user.type(
    screen.getByRole("spinbutton", { name: "Price in reward points" }),
    "25",
  );
  await user.click(screen.getByRole("button", { name: "Confirm listing" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(call).toHaveBeenCalledTimes(3));
  expect(
    call.mock.calls.filter((args) => args[0].endsWith("/list")),
  ).toHaveLength(1);
  expect(changed).not.toHaveBeenCalled();
});
