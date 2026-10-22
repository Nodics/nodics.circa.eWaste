import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BundleGifts, type BundleOwner } from "./BundleGifts";
import { request } from "./api";
import { pendingReferenceKey } from "./pendingReferences";
vi.mock("./api", () => ({ request: vi.fn() }));
const session = { token: "access", loginId: "participant" };
const ownerRef: BundleOwner = {
  module: "profile",
  schema: "customer",
  code: "recipient",
};
const gift = {
  code: "gift-original",
  revision: 4,
  status: "PENDING",
  decision: null,
  ownerRef: { ...ownerRef, code: "sender" },
  recipientRef: ownerRef,
  deadline: "2099-01-01T00:00:00Z",
  recoveryRequired: false,
  components: [
    {
      kind: "CERTIFICATE",
      reference: { code: "certificate-one" },
      quantity: "1",
    },
  ],
  allowedActions: ["ACCEPT", "DECLINE"],
};
const page = {
  contractVersion: 1,
  ownerRef,
  direction: "RECEIVED",
  items: [gift],
  page: 1,
  pageSize: 20,
  total: 1,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  sessionStorage.clear();
});
const recoveryKey = () =>
  pendingReferenceKey(session, "gift-decision", {
    ownerType: "CUSTOMER",
    ownerCode: ownerRef.code,
  });
it("a lost gift reply survives token refresh using only the stored original operation code", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.endsWith("/gifts/query")) return page;
    if (path.endsWith("/gifts/decision")) throw Error("Lost decision reply");
    if (path.endsWith("/gifts/inspect"))
      return {
        contractVersion: 1,
        ownerRef,
        operationCode: gift.code,
        revision: 9,
        status: "COMPLETED",
        decision: "ACCEPT",
        canResume: false,
      };
    throw Error("Unexpected request");
  });
  const user = userEvent.setup(),
    view = render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await user.click(await screen.findByRole("button", { name: "Accept gift" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByText("Lost decision reply");
  expect(JSON.parse(sessionStorage.getItem(recoveryKey())!)).toEqual({
    operationCode: gift.code,
  });
  const refreshed = { ...session, token: "refreshed" };
  view.rerender(<BundleGifts session={refreshed} ownerRef={ownerRef} />);
  await user.click(screen.getByRole("button", { name: "Check gift" }));
  await screen.findByText("Gift decision confirmed.");
  expect(request).toHaveBeenLastCalledWith(
    "/nodics/digitalCore/v0/gifts/inspect",
    refreshed,
    { ownerRef, operationCode: gift.code },
  );
  expect(
    vi
      .mocked(request)
      .mock.calls.filter((call) => call[0].endsWith("/gifts/decision")),
  ).toHaveLength(1);
  expect(sessionStorage.getItem(recoveryKey())).toBeNull();
});
it("reload recovers an exact gift outside the visible history page and only resumes a server-retained decision", async () => {
  let resumed = false;
  const status = {
    contractVersion: 1,
    ownerRef,
    operationCode: gift.code,
    revision: 7,
    status: "TRANSFERRING",
    decision: "ACCEPT",
    canResume: true,
  };
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.endsWith("/gifts/query")) return { ...page, items: [], total: 0 };
    if (path.endsWith("/gifts/inspect"))
      return resumed
        ? { ...status, status: "COMPLETED", canResume: false }
        : status;
    if (path.endsWith("/gifts/decision")) {
      resumed = true;
      return { code: gift.code, status: "COMPLETED" };
    }
    throw Error("Unexpected request");
  });
  sessionStorage.setItem(
    recoveryKey(),
    JSON.stringify({ operationCode: gift.code }),
  );
  const user = userEvent.setup(),
    refreshed = { ...session, token: "refreshed" };
  render(<BundleGifts session={refreshed} ownerRef={ownerRef} />);
  await user.click(screen.getByRole("button", { name: "Check gift" }));
  expect(
    vi
      .mocked(request)
      .mock.calls.filter((call) => call[0].endsWith("/gifts/decision")),
  ).toHaveLength(0);
  await user.click(
    await screen.findByRole("button", { name: "Continue gift decision" }),
  );
  await screen.findByText("Gift decision confirmed.");
  expect(
    vi
      .mocked(request)
      .mock.calls.find((call) => call[0].endsWith("/gifts/decision"))
      ?.slice(1),
  ).toEqual([
    refreshed,
    {
      operationCode: gift.code,
      expectedRevision: 7,
      decision: "ACCEPT",
      confirmed: true,
    },
  ]);
  expect(sessionStorage.getItem(recoveryKey())).toBeNull();
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("tab", { name: "Sent" })).toBeEnabled();
});
it("unconfirmed or foreign gift status never clears a hint or enables a different decision", async () => {
  sessionStorage.setItem(
    recoveryKey(),
    JSON.stringify({ operationCode: gift.code }),
  );
  vi.mocked(request).mockImplementation(async (path) =>
    path.endsWith("/gifts/query")
      ? page
      : {
          contractVersion: 1,
          ownerRef: { ...ownerRef, code: "foreign" },
          operationCode: gift.code,
          revision: 8,
          status: "COMPLETED",
          decision: "ACCEPT",
          canResume: false,
        },
  );
  const user = userEvent.setup();
  render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await user.click(screen.getByRole("button", { name: "Check gift" }));
  await screen.findByText("Original gift status could not be confirmed.");
  expect(
    await screen.findByRole("button", { name: "Accept gift" }),
  ).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  expect(sessionStorage.getItem(recoveryKey())).not.toBeNull();
});
it("save failure stops gift decision dispatch", async () => {
  vi.mocked(request).mockResolvedValue(page);
  const user = userEvent.setup();
  render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await user.click(await screen.findByRole("button", { name: "Accept gift" }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("denied");
  });
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByText(/Nothing new was sent/);
  expect(
    vi
      .mocked(request)
      .mock.calls.filter((call) => call[0].endsWith("/gifts/decision")),
  ).toHaveLength(0);
});

it("reviews recipient acceptance before committing exact original gift and revision", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      code: gift.code,
      status: "COMPLETED",
      evidence: { decision: "ACCEPT" },
    })
    .mockResolvedValue({
      ...page,
      items: [
        {
          ...gift,
          status: "COMPLETED",
          decision: "ACCEPT",
          allowedActions: [],
        },
      ],
    });
  const user = userEvent.setup();
  render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await user.click(await screen.findByRole("button", { name: "Accept gift" }));
  expect(request).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(
      vi
        .mocked(request)
        .mock.calls.some((call) => call[0].endsWith("/gifts/decision")),
    ).toBe(true),
  );
  expect(
    vi
      .mocked(request)
      .mock.calls.find((call) => call[0].endsWith("/gifts/decision"))?.[2],
  ).toEqual({
    operationCode: "gift-original",
    expectedRevision: 4,
    decision: "ACCEPT",
    confirmed: true,
  });
});
it("uncertain gift decisions inspect original state without resubmission", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValue({
      contractVersion: 1,
      ownerRef,
      operationCode: gift.code,
      revision: 5,
      status: "COMPLETED",
      decision: "ACCEPT",
      canResume: false,
    });
  const user = userEvent.setup();
  render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await user.click(await screen.findByRole("button", { name: "Accept gift" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByText("Response lost");
  await user.click(screen.getByRole("button", { name: "Check gift" }));
  await screen.findByText("Gift decision confirmed.");
  expect(
    vi
      .mocked(request)
      .mock.calls.filter((call) => call[0].endsWith("/gifts/decision")),
  ).toHaveLength(1);
});
it("completed or recovery-pending gifts expose no client-invented recall", async () => {
  vi.mocked(request).mockResolvedValue({
    ...page,
    items: [
      {
        ...gift,
        status: "TRANSFERRING",
        recoveryRequired: true,
        allowedActions: [],
      },
    ],
  });
  render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await screen.findByText("Transfer reconciliation pending.");
  expect(screen.queryByRole("button", { name: "Cancel gift" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept gift" })).toBeNull();
});
it("foreign owner response is not displayed", async () => {
  vi.mocked(request).mockResolvedValue({
    ...page,
    ownerRef: { ...ownerRef, code: "foreign" },
  });
  render(<BundleGifts session={session} ownerRef={ownerRef} />);
  await screen.findByText("Gift list could not be confirmed.");
  expect(screen.queryByText("Certificate: certificate-one")).toBeNull();
});
