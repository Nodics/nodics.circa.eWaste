import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { EnterpriseAuthentication } from "./EnterpriseAuthentication";
import { authenticateEnterpriseSession, type EnterpriseSession } from "./api";
vi.mock("./api", () => ({ authenticateEnterpriseSession: vi.fn(), enterpriseSessionHint: () => null }));
const authenticate = vi.mocked(authenticateEnterpriseSession);
const session: EnterpriseSession = { kind: "ENTERPRISE", token: "employee-access", loginId: "employee", enterpriseCode: "company" };
beforeEach(() => { authenticate.mockReset(); });
function fill() {
  fireEvent.change(screen.getByLabelText("Enterprise code"), { target: { value: "company" } });
  fireEvent.change(screen.getByLabelText("Employee login"), { target: { value: "employee" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
}
it("admits only the Profile-confirmed Enterprise session and clears password immediately", async () => {
  authenticate.mockResolvedValue(session); const onLogin = vi.fn(); render(<EnterpriseAuthentication onLogin={onLogin} />); fill();
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByLabelText("Password")).toHaveValue("");
  await waitFor(() => expect(onLogin).toHaveBeenCalledExactlyOnceWith(session));
  expect(authenticate).toHaveBeenCalledExactlyOnceWith("company", "employee", "password");
  expect(screen.queryByRole("button", { name: /create|participation|register/i })).not.toBeInTheDocument();
});
it("deduplicates submit and discards successful authentication after the host changes mode", async () => {
  let resolve!: (value: EnterpriseSession) => void;
  authenticate.mockImplementation(() => new Promise(done => { resolve = done; }));
  const onLogin = vi.fn(), view = render(<EnterpriseAuthentication onLogin={onLogin} />); fill();
  fireEvent.submit(screen.getByRole("form")); fireEvent.submit(screen.getByRole("form"));
  expect(authenticate).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("Employee login")).toBeDisabled();
  view.unmount(); await act(async () => resolve(session)); expect(onLogin).not.toHaveBeenCalled();
});
it("failure never returns a Customer or trusts the entered Enterprise as proof", async () => {
  authenticate.mockRejectedValue(new Error("private details")); const onLogin = vi.fn();
  render(<EnterpriseAuthentication onLogin={onLogin} />); fill(); fireEvent.submit(screen.getByRole("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
  expect(screen.getByRole("alert")).not.toHaveTextContent("private details"); expect(onLogin).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sign in to Enterprise" })).toBeEnabled();
});
