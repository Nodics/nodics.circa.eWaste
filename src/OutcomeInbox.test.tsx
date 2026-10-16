import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomerUpdates } from "./OutcomeInbox";
import { request } from "./api";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  request: vi.fn(),
}));
const session = { loginId: "customer@example.test", token: "test-token" };
const message = {
  code: "INBOX_INTERNAL",
  createdAt: "2026-09-10T11:31:00Z",
  title: "Recycling review outcome",
  body: "Submission WST_1: APPROVED. Reviewer comment: http://localhost:3600/mobile?submission=WST_1",
  source: { module: "eWaste", type: "wasteSubmission", code: "WST_1" },
};
const item = {
  code: "WST_1",
  resource: "submissions",
  photo: null,
  status: { code: "APPROVED" },
  descriptor: { identity: { name: "My old laptop" }, review: { comment: "" } },
};
beforeEach(() => {
  vi.mocked(request).mockReset();
  history.replaceState({}, "", "/account");
});
afterEach(cleanup);
it("keeps updates out of page content until the header button is opened", async () => {
  vi.mocked(request).mockResolvedValue([]);
  render(<CustomerUpdates session={session} />);
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByText("Your updates")).not.toBeInTheDocument();
  await userEvent.hover(screen.getByRole("link", { name: "Updates" }));
  const dialog = await screen.findByRole("dialog", { name: "Your updates" });
  await within(dialog).findByText("You’re all caught up");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Close dialog" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("uses the authorized item name and clear outcome without rendering raw message text or an empty comment", async () => {
  vi.mocked(request).mockImplementation(async (path) =>
    path.includes("/customer/communications")
      ? [message]
      : { contractVersion: 1, item },
  );
  render(<CustomerUpdates session={session} />);
  await userEvent.hover(screen.getByRole("link", { name: "Updates" }));
  await screen.findByText("My old laptop");
  expect(
    screen.getByRole("heading", { name: "Your item has been approved" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View item details" }),
  ).toHaveAttribute("href", "/account/submissions/WST_1");
  expect(
    screen.queryByText(/WST_1|localhost|Reviewer comment|INBOX_INTERNAL/),
  ).not.toBeInTheDocument();
});
it("never treats an inbox reference as permission to expose an unavailable item", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.includes("/customer/communications")) return [message];
    throw Error("Not authorized");
  });
  render(<CustomerUpdates session={session} />);
  await userEvent.hover(screen.getByRole("link", { name: "Updates" }));
  await screen.findByRole("link", { name: "View your items" });
  expect(screen.queryByText("My old laptop")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/WST_1|localhost|APPROVED/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "View item details" }),
  ).not.toBeInTheDocument();
});

it("keeps mobile launch context when an unavailable item falls back to the item collection", async () => {
  history.replaceState({}, "", "/telegram?asset=OLD&tgWebAppStartParam=launch");
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.includes("/customer/communications")) return [message];
    throw Error("Unavailable");
  });
  render(<CustomerUpdates session={session} mobile />);
  await userEvent.click(screen.getByRole("button", { name: "Updates" }));
  const link = await screen.findByRole("link", { name: "View your items" });
  expect(link).toHaveAttribute(
    "href",
    "/telegram?tgWebAppStartParam=launch&view=submissions&status=ALL&sort=RECENT&page=1&limit=12",
  );
});

it("navigates an authorized mobile notice in place and leaves modified links to the browser", async () => {
  history.replaceState({}, "", "/telegram?account=wallet&shop=coupons&product=OLD&asset=OLD&status=DRAFT&sort=FEATURED&q=repair&page=9&tgWebAppStartParam=launch#host");
  vi.mocked(request).mockImplementation(async (path) => path.includes("/customer/communications")
    ? [message] : { contractVersion: 1, item });
  const onNavigate = vi.fn();
  render(<CustomerUpdates session={session} mobile onNavigate={onNavigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Updates" }));
  const link = await screen.findByRole("link", { name: "View item details" });
  const href = "/telegram?status=ALL&sort=RECENT&page=1&tgWebAppStartParam=launch&view=submissions&limit=12&submission=WST_1#host";
  expect(link).toHaveAttribute("href", href);
  let nativeDefault = false;
  document.addEventListener("click", (event) => {
    nativeDefault = !event.defaultPrevented;
    event.preventDefault(); // jsdom does not implement the browser's new-tab navigation.
  }, { once: true });
  fireEvent.click(link, { button: 0, ctrlKey: true });
  expect(nativeDefault).toBe(true);
  expect(onNavigate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Updates" }));
  const reopened = await screen.findByRole("link", { name: "View item details" });
  expect(fireEvent.click(reopened, { button: 0 })).toBe(false);
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith(href);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
