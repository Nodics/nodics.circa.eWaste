import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  CertificatePicker,
  type CertificateSelection,
} from "./CertificatePicker";
import { request, type Session } from "./api";
vi.mock("./api", () => ({ request: vi.fn() }));
const session: Session = { token: "proof", loginId: "customer" };
const row = {
  code: "cert-one",
  revision: 3,
  brandCode: "Brand",
  modelCode: "Device",
  available: true,
  valid: true,
};
const response = {
  contractVersion: 1,
  ownerRef: { module: "profile", schema: "customer", code: "customer" },
  page: 1,
  limit: 1,
  total: 2,
  items: [row],
};
afterEach(() => vi.resetAllMocks());
function Picker() {
  const [value, setValue] = useState<CertificateSelection[]>([]);
  return (
    <CertificatePicker session={session} value={value} onChange={setValue} />
  );
}
it("uses the owner-scoped endpoint, retains selections across pages and never sends a caller-selected owner", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce({
      ...response,
      page: 2,
      items: [{ ...row, code: "cert-two" }],
    });
  render(<Picker />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Next certificates" }));
  await screen.findByText("cert-two");
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByText("2 selected")).toBeVisible();
  expect(vi.mocked(request).mock.calls.map((call) => call[2])).toEqual([
    { page: 1 },
    { page: 2 },
  ]);
});
it("consumed or reserved certificates cannot be selected", async () => {
  vi.mocked(request).mockResolvedValue({
    ...response,
    items: [{ ...row, available: false }],
  });
  render(<Picker />);
  expect(await screen.findByRole("checkbox")).toBeDisabled();
  expect(screen.getByText("Unavailable")).toBeVisible();
});
it("contradictory Enterprise ownership fails closed", async () => {
  vi.mocked(request).mockResolvedValue(response);
  render(
    <CertificatePicker
      session={{
        kind: "ENTERPRISE",
        token: "staff",
        loginId: "employee",
        enterpriseCode: "enterprise",
      }}
      value={[]}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("a selected certificate that becomes unavailable can be removed but not selected again", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce({
      ...response,
      items: [{ ...row, available: false }],
    });
  render(<Picker />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Refresh certificates" }),
  );
  await screen.findByText("Unavailable");
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.queryByText("1 selected")).toBeNull();
});
it("a late read after switching session cannot expose previous holdings", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(request)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce({ ...response, items: [], total: 0 });
  const v = render(
    <CertificatePicker session={session} value={[]} onChange={() => {}} />,
  );
  v.rerender(
    <CertificatePicker
      session={{ token: "other", loginId: "other" }}
      value={[]}
      onChange={() => {}}
    />,
  );
  await screen.findByText("No certificates recorded.");
  await act(async () => resolve(response));
  expect(screen.queryByText("cert-one")).toBeNull();
});
