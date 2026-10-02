/** Authored bounded metadata/progress/command fixtures; NOT RUN. */
import { afterEach, expect, it, vi } from "vitest";
import { request } from "../../api";
import { contactFixture } from "./contactFixtures";
import { parseContactProgress, parseContactWorkspace } from "./contactClient";
vi.mock("../../api", () => ({ request: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("requires exact self metadata/copy and rejects destinations or invented choices", () => {
  expect(parseContactWorkspace(contactFixture).ownerId).toBe(
    contactFixture.ownerId,
  );
  for (const value of [
    { ...contactFixture, email: "not-evidence@example.invalid" },
    { ...contactFixture, channels: ["EMAIL", "EMAIL"] },
    {
      ...contactFixture,
      presentation: { ...contactFixture.presentation, confirmLabel: undefined },
    },
    {
      ...contactFixture,
      purposes: [{ ...contactFixture.purposes[0], channels: ["SMS"] }],
    },
  ])
    expect(() => parseContactWorkspace(value)).toThrow();
});
it("admits NOT_STARTED only at revision zero and never projects proof", () => {
  expect(
    parseContactProgress({
      revision: 0,
      status: "NOT_STARTED",
      verified: false,
    }),
  ).toEqual({ revision: 0, status: "NOT_STARTED", verified: false });
  expect(() =>
    parseContactProgress({
      revision: 0,
      status: "NOT_STARTED",
      verified: true,
    }),
  ).toThrow();
  expect(() =>
    parseContactProgress({
      revision: 2,
      status: "ISSUED",
      verified: false,
      commandId: "a".repeat(64),
      deliveryStatus: "private@example.invalid",
    }),
  ).toThrow();
  expect(() =>
    parseContactProgress({
      revision: 2,
      status: "VERIFIED",
      verified: true,
      commandId: "a".repeat(64),
      proof: "hidden",
    }),
  ).toThrow();
});
it("defaults off and sends no metadata or command request", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "false");
  vi.resetModules();
  const client = await import("./contactClient");
  await expect(
    client.loadContactWorkspace({ token: "customer", loginId: "fixture" }),
  ).rejects.toThrow();
  expect(client.contactPreferencesEnabled).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
it("projects the published owner/channel/revision and exact explicitly chosen consent receipt", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "true");
  vi.resetModules();
  const client = await import("./contactClient"),
    workspace = client.parseContactWorkspace(contactFixture);
  const progress = client.parseContactProgress({
    revision: 4,
    status: "VERIFIED",
    verified: true,
    commandId: "a".repeat(64),
  });
  const command = client.prepareContactCommand(workspace, "EMAIL", progress, {
    operation: "consent",
    purpose: "FIXTURE_TRANSACTION",
    granted: true,
    operationReference: "fixture_operation",
  });
  expect(command.body).toEqual({
    ownerId: contactFixture.ownerId,
    channel: "EMAIL",
    expectedRevision: 4,
    purpose: "FIXTURE_TRANSACTION",
    purposeVersion: 1,
    granted: true,
    operationReference: "fixture_operation",
  });
  vi.mocked(request).mockResolvedValueOnce({
    revision: 5,
    purpose: "FIXTURE_TRANSACTION",
    purposeVersion: 1,
    granted: true,
  });
  await client.executeContactCommand(
    { token: "customer", loginId: "fixture" },
    command,
  );
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/nodics/profile/v0/customer/contacts/verification/consent",
    { token: "customer", loginId: "fixture" },
    command.body,
  );
});
it("does not attach credentials to unknown commands or unreviewed extra fields", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "true");
  vi.resetModules();
  const client = await import("./contactClient"),
    workspace = client.parseContactWorkspace(contactFixture);
  const command = client.prepareContactCommand(
    workspace,
    "EMAIL",
    { revision: 0, status: "NOT_STARTED", verified: false },
    { operation: "begin" },
  );
  await expect(
    client.executeContactCommand(
      { token: "customer", loginId: "fixture" },
      {
        ...command,
        body: { ...command.body, address: "never-sent@example.invalid" },
      },
    ),
  ).rejects.toThrow();
  await expect(
    client.executeContactCommand({ token: "customer", loginId: "fixture" }, {
      ...command,
      operation: "../other",
    } as unknown as typeof command),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("retains a non-verified owner outcome rather than claiming contact verification or consent", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "true");
  vi.resetModules();
  const client = await import("./contactClient"),
    workspace = client.parseContactWorkspace(contactFixture);
  const command = client.prepareContactCommand(
    workspace,
    "EMAIL",
    {
      revision: 4,
      status: "ISSUED",
      verified: false,
      commandId: "a".repeat(64),
    },
    { operation: "verify", secret: "abcdef123456" },
  );
  vi.mocked(request).mockResolvedValueOnce({
    revision: 6,
    status: "ISSUED",
    verified: false,
    commandId: "a".repeat(64),
  });
  expect(
    await client.executeContactCommand(
      { token: "customer", loginId: "fixture" },
      command,
    ),
  ).toMatchObject({ status: "ISSUED", verified: false });
  expect(request).toHaveBeenCalledTimes(1);
});
it("freezes the reviewed purpose version and never substitutes a later policy or retries stale consent", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "true");
  vi.resetModules();
  const client = await import("./contactClient");
  const workspace = client.parseContactWorkspace({
    ...contactFixture,
    purposes: [{ ...contactFixture.purposes[0], version: 7 }],
  });
  const command = client.prepareContactCommand(
    workspace,
    "EMAIL",
    {
      revision: 4,
      status: "VERIFIED",
      verified: true,
      commandId: "a".repeat(64),
    },
    {
      operation: "consent",
      purpose: "FIXTURE_TRANSACTION",
      granted: true,
      operationReference: "original",
    },
  );
  expect(command.body.purposeVersion).toBe(7);
  const newerWorkspace = client.parseContactWorkspace({
    ...contactFixture,
    purposes: [{ ...contactFixture.purposes[0], version: 8 }],
  });
  expect(newerWorkspace.purposes[0]?.version).toBe(8);
  expect(command.body.purposeVersion).toBe(7);
  vi.mocked(request).mockRejectedValueOnce(
    new Error("Purpose version conflict"),
  );
  await expect(
    client.executeContactCommand(
      { token: "customer", loginId: "fixture" },
      command,
    ),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/nodics/profile/v0/customer/contacts/verification/consent",
    { token: "customer", loginId: "fixture" },
    expect.objectContaining({ purposeVersion: 7 }),
  );
  vi.mocked(request).mockClear();
  for (const purposeVersion of [undefined, 0]) {
    await expect(
      client.executeContactCommand({ token: "customer", loginId: "fixture" }, {
        ...command,
        body: { ...command.body, purposeVersion },
      } as unknown as typeof command),
    ).rejects.toThrow();
  }
  expect(request).not.toHaveBeenCalled();
});
it("does not confirm a consent receipt for a different or missing purpose version", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "true");
  vi.resetModules();
  const client = await import("./contactClient");
  const command = client.prepareContactCommand(
    client.parseContactWorkspace(contactFixture),
    "EMAIL",
    {
      revision: 4,
      status: "VERIFIED",
      verified: true,
      commandId: "a".repeat(64),
    },
    {
      operation: "consent",
      purpose: "FIXTURE_TRANSACTION",
      granted: true,
      operationReference: "original",
    },
  );
  for (const purposeVersion of [undefined, 2]) {
    vi.mocked(request).mockResolvedValueOnce({
      revision: 5,
      purpose: "FIXTURE_TRANSACTION",
      granted: true,
      ...(purposeVersion === undefined ? {} : { purposeVersion }),
    });
    await expect(
      client.executeContactCommand(
        { token: "customer", loginId: "fixture" },
        command,
      ),
    ).rejects.toThrow();
  }
  expect(request).toHaveBeenCalledTimes(2);
});
