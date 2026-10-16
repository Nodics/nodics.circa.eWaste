import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountSectionPage } from "./AccountSections";
import { request, type Account } from "./api";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  request: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("renders canonical ownership event fields without inferring a completed transfer", async () => {
  const account: Account = {
    customer: { code: "customer", loginId: "customer@example.test" },
    assets: [],
    submissions: [],
    events: [
      {
        code: "created",
        assetCode: "ASSET-1",
        transferType: "CREATE",
        transferStatus: "COMPLETED",
        occurredAt: "2026-10-13T10:00:00Z",
      },
      {
        code: "pending",
        assetCode: "ASSET-2",
        transferType: "GIFT",
        transferStatus: "PENDING",
        occurredAt: "invalid-date",
      },
      { code: "unknown" },
    ],
  };
  vi.mocked(request).mockResolvedValue(account);
  render(
    <AccountSectionPage
      section="activity"
      session={{ token: "test-only", loginId: account.customer.loginId }}
    />,
  );
  const list = await screen.findByRole("list", { name: "Ownership events" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Create");
  expect(rows[0]).toHaveTextContent("ASSET-1");
  expect(rows[0]).toHaveTextContent("Completed");
  expect(rows[0].querySelector("time")).toHaveAttribute(
    "datetime",
    "2026-10-13T10:00:00.000Z",
  );
  expect(rows[1]).toHaveTextContent("Gift");
  expect(rows[1]).toHaveTextContent("Pending");
  expect(rows[1]).not.toHaveTextContent("Completed");
  expect(rows[1].querySelector("time")).toBeNull();
  expect(rows[2]).toHaveTextContent("Ownership event");
  expect(rows[2]).toHaveTextContent("Asset not specified");
  expect(rows[2]).toHaveTextContent("Status not established");
  expect(list).not.toHaveTextContent("Invalid Date");
  expect(request).toHaveBeenCalledTimes(1);
});

it("keeps empty history explicit without inventing an ownership event", async () => {
  vi.mocked(request).mockResolvedValue({
    customer: { code: "customer" },
    assets: [],
    submissions: [],
    events: [],
  });
  render(
    <AccountSectionPage
      section="activity"
      session={{ token: "test-only", loginId: "customer@example.test" }}
    />,
  );
  expect(
    await screen.findByText("No ownership changes yet"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("list", { name: "Ownership events" }),
  ).not.toBeInTheDocument();
});
