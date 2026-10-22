import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { RewardTransfer } from "./RewardTransfer";
import { request } from "./api";
import { pendingReferenceKey } from "./pendingReferences";
vi.mock("./api", () => ({
  request: vi.fn(),
  commandKey: () => "original-transfer",
}));
const session = { token: "source-token", loginId: "customer" };
const projection = {
  owner: { ownerType: "CUSTOMER", ownerCode: "source" },
  balances: [
    {
      programCode: "recycle",
      rewardTypeCode: "points",
      name: "Points",
      precision: 2,
      available: "20.00",
      transferEligible: true,
      transferFeeAmount: "0.00",
    },
  ],
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  sessionStorage.clear();
});
const recoveryKey = () =>
  pendingReferenceKey(session, "reward-transfer", projection.owner);
it("reload and token refresh inspect an uncertain original transfer, then allow a legitimate new transfer only after completion", async () => {
  let completed = false;
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.endsWith("/participant/wallet")) return projection;
    if (path.endsWith("/participants/search"))
      return {
        contractVersion: 1,
        items: [
          {
            ownerType: "CUSTOMER",
            ownerCode: "recipient",
            displayName: "Alex",
          },
        ],
      };
    if (path.endsWith("/reward-transfers")) throw Error("Response lost");
    if (path.endsWith("/reward-transfers/original-transfer"))
      return {
        status: completed ? "COMPLETED" : "UNCONFIRMED",
        operationCode: "receipt",
      };
    throw Error("Unexpected request");
  });
  const view = render(<RewardTransfer session={session} />),
    user = await prepare();
  await user.click(screen.getByRole("button", { name: "Confirm transfer" }));
  await screen.findByText("Response lost");
  expect(JSON.parse(sessionStorage.getItem(recoveryKey())!)).toEqual({
    operationKey: "original-transfer",
  });
  view.unmount();
  const refreshed = { ...session, token: "refreshed" };
  render(<RewardTransfer session={refreshed} />);
  await user.click(
    await screen.findByRole("button", { name: "Check transfer" }),
  );
  expect(await screen.findByText(/not yet confirmed/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "New transfer" })).toBeNull();
  expect(screen.queryByLabelText("Amount")).toBeNull();
  completed = true;
  await user.click(screen.getByRole("button", { name: "Check transfer" }));
  await screen.findByText("Transfer complete");
  expect(request).toHaveBeenLastCalledWith(
    "/nodics/loyaltyApi/v0/participant/reward-transfers/original-transfer",
    refreshed,
    undefined,
    "GET",
  );
  expect(sessionStorage.getItem(recoveryKey())).toBeNull();
  await user.click(screen.getByRole("button", { name: "New transfer" }));
  expect(await screen.findByLabelText("Amount")).toBeEnabled();
  expect(
    vi
      .mocked(request)
      .mock.calls.filter((call) => call[0].endsWith("/reward-transfers")),
  ).toHaveLength(1);
});
it("failed reference save stops the debit and malformed persisted hints cannot unlock a fresh transfer", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(projection)
    .mockResolvedValueOnce({
      contractVersion: 1,
      items: [
        { ownerType: "CUSTOMER", ownerCode: "recipient", displayName: "Alex" },
      ],
    });
  const view = render(<RewardTransfer session={session} />),
    user = await prepare();
  const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  await user.click(screen.getByRole("button", { name: "Confirm transfer" }));
  await screen.findByText(/Nothing new was sent/);
  expect(
    vi
      .mocked(request)
      .mock.calls.some((call) => call[0].endsWith("/reward-transfers")),
  ).toBe(false);
  save.mockRestore();
  view.unmount();
  sessionStorage.setItem(
    recoveryKey(),
    '{"operationKey":"original-transfer","amount":"999"}',
  );
  vi.mocked(request).mockResolvedValue(projection);
  render(<RewardTransfer session={session} />);
  await screen.findByText(/cannot be read/);
  expect(screen.queryByLabelText("Amount")).toBeNull();
});
it("another canonical owner never inherits a transfer reference even with the same actor", async () => {
  sessionStorage.setItem(
    recoveryKey(),
    JSON.stringify({ operationKey: "original-transfer" }),
  );
  vi.mocked(request).mockResolvedValue({
    ...projection,
    owner: { ...projection.owner, ownerCode: "another" },
  });
  render(<RewardTransfer session={session} />);
  expect(await screen.findByLabelText("Amount")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Check transfer" })).toBeNull();
  expect(sessionStorage.getItem(recoveryKey())).not.toBeNull();
});
/** Isolated UI preparation; the owner remains responsible for precision, eligibility and balances. */
async function prepare(ownerType = "CUSTOMER") {
  const user = userEvent.setup();
  await screen.findByRole("option", { name: /Points/ });
  await user.selectOptions(
    screen.getByLabelText("Reward balance"),
    '["recycle","points"]',
  );
  await user.selectOptions(screen.getByLabelText("Recipient type"), ownerType);
  await user.type(screen.getByLabelText("Find recipient"), "Alex");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("radio"));
  await user.type(screen.getByLabelText("Amount"), "3.25");
  await user.click(screen.getByRole("button", { name: "Review transfer" }));
  return user;
}
it("requires recipient and amount confirmation before one direct transfer", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(projection)
    .mockResolvedValueOnce({
      contractVersion: 1,
      items: [
        { ownerType: "CUSTOMER", ownerCode: "recipient", displayName: "Alex" },
      ],
    })
    .mockResolvedValueOnce({ status: "COMPLETED", operationCode: "receipt" });
  const complete = vi.fn();
  render(<RewardTransfer session={session} onComplete={complete} />);
  const user = await prepare();
  expect(
    vi
      .mocked(request)
      .mock.calls.some((call) => call[0].endsWith("/reward-transfers")),
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Confirm transfer" }));
  await screen.findByText("Transfer complete");
  expect(request).toHaveBeenLastCalledWith(
    "/nodics/loyaltyApi/v0/participant/reward-transfers",
    session,
    {
      recipient: {
        ownerType: "CUSTOMER",
        ownerCode: "recipient",
        displayName: "Alex",
      },
      programCode: "recycle",
      rewardTypeCode: "points",
      amount: "3.25",
      confirmedFeeAmount: "0.00",
      confirmed: true,
      idempotencyKey: "original-transfer",
    },
    "POST",
  );
  expect(complete).toHaveBeenCalledOnce();
});
it("uncertain outcome checks the same operation without repeating debit", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(projection)
    .mockResolvedValueOnce({
      contractVersion: 1,
      items: [
        { ownerType: "ENTERPRISE", ownerCode: "partner", displayName: "Alex" },
      ],
    })
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValueOnce({ status: "COMPLETED", operationCode: "receipt" });
  render(<RewardTransfer session={session} />);
  const user = await prepare("ENTERPRISE");
  await user.click(screen.getByRole("button", { name: "Confirm transfer" }));
  await screen.findByText("Response lost");
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check transfer" }));
  await screen.findByText("Transfer complete");
  expect(request).toHaveBeenLastCalledWith(
    "/nodics/loyaltyApi/v0/participant/reward-transfers/original-transfer",
    session,
    undefined,
    "GET",
  );
  expect(
    vi
      .mocked(request)
      .mock.calls.filter((call) => call[0].endsWith("/reward-transfers")),
  ).toHaveLength(1);
});
it("hides old recipient and amount immediately when the signed session changes", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(projection)
    .mockResolvedValueOnce({
      contractVersion: 1,
      items: [
        { ownerType: "CUSTOMER", ownerCode: "recipient", displayName: "Alex" },
      ],
    });
  const view = render(<RewardTransfer session={session} />);
  await prepare();
  vi.mocked(request).mockImplementationOnce(() => new Promise(() => {}));
  view.rerender(
    <RewardTransfer session={{ token: "new-token", loginId: "another" }} />,
  );
  expect(screen.queryByText("Alex")).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm transfer" })).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Loading"),
  );
});
it("does not offer transferring ineligible balances or invent fallback eligibility", async () => {
  vi.mocked(request).mockResolvedValueOnce({
    ...projection,
    balances: [{ ...projection.balances[0], transferEligible: false }],
  });
  render(<RewardTransfer session={session} />);
  await screen.findByText("No transferable rewards are available.");
  expect(screen.queryByLabelText("Amount")).toBeNull();
});
