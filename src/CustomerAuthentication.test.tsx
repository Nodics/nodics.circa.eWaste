import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerAuthentication } from "./CustomerAuthentication";
import { request } from "./api";
vi.mock("./api", () => ({
  APP_API: "/nodics/circa.ewaste/v0",
  request: vi.fn(),
}));
const api = vi.mocked(request),
  password = "TestPassword!2026";
beforeEach(() => {
  api.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Email address"),
    "CUSTOMER@example.com",
  );
  await user.type(screen.getByLabelText("Password"), password);
}
describe("shared customer authentication", () => {
  it("uses the same Profile email/password sign-in with no lookup or OTP step", async () => {
    api.mockResolvedValueOnce({ authToken: "access" });
    const onLogin = vi.fn(),
      user = userEvent.setup();
    render(<CustomerAuthentication onLogin={onLogin} />);
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "Sign in" }),
    );
    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith({
        token: "access",
        loginId: "customer@example.com",
      }),
    );
    expect(api).toHaveBeenCalledExactlyOnceWith(
      "/nodics/profile/v0/customer/browser/authenticate",
      null,
      { loginId: "customer@example.com", password },
    );
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
  it("registers with name/email/password then signs in through the same Profile route", async () => {
    api
      .mockResolvedValueOnce({ registered: true })
      .mockResolvedValueOnce({ authToken: "new-access" });
    const onLogin = vi.fn(),
      user = userEvent.setup();
    render(<CustomerAuthentication onLogin={onLogin} />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Asha");
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0]).toEqual([
      "/nodics/circa.ewaste/v0/registrations",
      null,
      { email: "customer@example.com", name: "Asha", password },
    ]);
    expect(api.mock.calls[1][0]).toBe(
      "/nodics/profile/v0/customer/browser/authenticate",
    );
  });
  it("wrong password cannot invoke host linking and never triggers registration", async () => {
    api.mockRejectedValueOnce(new Error("Invalid login attempt"));
    const onLogin = vi.fn(),
      user = userEvent.setup();
    render(<CustomerAuthentication onLogin={onLogin} />);
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "Sign in" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login");
    expect(onLogin).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
  it("after successful registration a connection retry authenticates without creating another account", async () => {
    api
      .mockResolvedValueOnce({ registered: true })
      .mockRejectedValueOnce(new Error("Connection interrupted"));
    const onLogin = vi.fn(),
      user = userEvent.setup();
    render(<CustomerAuthentication onLogin={onLogin} />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Asha");
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection interrupted",
    );
    api.mockResolvedValueOnce({ authToken: "recovered" });
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(
      screen.getByRole("button", { name: "Sign in" }),
    );
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(
      api.mock.calls.filter(([url]) => url.endsWith("/registrations")),
    ).toHaveLength(1);
  });
  it("blocks duplicate submissions and mode changes while authentication is pending", async () => {
    let resolve!: (value: unknown) => void;
    api.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<CustomerAuthentication onLogin={vi.fn()} />);
    await fill(user);
    const form = screen
      .getByRole("button", { name: "Sign in" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Create an account" }),
    ).toBeDisabled();
    resolve({ authToken: "access" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign in" }),
      ).toBeEnabled(),
    );
  });
});
