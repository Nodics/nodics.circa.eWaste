import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { WalletHistory } from "./WalletHistory";

afterEach(cleanup);
const rows = Array.from(
  { length: 21 },
  (_, index) => `Transaction ${index + 1}`,
);
const view = (entries: string[]) => (
  <WalletHistory entries={entries}>
    {(visible) => (
      <ul>
        {visible.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    )}
  </WalletHistory>
);

it("navigates returned transactions with bounded first and last pages", async () => {
  const user = userEvent.setup();
  render(view(rows));
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(
    screen.getByText(/Older transactions may not be included/),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Transaction 11")).toBeVisible();
  expect(screen.queryByText("Transaction 1")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("Transaction 21")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByText("Transaction 11")).toBeVisible();
});

it("resets navigation on refresh and handles empty or one-page snapshots", async () => {
  const user = userEvent.setup();
  const rendered = render(view(rows));
  await user.click(screen.getByRole("button", { name: "Next" }));
  rendered.rerender(view([...rows]));
  expect(screen.getByText("Transaction 1")).toBeVisible();
  rendered.rerender(view(["New owner's transaction"]));
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByText("Transaction 1")).toBeNull();
  rendered.rerender(view([]));
  expect(screen.getByText("No recent transactions returned.")).toBeVisible();
});
