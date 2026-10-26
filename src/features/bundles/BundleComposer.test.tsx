import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { request } from "../../api";
import { BundleComposer } from "./BundleComposer";
import { pendingReferenceKey } from "../../pendingReferences";
import type { ManifestCommand } from "./bundleClient";
import {
  carbonPage,
  certificatePage,
  giftReceipt,
  listingContext,
  lot,
  manifestReceipt,
  ownerRef,
  publishedReceipt,
  session,
} from "./bundleFixtures";
vi.mock("../../api", () => ({ request: vi.fn(), commandKey: vi.fn() }));
import { commandKey } from "../../api";
let serial = 0;
beforeEach(() => {
  sessionStorage.clear();
  serial = 0;
  vi.mocked(commandKey).mockImplementation(() => "original-" + ++serial);
  vi.mocked(request).mockImplementation(async (path, _session, body) => {
    if (path.endsWith("/holdings/certificates"))
      return structuredClone(certificatePage);
    if (path.endsWith("/carbon/holdings")) return structuredClone(carbonPage);
    if (path.endsWith("/participants/search"))
      return {
        contractVersion: 1,
        items: [
          {
            ownerType: "CUSTOMER",
            ownerCode: "recipient-one",
            displayName: "Alex",
          },
        ],
      };
    if (path.endsWith("/bundles"))
      return manifestReceipt(body as ManifestCommand);
    if (path.endsWith("/bundle-listings"))
      return publishedReceipt(body as Record<string, unknown>);
    if (path.endsWith("/gifts"))
      return giftReceipt(body as Record<string, unknown>);
    throw Error("Unexpected request: " + path);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
const props = { session, ownerRef, listingContext };
const recoveryKey = () =>
  pendingReferenceKey(session, "bundle-composer", {
    ownerType: "CUSTOMER",
    ownerCode: ownerRef.code,
  });
it("reload retains only the original key and resumes the server-reviewed command without new manifest or listing inputs", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/bundles"))
      return Promise.reject(Error("Saved manifest reply lost"));
    if (p.endsWith("/commands/query"))
      return Promise.resolve({
        contractVersion: 1,
        ownerRef,
        manifestKey: "original-1",
        status: "PREPARED",
        canResume: true,
      });
    if (p.endsWith("/commands/resume"))
      return Promise.resolve({
        contractVersion: 1,
        ownerRef,
        manifestKey: "original-1",
        status: "PUBLISHED",
        canResume: false,
        code: "bundle-operation:" + "b".repeat(64),
        productCode: "product",
      });
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup(),
    view = render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Saved manifest reply lost");
  expect(JSON.parse(sessionStorage.getItem(recoveryKey())!)).toEqual({
    manifestKey: "original-1",
  });
  expect(sessionStorage.getItem(recoveryKey())).not.toContain(session.token);
  view.unmount();
  const refreshed = { ...session, token: "refreshed-token" };
  render(
    <BundleComposer
      {...props}
      session={refreshed}
      listingContext={undefined}
    />,
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Check original bundle" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Continue original bundle" }),
  );
  await screen.findByText("Bundle published");
  expect(request).toHaveBeenLastCalledWith(
    "/nodics/digitalCore/v0/bundles/commands/resume",
    refreshed,
    { ownerRef, manifestKey: "original-1", confirmed: true },
  );
  expect(writes()).toHaveLength(1);
  expect(sessionStorage.getItem(recoveryKey())).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Create another bundle" }),
  );
  expect(
    await screen.findByRole("checkbox", { name: /certificate-one/ }),
  ).toBeEnabled();
});
it("unconfirmed or foreign status cannot erase the hint or authorize a replacement; another actor does not inherit it", async () => {
  sessionStorage.setItem(
    recoveryKey(),
    JSON.stringify({ manifestKey: "saved-key" }),
  );
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((p, s, b, m, o) =>
    p.endsWith("/commands/query")
      ? Promise.resolve({
          contractVersion: 1,
          ownerRef,
          manifestKey: "saved-key",
          status: "UNCONFIRMED",
          canResume: false,
        })
      : original(p, s, b, m, o),
  );
  const user = userEvent.setup(),
    view = render(<BundleComposer {...props} />);
  await user.click(
    screen.getByRole("button", { name: "Check original bundle" }),
  );
  expect(await screen.findByText("Bundle status: UNCONFIRMED.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Continue original bundle" }),
  ).toBeNull();
  expect(writes()).toHaveLength(0);
  expect(sessionStorage.getItem(recoveryKey())).not.toBeNull();
  view.rerender(
    <BundleComposer {...props} session={{ ...session, loginId: "another" }} />,
  );
  expect(
    await screen.findByRole("checkbox", { name: /certificate-one/ }),
  ).toBeEnabled();
});
it("a storage save failure prevents every manifest and follow-on dispatch", async () => {
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText(/Nothing new was sent/);
  expect(writes()).toHaveLength(0);
});
it("a malformed stored reference blocks new commands and never becomes a replay payload", async () => {
  sessionStorage.setItem(
    recoveryKey(),
    '{"manifestKey":"saved","token":"forged"}',
  );
  render(<BundleComposer {...props} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/cannot be read/);
  expect(screen.getByRole("button", { name: "Review bundle" })).toBeDisabled();
  expect(writes()).toHaveLength(0);
});
const writes = () =>
  vi
    .mocked(request)
    .mock.calls.filter((call) =>
      ["/bundles", "/gifts", "/bundle-listings"].some((path) =>
        call[0].endsWith(path),
      ),
    );
async function selectCertificate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("checkbox", { name: /certificate-one/ }),
  );
}
async function fixedReview(user: ReturnType<typeof userEvent.setup>) {
  await selectCertificate(user);
  await user.click(screen.getByRole("button", { name: "Fixed price" }));
  await user.type(screen.getByLabelText("Bundle name"), "Certificate package");
  await user.type(screen.getByLabelText("Price", { exact: true }), "12.30");
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  await screen.findByRole("dialog");
}
it("uses the shared picker and explicit review before original manifest and publication commands", async () => {
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  expect(writes()).toHaveLength(0);
  expect(
    within(screen.getByRole("dialog")).getByText("Ends: No expiry"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Bundle published");
  expect(writes()).toHaveLength(2);
  expect(writes()[0]![2]).toEqual({
    composition: {
      mode: "FIXED",
      operationKey: "original-2",
      terms: expect.objectContaining({
        ...listingContext,
        name: "Certificate package",
        amount: "12.30",
        saleMode: "FIXED",
        startsAt: null,
        endsAt: null,
      }),
    },
    ownerRef,
    idempotencyKey: "original-1",
    components: [
      {
        kind: "CERTIFICATE",
        reference: {
          module: "wasteCore",
          schema: "wasteAsset",
          code: "certificate-one",
        },
        quantity: "1",
        expectedRevision: 3,
      },
    ],
  });
  expect(writes()[1]![2]).toEqual(
    expect.objectContaining({
      ...listingContext,
      saleMode: "FIXED",
      name: "Certificate package",
      amount: "12.30",
      startsAt: null,
      endsAt: null,
      idempotencyKey: "original-2",
      confirmed: true,
    }),
  );
});
it("sends a whole gift to an existing Profile recipient without pricing fields", async () => {
  const user = userEvent.setup();
  render(<BundleComposer session={session} ownerRef={ownerRef} />);
  await selectCertificate(user);
  expect(screen.getByRole("button", { name: "Fixed price" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Gift" }));
  await user.type(screen.getByLabelText("Find recipient"), "Alex");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("radio", { name: /Alex/ }));
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Gift awaiting acceptance");
  expect(writes()[1]![0]).toBe("/nodics/digitalCore/v0/gifts");
  expect(writes()[1]![2]).toEqual({
    manifestCode: "bundle:" + "a".repeat(64),
    manifestRevision: 0,
    idempotencyKey: "original-2",
    confirmed: true,
    recipientRef: {
      module: "profile",
      schema: "customer",
      code: "recipient-one",
    },
  });
});
it("supports independent carbon-only auctions with exact quantity and explicit dates", async () => {
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await user.click(screen.getByRole("button", { name: "Add carbon" }));
  await user.click(
    await screen.findByRole("checkbox", { name: "Select carbon lot-one" }),
  );
  await user.type(screen.getByLabelText("Quantity lot-one"), "1.125");
  await user.click(screen.getByRole("button", { name: "Auction" }));
  await user.type(screen.getByLabelText("Bundle name"), "Carbon package");
  await user.type(screen.getByLabelText("Price (minimum bid)"), "1.50");
  fireEvent.change(screen.getByLabelText("Starts at"), {
    target: { value: "2030-05-03T10:00" },
  });
  fireEvent.change(screen.getByLabelText("Ends at"), {
    target: { value: "2030-05-04T10:00" },
  });
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Auction: round-one");
  const manifest = writes()[0]![2] as ManifestCommand;
  expect(manifest.components).toEqual([
    {
      kind: "REALIZED_CARBON",
      reference: {
        module: "wasteCarbon",
        schema: "wasteCarbonLot",
        code: "lot-one",
      },
      quantity: "1.125",
      unitOfMeasure: "tCO2e",
      expectedRevision: 4,
    },
  ]);
  expect(writes()[1]![2]).toEqual(
    expect.objectContaining({
      saleMode: "AUCTION",
      amount: "1.50",
      startsAt: new Date("2030-05-03T10:00").toISOString(),
      endsAt: new Date("2030-05-04T10:00").toISOString(),
    }),
  );
});
it("combines selected certificates and carbon while rejecting prospective, reserved and excess-precision input", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((path, s, b, m, o) =>
    path.endsWith("/carbon/holdings")
      ? Promise.resolve({
          ...carbonPage,
          items: [
            lot,
            {
              ...lot,
              lotCode: "future",
              state: "PROSPECTIVE",
              available: "0.000",
            },
          ],
          total: 2,
        })
      : original(path, s, b, m, o),
  );
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await selectCertificate(user);
  await user.click(screen.getByRole("button", { name: "Add carbon" }));
  expect(
    await screen.findByRole("checkbox", { name: "Select carbon future" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: "Select carbon lot-one" }),
  );
  await user.type(screen.getByLabelText("Quantity lot-one"), "4.125");
  await user.click(screen.getByRole("button", { name: "Fixed price" }));
  await user.type(screen.getByLabelText("Bundle name"), "Mixed");
  await user.type(screen.getByLabelText("Price", { exact: true }), "10");
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(writes()).toHaveLength(0);
  await user.clear(screen.getByLabelText("Quantity lot-one"));
  await user.type(screen.getByLabelText("Quantity lot-one"), "1.0001");
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.clear(screen.getByLabelText("Quantity lot-one"));
  await user.type(screen.getByLabelText("Quantity lot-one"), "1.000");
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Bundle published");
  expect((writes()[0]![2] as ManifestCommand).components).toHaveLength(2);
});
it("lost manifest acknowledgement only resumes the identical reviewed create and operation keys", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  let lost = true;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/bundles") && lost) {
      lost = false;
      return Promise.reject(Error("Response lost"));
    }
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Confirmation pending");
  expect(writes()).toHaveLength(1);
  expect(screen.queryByLabelText("Bundle name")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Resume original command" }),
  );
  await screen.findByText("Bundle published");
  expect(writes()[1]![2]).toEqual(writes()[0]![2]);
  expect(writes()).toHaveLength(3);
});
it("lost publication acknowledgement retains the manifest and never creates a replacement command", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  let lost = true;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/bundle-listings") && lost) {
      lost = false;
      return Promise.reject(Error("Response lost"));
    }
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Confirmation pending");
  await user.click(
    screen.getByRole("button", { name: "Resume original command" }),
  );
  await screen.findByText("Bundle published");
  expect(writes()).toHaveLength(3);
  expect(writes()[2]![2]).toEqual(writes()[1]![2]);
  expect(writes().filter((call) => call[0].endsWith("/bundles"))).toHaveLength(
    1,
  );
});
it("unconfirmed manifest evidence cannot start publication", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((p, s, b, m, o) =>
    p.endsWith("/bundles")
      ? Promise.resolve({ acknowledged: true })
      : original(p, s, b, m, o),
  );
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Confirmation pending");
  expect(writes()).toHaveLength(1);
  expect(screen.queryByText("Bundle published")).toBeNull();
});
it("retiring a session before the manifest reply prevents any follow-on command", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  let resolve!: (value: unknown) => void;
  let body!: ManifestCommand;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/bundles")) {
      body = b as ManifestCommand;
      return new Promise((r) => {
        resolve = r;
      });
    }
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup();
  const view = render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  view.rerender(
    <BundleComposer
      {...props}
      session={{ ...session, token: "new-authority" }}
    />,
  );
  resolve(manifestReceipt(body));
  await screen.findByRole("button", { name: "Check original bundle" });
  expect(
    screen.queryByRole("checkbox", { name: /certificate-one/ }),
  ).toBeNull();
  await waitFor(() =>
    expect(screen.queryByText("Confirming bundle...")).toBeNull(),
  );
  expect(writes()).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("Enterprise sessions use the same canonical commands and never personal eWaste account reads", async () => {
  const enterpriseOwner = {
    ...ownerRef,
    schema: "enterprise" as const,
    code: "enterprise-one",
  };
  const enterpriseSession = {
    token: "enterprise-access",
    loginId: "employee-one",
    kind: "ENTERPRISE" as const,
    enterpriseCode: enterpriseOwner.code,
  };
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((p, s, b, m, o) =>
    p.endsWith("/holdings/certificates")
      ? Promise.resolve({ ...certificatePage, ownerRef: enterpriseOwner })
      : original(p, s, b, m, o),
  );
  const user = userEvent.setup();
  render(
    <BundleComposer
      {...props}
      session={enterpriseSession}
      ownerRef={enterpriseOwner}
    />,
  );
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Bundle published");
  expect((writes()[0]![2] as ManifestCommand).ownerRef).toEqual(
    enterpriseOwner,
  );
  expect(writes().every((call) => call[1] === enterpriseSession)).toBe(true);
  expect(
    vi.mocked(request).mock.calls.some((call) => call[0].includes("/eWaste/")),
  ).toBe(false);
});
it("rejects an Enterprise owner that differs from the represented session before reading", () => {
  render(
    <BundleComposer
      {...props}
      session={{
        token: "enterprise-access",
        loginId: "staff",
        kind: "ENTERPRISE",
        enterpriseCode: "enterprise-one",
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Bundle owner is unavailable.",
  );
  expect(request).not.toHaveBeenCalled();
});

it("closing review produces no manifest or business command", async () => {
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(writes()).toHaveLength(0);
  expect(screen.getByLabelText("Bundle name")).toHaveValue(
    "Certificate package",
  );
});
it("rapid confirmations share one in-flight original command", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  let resolve!: (value: unknown) => void;
  let body!: ManifestCommand;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/bundles")) {
      body = b as ManifestCommand;
      return new Promise((r) => {
        resolve = r;
      });
    }
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  const confirm = screen.getByRole("button", { name: "Confirm bundle" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(writes()).toHaveLength(1);
  resolve(manifestReceipt(body));
  await screen.findByText("Bundle published");
  expect(writes()).toHaveLength(2);
});
it("uncertain gift creation resumes only its frozen recipient and original key", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  let lost = true;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/gifts") && lost) {
      lost = false;
      return Promise.reject(Error("Gift response lost"));
    }
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await selectCertificate(user);
  await user.click(screen.getByRole("button", { name: "Gift" }));
  await user.type(screen.getByLabelText("Find recipient"), "Alex");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("radio", { name: /Alex/ }));
  await user.click(screen.getByRole("button", { name: "Review bundle" }));
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Confirmation pending");
  expect(writes()).toHaveLength(2);
  await user.click(
    screen.getByRole("button", { name: "Resume original command" }),
  );
  await screen.findByText("Gift awaiting acceptance");
  expect(writes()).toHaveLength(3);
  expect(writes()[2]![2]).toEqual(writes()[1]![2]);
});
it("keeps carbon selections across owner pages and clears them on explicit refresh", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((p, s, b, m, o) => {
    if (p.endsWith("/carbon/holdings")) {
      const page = (b as { page: number }).page;
      return Promise.resolve({
        ...carbonPage,
        page,
        limit: 1,
        total: 2,
        items: [{ ...lot, lotCode: page === 1 ? "lot-one" : "lot-two" }],
      });
    }
    return original(p, s, b, m, o);
  });
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await user.click(screen.getByRole("button", { name: "Add carbon" }));
  await user.click(
    await screen.findByRole("checkbox", { name: "Select carbon lot-one" }),
  );
  await user.type(screen.getByLabelText("Quantity lot-one"), "1.001");
  await user.click(screen.getByRole("button", { name: "Next carbon page" }));
  await screen.findByRole("checkbox", { name: "Select carbon lot-two" });
  expect(screen.getByText("Carbon holding · lot-one: 1.001 tCO2e")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Refresh carbon holdings" }),
  );
  await screen.findByRole("checkbox", { name: "Select carbon lot-two" });
  expect(screen.queryByText("Carbon holding · lot-one: 1.001 tCO2e")).toBeNull();
});
it("replaced owner publication evidence cannot be displayed as success", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation((p, s, b, m, o) =>
    p.endsWith("/bundle-listings")
      ? Promise.resolve({
          ...publishedReceipt(b as Record<string, unknown>),
          startsAt: "2000-01-01T00:00:00.000Z",
        })
      : original(p, s, b, m, o),
  );
  const user = userEvent.setup();
  render(<BundleComposer {...props} />);
  await fixedReview(user);
  await user.click(screen.getByRole("button", { name: "Confirm bundle" }));
  await screen.findByText("Confirmation pending");
  expect(screen.queryByText("Bundle published")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Create another bundle" }),
  ).toBeNull();
});
