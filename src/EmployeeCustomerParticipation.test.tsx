/** Authored explicit consent and uncertain host recovery fixtures; NOT RUN. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { EmployeeCustomerParticipation } from "./EmployeeCustomerParticipation";
import { request } from "./api";
import { participationFixture } from "./participationFixtures";
vi.mock("./api", () => ({
  request: vi.fn(),
  saveSession: vi.fn(),
  endSession: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
async function reviewedSwitch(
  onLogin: (session: { token: string; loginId: string }) => Promise<void>,
) {
  const user = userEvent.setup();
  vi.mocked(request)
    .mockResolvedValueOnce({ authToken: "employee-only", loginId: "employee" })
    .mockResolvedValueOnce(participationFixture)
    .mockResolvedValueOnce({
      enterpriseCode: "default",
      accepted: true,
      revision: 1,
    })
    .mockResolvedValueOnce({
      ...participationFixture,
      participation: {
        phase: "COMPLETE",
        revision: 1,
        currentTerms: true,
        canSwitch: true,
      },
    });
  render(
    <EmployeeCustomerParticipation onLogin={onLogin} onCancel={vi.fn()} />,
  );
  await user.type(screen.getByLabelText("Employee login"), "employee");
  await user.type(screen.getByLabelText("Password"), "opaque-password");
  await user.click(screen.getByRole("button", { name: "Sign in as employee" }));
  expect(await screen.findByRole("checkbox")).not.toBeChecked();
  expect(onLogin).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Accept owner terms" }));
  expect(request).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Confirm owner" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await user.click(screen.getByRole("button", { name: "Inspect" }));
  const switchButton = await screen.findByRole("button", {
    name: "Continue as customer",
  });
  await waitFor(() => expect(switchButton).toBeEnabled());
  await user.click(switchButton);
  return user;
}
it("continues only with owner Customer proof and host retry never repeats issuance", async () => {
  const onLogin = vi
    .fn()
    .mockRejectedValueOnce(new Error("Host interrupted"))
    .mockResolvedValueOnce(undefined);
  const user = await reviewedSwitch(onLogin);
  vi.mocked(request).mockResolvedValueOnce({
    authToken: "customer-only",
    loginId: "customer",
    enterpriseCode: "default",
  });
  await user.click(screen.getByRole("button", { name: "Confirm owner" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "customer session could not be completed",
  );
  expect(onLogin).toHaveBeenCalledExactlyOnceWith({
    token: "customer-only",
    loginId: "customer",
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(2));
  expect(
    vi
      .mocked(request)
      .mock.calls.filter(([path]) =>
        path.endsWith("/customer-participation/switch"),
      ),
  ).toHaveLength(1);
});
it("discards Employee proof after uncertain issuance and never automatically reswitches", async () => {
  const onLogin = vi.fn();
  const user = await reviewedSwitch(onLogin);
  vi.mocked(request).mockRejectedValueOnce(new Error("Interrupted"));
  await user.click(screen.getByRole("button", { name: "Confirm owner" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Inspect before another command",
  );
  expect(
    screen.getByRole("button", { name: "Sign in as employee" }),
  ).toBeInTheDocument();
  expect(onLogin).not.toHaveBeenCalled();
  expect(
    vi
      .mocked(request)
      .mock.calls.filter(([path]) =>
        path.endsWith("/customer-participation/switch"),
      ),
  ).toHaveLength(1);
});
it("uses owner currentTerms/canSwitch for returning users without a renewal write", async () => {
  const onLogin = vi.fn(),
    user = userEvent.setup();
  vi.mocked(request)
    .mockResolvedValueOnce({ authToken: "employee-only", loginId: "employee" })
    .mockResolvedValueOnce({
      ...participationFixture,
      lifecycleQualified: false,
      participation: {
        phase: "COMPLETE",
        revision: 4,
        currentTerms: true,
        canSwitch: true,
      },
    })
    .mockResolvedValueOnce({
      authToken: "customer-only",
      loginId: "customer",
      enterpriseCode: "default",
    });
  render(
    <EmployeeCustomerParticipation onLogin={onLogin} onCancel={vi.fn()} />,
  );
  await user.type(screen.getByLabelText("Employee login"), "employee");
  await user.type(screen.getByLabelText("Password"), "opaque-password");
  await user.click(screen.getByRole("button", { name: "Sign in as employee" }));
  expect(
    await screen.findByRole("button", { name: "Renew owner terms" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Continue as customer" }),
  );
  expect(request).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Confirm owner" }));
  await waitFor(() =>
    expect(onLogin).toHaveBeenCalledWith({
      token: "customer-only",
      loginId: "customer",
    }),
  );
  expect(vi.mocked(request).mock.calls.map(([path]) => path)).toEqual([
    "/nodics/profile/v0/employee/browser/authenticate",
    "/nodics/profile/v0/customer/participation/workspace",
    "/nodics/profile/v0/employee/browser/customer-participation/switch",
  ]);
});
