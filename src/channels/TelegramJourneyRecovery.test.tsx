import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { TelegramJourneyRecovery } from "./TelegramJourneyRecovery";
vi.mock("../api", () => ({ API: "/nodics/eWaste/v0", request: vi.fn() }));
const api = vi.mocked(request),
  session = { loginId: "a@example.com", token: "access" };
const saved = (code: string) => ({
  code,
  name: "Saved phone " + code,
  status: "DRAFT",
});
beforeEach(() => {
  api.mockReset();
  sessionStorage.clear();
});
it("recovers a sole server-owned draft in a fresh Mini App window", async () => {
  api.mockResolvedValueOnce({
    drafts: { total: 1, items: [saved("saved-code")], page: 1, pageSize: 10 },
    latestSubmission: null,
  });
  const resume = vi.fn();
  render(<TelegramJourneyRecovery session={session} onResume={resume} />);
  await waitFor(() => expect(resume).toHaveBeenCalledWith("saved-code"));
  expect(sessionStorage.length).toBe(0);
  expect(api).toHaveBeenCalledWith(
    "/nodics/eWaste/v0/journey/resume?page=1",
    session,
  );
});
it("asks which draft to continue when more than one exists", async () => {
  api.mockResolvedValueOnce({
    drafts: {
      total: 2,
      items: [saved("one"), saved("two")],
      page: 1,
      pageSize: 10,
    },
    latestSubmission: null,
  });
  const resume = vi.fn(),
    user = userEvent.setup();
  render(<TelegramJourneyRecovery session={session} onResume={resume} />);
  await screen.findByText(/Which one would you like/);
  expect(resume).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Saved phone two/ }));
  expect(resume).toHaveBeenCalledWith("two");
});
it("restores the latest receipt when there is no unfinished item", async () => {
  api.mockResolvedValueOnce({
    drafts: { total: 0, items: [], page: 1, pageSize: 10 },
    latestSubmission: saved("receipt"),
  });
  const resume = vi.fn();
  render(<TelegramJourneyRecovery session={session} onResume={resume} />);
  await waitFor(() => expect(resume).toHaveBeenCalledWith("receipt"));
});
it("holds the journey on lookup failure instead of creating a duplicate draft", async () => {
  api.mockRejectedValueOnce(new Error("Service unavailable"));
  const resume = vi.fn(),
    user = userEvent.setup();
  render(<TelegramJourneyRecovery session={session} onResume={resume} />);
  await screen.findByRole("alert");
  expect(resume).not.toHaveBeenCalled();
  api.mockResolvedValueOnce({
    drafts: { total: 0, items: [], page: 1, pageSize: 10 },
    latestSubmission: null,
  });
  await user.click(screen.getByRole("button", { name: "Try loading again" }));
  await waitFor(() => expect(resume).toHaveBeenCalledWith(undefined));
});
