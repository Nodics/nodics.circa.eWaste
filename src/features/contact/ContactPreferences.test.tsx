/** Authored self-contact review, secrecy and uncertainty fixtures; NOT RUN. */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ContactPreferences } from "./ContactPreferences";
import { contactFixture } from "./contactFixtures";
import {
  executeContactCommand,
  inspectContact,
  loadContactWorkspace,
  parseContactWorkspace,
  prepareContactCommand,
} from "./contactClient";
vi.mock("./contactClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("./contactClient")>();
  return {
    ...original,
    contactPreferencesEnabled: true,
    loadContactWorkspace: vi.fn(),
    inspectContact: vi.fn(),
    executeContactCommand: vi.fn(),
    prepareContactCommand: vi.fn(),
  };
});
afterEach(() => vi.resetAllMocks());
async function inspected(status: "NOT_STARTED" | "ISSUED" | "VERIFIED") {
  const workspace = parseContactWorkspace(contactFixture),
    user = userEvent.setup();
  vi.mocked(loadContactWorkspace).mockResolvedValue(workspace);
  vi.mocked(inspectContact).mockResolvedValue({
    revision: status === "NOT_STARTED" ? 0 : 4,
    status,
    verified: status === "VERIFIED",
    ...(status === "NOT_STARTED" ? {} : { commandId: "a".repeat(64) }),
  });
  render(
    <ContactPreferences session={{ token: "customer", loginId: "fixture" }} />,
  );
  await user.selectOptions(
    await screen.findByLabelText("channelLabel"),
    "EMAIL",
  );
  await user.click(screen.getByRole("button", { name: "inspectLabel" }));
  await screen.findByText(status);
  return user;
}
it("never displays raw owner ID and begins only after a second explicit review", async () => {
  const user = await inspected("NOT_STARTED");
  expect(screen.queryByText(contactFixture.ownerId)).not.toBeInTheDocument();
  vi.mocked(prepareContactCommand).mockReturnValue({
    operation: "begin",
    body: {
      ownerId: contactFixture.ownerId,
      channel: "EMAIL",
      expectedRevision: 0,
    },
    progress: { revision: 0, status: "NOT_STARTED", verified: false },
  });
  vi.mocked(executeContactCommand).mockRejectedValueOnce(
    new Error("Interrupted"),
  );
  await user.click(screen.getByRole("button", { name: "beginLabel" }));
  expect(executeContactCommand).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "confirmLabel" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "uncertainMessage",
  );
  expect(screen.getByRole("button", { name: "beginLabel" })).toBeDisabled();
  expect(executeContactCommand).toHaveBeenCalledTimes(1);
});
it("keeps entered verification code transient and excludes it from review", async () => {
  const user = await inspected("ISSUED"),
    secret = "abcdef123456";
  vi.mocked(prepareContactCommand).mockReturnValue({
    operation: "verify",
    body: {
      ownerId: contactFixture.ownerId,
      channel: "EMAIL",
      expectedRevision: 4,
      commandId: "a".repeat(64),
      secret,
    },
    progress: {
      revision: 4,
      status: "ISSUED",
      verified: false,
      commandId: "a".repeat(64),
    },
  });
  await user.type(screen.getByLabelText("verificationCodeLabel"), secret);
  await user.click(screen.getByRole("button", { name: "verifyLabel" }));
  expect(screen.getByLabelText("verificationCodeLabel")).toHaveValue("");
  expect(
    screen.getByRole("group", { name: "reviewTitle" }),
  ).not.toHaveTextContent(secret);
  expect(
    screen.getByRole("group", { name: "reviewTitle" }),
  ).not.toHaveTextContent(contactFixture.ownerId);
  await user.click(screen.getByRole("button", { name: "cancelLabel" }));
  expect(executeContactCommand).not.toHaveBeenCalled();
});
it("keeps consent and suppression independently unchecked and requires current inspection after a recorded command", async () => {
  const user = await inspected("VERIFIED");
  expect(screen.getByLabelText("grantedLabel")).not.toBeChecked();
  expect(screen.getByLabelText("suppressedLabel")).not.toBeChecked();
  await user.selectOptions(
    screen.getByLabelText("purposeLabel"),
    "FIXTURE_TRANSACTION",
  );
  await user.click(screen.getByLabelText("grantedLabel"));
  vi.mocked(prepareContactCommand).mockReturnValue({
    operation: "consent",
    body: {
      ownerId: contactFixture.ownerId,
      channel: "EMAIL",
      expectedRevision: 4,
      purpose: "FIXTURE_TRANSACTION",
      purposeVersion: 1,
      granted: true,
      operationReference: "original",
    },
    progress: {
      revision: 4,
      status: "VERIFIED",
      verified: true,
      commandId: "a".repeat(64),
    },
  });
  vi.mocked(executeContactCommand).mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "consentLabel" }));
  expect(prepareContactCommand).toHaveBeenCalledWith(
    expect.anything(),
    "EMAIL",
    expect.anything(),
    expect.objectContaining({
      operation: "consent",
      purpose: "FIXTURE_TRANSACTION",
      granted: true,
    }),
  );
  await user.click(screen.getByRole("button", { name: "confirmLabel" }));
  await waitFor(() =>
    expect(screen.getByText("recordedMessage")).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "consentLabel" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "suppressionLabel" }),
  ).toBeDisabled();
});
it("discards an old self projection and ignores its late read after session change", async () => {
  let resolve!: (value: ReturnType<typeof parseContactWorkspace>) => void;
  vi.mocked(loadContactWorkspace)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce({
      ...parseContactWorkspace(contactFixture),
      presentation: { ...contactFixture.presentation, title: "New owner task" },
    });
  const view = render(
    <ContactPreferences session={{ token: "old-customer", loginId: "old" }} />,
  );
  view.rerender(
    <ContactPreferences session={{ token: "new-customer", loginId: "new" }} />,
  );
  await screen.findByRole("heading", { name: "New owner task" });
  await act(async () => {
    resolve(parseContactWorkspace(contactFixture));
    await Promise.resolve();
  });
  expect(
    screen.getByRole("heading", { name: "New owner task" }),
  ).toBeInTheDocument();
  expect(inspectContact).not.toHaveBeenCalled();
  expect(executeContactCommand).not.toHaveBeenCalled();
});
