import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ReviewDialog } from "./ReviewDialog";

afterEach(cleanup);

it.each([false, true])("restores the connected opener with child autoFocus=%s", async (autoFocus) => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <>
      <button onClick={() => setOpen(true)}>Open filters</button>
      {open && <ReviewDialog title="Filters" onClose={() => setOpen(false)}>
        <label>Condition<input autoFocus={autoFocus} /></label>
      </ReviewDialog>}
    </>;
  }
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Open filters" });
  await user.click(opener);
  if (autoFocus) expect(screen.getByLabelText("Condition")).toHaveFocus();
  await user.click(screen.getByLabelText("Condition"));
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});
