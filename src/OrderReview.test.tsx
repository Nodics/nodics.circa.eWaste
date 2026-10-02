/** Authored isolated order-review fixtures; no live order, wallet or refund operations. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { OrderReview } from "./OrderReview";
import { request } from "./api";
vi.mock("./api", () => ({
  API: "/nodics/eWaste/v0",
  request: vi.fn(),
  commandKey: () => "fixture-key",
}));
const session = { token: "fixture-token", loginId: "fixture@example.test" };
afterEach(() => vi.resetAllMocks());
it("requires successful history inspection before submitting a concern", async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error("Denied"));
  const user = userEvent.setup();
  render(<OrderReview code="order-1" session={session} />);
  await user.click(
    screen.getByRole("button", { name: "Request order review" }),
  );
  await screen.findByText("Denied");
  await user.type(
    screen.getByRole("textbox", { name: "Reason" }),
    "Please review my purchase.",
  );
  expect(
    screen.getByRole("button", { name: "Confirm review request" }),
  ).toBeDisabled();
  expect(vi.mocked(request)).toHaveBeenCalledTimes(1);
});
it("inspects an uncertain write and explicitly resumes the frozen original request", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({ cases: [] })
    .mockRejectedValueOnce(new Error("Timeout"))
    .mockResolvedValueOnce({ cases: [] })
    .mockResolvedValueOnce({
      code: "case-1",
      orderCode: "order-1",
      comment: "Please review my purchase.",
      status: "REQUESTED",
      requestedResolution: "DISPUTE",
    })
    .mockResolvedValueOnce({ cases: [] });
  const user = userEvent.setup();
  render(<OrderReview code="order-1" session={session} />);
  await user.click(
    screen.getByRole("button", { name: "Request order review" }),
  );
  await screen.findByText("No review requests are recorded for this purchase.");
  await user.type(
    screen.getByRole("textbox", { name: "Reason" }),
    "Please review my purchase.",
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm review request" }),
  );
  await screen.findByText(/request outcome is unconfirmed/);
  expect(screen.getByRole("textbox", { name: "Reason" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Resume same review request" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Inspect review history" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Resume same review request" }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: "Resume same review request" }),
  );
  await waitFor(() => expect(vi.mocked(request)).toHaveBeenCalledTimes(5));
  expect(vi.mocked(request).mock.calls[3]?.[2]).toEqual(
    vi.mocked(request).mock.calls[1]?.[2],
  );
});
it("discards a prior customer's late review history after a session change", async () => {
  let complete!: (value: unknown) => void;
  vi.mocked(request).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const user = userEvent.setup();
  const view = render(<OrderReview code="order-1" session={session} />);
  await user.click(
    screen.getByRole("button", { name: "Request order review" }),
  );
  view.rerender(
    <OrderReview
      code="order-1"
      session={{ token: "other", loginId: "other@example.test" }}
    />,
  );
  complete({
    cases: [
      {
        code: "private-case",
        orderCode: "order-1",
        status: "REQUESTED",
        requestedResolution: "DISPUTE",
      },
    ],
  });
  await waitFor(() => expect(screen.queryByText(/private-case/)).toBeNull());
  expect(screen.queryByRole("dialog")).toBeNull();
});
