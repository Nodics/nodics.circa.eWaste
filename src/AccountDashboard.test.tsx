import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AccountDashboard } from "./AccountDashboard";
import { request } from "./api";

vi.mock("./api", () => ({ API: "/nodics/eWaste/v0", request: vi.fn() }));
vi.mock("./cms", () => ({
  usePublishedPage: () => ({ page: null }),
  contentText: () => "",
  publicMedia: (value: string) => value,
}));
const session = { token: "customer-session", loginId: "customer@example.test" };
const listing = (
  total: number,
  statuses: { code: string; label: string; count: number }[],
) => ({ total, statuses, items: [] });
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  history.replaceState({}, "", "/");
});
function respond(walletFails = false) {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.endsWith("/wallet")) {
      if (walletFails) throw new Error("Wallet temporarily unavailable");
      return {
        balances: [
          { rewardTypeCode: "points", available: "1234.5" },
          { rewardTypeCode: "circaCarbon", available: "22" },
        ],
        entries: [],
      };
    }
    if (path.includes("view=assets"))
      return listing(205, [
        { code: "ALL", label: "All assets", count: 205 },
        { code: "OWNED", label: "Owned", count: 200 },
        { code: "LISTED", label: "Listed for trade", count: 5 },
      ]);
    if (path.includes("view=drafts")) return listing(7, []);
    return listing(314, [
      { code: "ALL", label: "All", count: 314 },
      { code: "PENDING", label: "Pending", count: 12 },
      { code: "APPROVED", label: "Approved", count: 300 },
      { code: "REJECTED", label: "Rejected", count: 2 },
    ]);
  });
}
it("uses complete backend counts despite an empty page and links chart filters into the item workspace", async () => {
  respond();
  render(<AccountDashboard session={session} onStart={() => {}} />);
  expect(await screen.findByText("1,234.5")).toBeInTheDocument();
  expect(screen.getByText("205")).toBeInTheDocument();
  const chart = screen.getByRole("img", {
    name: "Submission status: Pending 12, Approved 300, Rejected 2",
  });
  expect(within(chart).getByText("314")).toBeInTheDocument();
  const filter = new URL(
    screen.getByRole("link", { name: "Approved 300" }).getAttribute("href")!,
    location.origin,
  );
  expect(filter.pathname).toBe("/account/items");
  expect(filter.searchParams.get("status")).toBe("APPROVED");
  expect(filter.searchParams.get("page")).toBe("1");
});
it("keeps item summaries usable after a wallet failure and recovers with refresh", async () => {
  respond(true);
  render(<AccountDashboard session={session} onStart={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Wallet temporarily unavailable",
  );
  expect(screen.getByText("205")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Reward points/ })).toHaveTextContent(
    "—",
  );
  respond();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh dashboard" }));
  expect(await screen.findByText("1,234.5")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
