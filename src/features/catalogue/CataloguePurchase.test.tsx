/** Request fixtures for shared Cart/Checkout, not connected payment or ownership acceptance. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionPage } from "../../CircaApp";
import { request, commandKey, type Offer, type Session } from "../../api";
import {pendingReferenceKey} from '../../pendingReferences';
vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  request: vi.fn(),
  commandKey: vi.fn(),
}));
vi.mock("../../CollectionMap", () => ({ CollectionMap: () => null }));
const offer: Offer = {
  code: "CPN_1",
  kind: "COUPON",
  name: "Repair credit",
  rewardPrice: "10.25",
  revision: "v7",
  available: true,
  acquisitionRequirements: { type: "REWARDS" },
  commerce: {
    storeCode: "partner-store",
    currency: "POINTS",
    jurisdiction: "AE",
    locale: "en",
    programCode: "program",
    rewardTypeCode: "points",
    variantCode: "unit",
  },
};
const wallet = {
  owner: { ownerType: "CUSTOMER", ownerCode: "buyer" },
  wallet: { code: "wallet" },
  balances: [
    { programCode: "program", rewardTypeCode: "points", available: "100.25" },
  ],
};
const session: Session = { token: "test", loginId: "buyer" };
const call = vi.mocked(request);
const added = (amount = "10.25") => ({
  cart: { code: "purchase-key-1-cart", revision: 3 },
  entries: [{ code: "purchase-key-1-entry", productCode: "CPN_1" }],
  calculation: {
    code: "calculation",
    currency: "POINTS",
    totalAmount: amount,
    cartCode: "purchase-key-1-cart",
  },
});
beforeEach(() => {
  sessionStorage.clear();
  call.mockReset();
  let n = 0;
  vi.mocked(commandKey).mockImplementation(() => "key-" + ++n);
});
afterEach(cleanup);
function retainOriginal() {
  const storageKey = pendingReferenceKey(session, 'checkout', undefined, offer.code);
  const reference = {key:'original',cartCode:'purchase-original-cart',orderCode:'purchase-original'};
  sessionStorage.setItem(storageKey, JSON.stringify(reference));
  return {storageKey,reference};
}
it('explicitly retires a scope-matched COMPENSATED intent without dispatch and preserves its visible reference', async()=>{
  const {storageKey,reference}=retainOriginal();
  call.mockResolvedValueOnce({...reference,status:'COMPENSATED',scopeQualified:true});
  view();
  const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Check original purchase'}));
  await user.click(await screen.findByRole('button',{name:'Start a new purchase'}));
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  expect(screen.getByRole('region',{name:'Previous purchase attempts'})).toHaveTextContent('COMPENSATED · Reference: original');
  expect(screen.getByRole('button',{name:'Review coupon purchase'})).toBeEnabled();
  expect(call).toHaveBeenCalledTimes(1);
  prepare();
  await user.click(screen.getByRole('button',{name:'Review coupon purchase'}));
  await screen.findByRole('dialog');
  expect(call.mock.calls[2]?.[2]).toMatchObject({cartCode:'purchase-key-1-cart'});
  expect(call.mock.calls.some(([path])=>/\/place$|\/resume$|refund/.test(path))).toBe(false);
});
it.each([
  {status:'UNKNOWN',scopeQualified:true},
  {status:'COMPENSATION_REQUIRED',scopeQualified:true,recoveryAction:'RESUME_COUPON_PURCHASE'},
  {status:'COMPENSATED',scopeQualified:false},
  {status:'COMPENSATED',scopeQualified:true,orderCode:'foreign'},
  {status:'COMPENSATED',scopeQualified:true,cartCode:'foreign'},
])('does not retire a nonterminal or foreign outcome %j',async outcome=>{
  const {storageKey,reference}=retainOriginal();
  call.mockResolvedValueOnce({...reference,...outcome});
  view();
  await userEvent.setup().click(screen.getByRole('button',{name:'Check original purchase'}));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button',{name:'Start a new purchase'})).toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBe(JSON.stringify(reference));
});
it('refuses to clear a newer retained reference after terminal read',async()=>{
  const {storageKey,reference}=retainOriginal();
  call.mockResolvedValueOnce({...reference,status:'COMPENSATED',scopeQualified:true});
  view();
  const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Check original purchase'}));
  const button=await screen.findByRole('button',{name:'Start a new purchase'});
  const newer={key:'newer',cartCode:'purchase-newer-cart',orderCode:'purchase-newer'};
  sessionStorage.setItem(storageKey,JSON.stringify(newer));
  await user.click(button);
  expect(sessionStorage.getItem(storageKey)).toBe(JSON.stringify(newer));
  expect(screen.getByRole('button',{name:'Review coupon purchase'})).toBeDisabled();
  expect(call).toHaveBeenCalledTimes(1);
});
it('ignores a terminal reply from an obsolete session',async()=>{
  const {storageKey,reference}=retainOriginal();
  let resolve!:(value:unknown)=>void;
  call.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
  const page=view();
  await userEvent.setup().click(screen.getByRole('button',{name:'Check original purchase'}));
  page.rerender(<TransactionPage {...page.props} session={{...session,token:'refreshed'}}/>);
  await act(async()=>resolve({...reference,status:'COMPENSATED',scopeQualified:true}));
  expect(screen.queryByRole('button',{name:'Start a new purchase'})).toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBe(JSON.stringify(reference));
});
it('offers explicit fresh start in the attempted purchase dialog without another placement',async()=>{
  prepare();
  call.mockRejectedValueOnce(new Error('Unconfirmed')).mockResolvedValueOnce({status:'COMPENSATED',scopeQualified:true,orderCode:'purchase-key-1',cartCode:'purchase-key-1-cart'});
  view();
  const user=await review();
  await user.click(screen.getByRole('button',{name:'Confirm purchase'}));
  await user.click(await screen.findByRole('button',{name:'Check purchase'}));
  await user.click(await screen.findByRole('button',{name:'Start a new purchase'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region',{name:'Previous purchase attempts'})).toHaveTextContent('key-1');
  expect(screen.getByRole('button',{name:'Review coupon purchase'})).toBeEnabled();
  expect(call.mock.calls.filter(([path])=>path.endsWith('/place'))).toHaveLength(1);
  expect(sessionStorage.length).toBe(0);
});
function view(value = offer, owner: Session | null = session) {
  const complete = vi.fn(),
    login = vi.fn();
  const props = {
    offer: value,
    wallet: null,
    session: owner,
    onLogin: login,
    onComplete: complete,
  };
  return { ...render(<TransactionPage {...props} />), complete, login, props };
}
function prepare(amount = "10.25") {
  call
    .mockResolvedValueOnce(wallet)
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce(added(amount));
}
async function review() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", {
      name: /Review coupon purchase|Review purchase/,
    }),
  );
  await screen.findByRole("dialog");
  return user;
}
it("prepares one Cart calculation and cancelling review never places an order", async () => {
  prepare();
  view();
  const user = await review();
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("10.25 POINTS")).toBeVisible();
  expect(within(dialog).getByText("100.25")).toBeVisible();
  expect(call.mock.calls.map((row) => row[0])).toEqual([
    "/nodics/loyaltyApi/v0/participant/wallet",
    "/nodics/cart/v0/carts",
    "/nodics/cart/v0/carts/purchase-key-1-cart/entries",
  ]);
  await user.click(
    within(dialog).getByRole("button", { name: "Close dialog" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(call).toHaveBeenCalledTimes(3);
});
it("explicit confirmation sends exact decimals and completes only on a matching receipt", async () => {
  prepare();
  call.mockResolvedValueOnce({
    status: "COMPLETED",
    code: "purchase-key-1",
    orderCode: "purchase-key-1",
    cartCode: "purchase-key-1-cart",
  });
  const { complete } = view();
  const user = await review();
  expect(complete).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByText("Your coupon is ready.");
  expect(call.mock.calls[3]).toEqual([
    "/nodics/checkoutCore/v0/checkouts/place",
    session,
    {
      cartCode: "purchase-key-1-cart",
      orderCode: "purchase-key-1",
      expectedCartRevision: 3,
      calculationCode: "calculation",
      idempotencyKey: "key-1",
      paymentMethod: "LOYALTY_REWARD",
      walletCode: "wallet",
      programCode: "program",
      rewardTypeCode: "points",
      rewardCurrency: "POINTS",
      rewardAmount: "10.25",
    },
  ]);
  expect(complete).toHaveBeenCalledTimes(1);
});
it("uncertain placement uses read-only inspection, never a second purchase", async () => {
  prepare();
  call
    .mockRejectedValueOnce(new Error("Outcome unavailable"))
    .mockResolvedValueOnce({
      status: "COMPLETED",
      scopeQualified: true,
      orderCode: "purchase-key-1",
      cartCode: "purchase-key-1-cart",
    })
    .mockResolvedValueOnce({ status: "COMPLETED", code: "purchase-key-1" });
  const { complete } = view();
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Confirm purchase" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  await user.click(
    screen.getByRole("button", { name: "View purchase status" }),
  );
  await user.click(screen.getByRole("button", { name: "Check purchase" }));
  await screen.findByText("Your coupon is ready.");
  expect(
    call.mock.calls.filter((row) => row[0].endsWith("/place")),
  ).toHaveLength(1);
  expect(call.mock.calls.slice(-2).map((row) => row[0])).toEqual([
    "/nodics/checkoutCore/v0/checkouts/commands/key-1",
    "/nodics/checkoutCore/v0/checkouts/purchase-key-1",
  ]);
  expect(complete).toHaveBeenCalledTimes(1);
});
it("mismatched calculation cannot open confirmation", async () => {
  call
    .mockResolvedValueOnce(wallet)
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({
      ...added(),
      calculation: { ...added().calculation, cartCode: "other" },
    });
  view();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Review coupon purchase/ }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it.each(["RESUME_BUNDLE_PURCHASE", "RESUME_COUPON_PURCHASE"])(
  "qualified %s resumes the original purchase without another placement or payment payload",
  async (recoveryAction) => {
    prepare();
    call
      .mockRejectedValueOnce(new Error("Outcome unavailable"))
      .mockResolvedValueOnce({
        status: "COMPENSATION_REQUIRED",
        scopeQualified: true,
        orderCode: "purchase-key-1",
        cartCode: "purchase-key-1-cart",
        recoveryAction,
      })
      .mockResolvedValueOnce({ status: "COMPLETED" })
      .mockResolvedValueOnce({
        status: "COMPLETED",
        scopeQualified: true,
        orderCode: "purchase-key-1",
        cartCode: "purchase-key-1-cart",
      })
      .mockResolvedValueOnce({ status: "COMPLETED", code: "purchase-key-1" });
    const { complete } = view();
    const user = await review();
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Continue original purchase" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Check purchase" }));
    await user.click(
      await screen.findByRole("button", { name: "Continue original purchase" }),
    );
    await screen.findByText("Your coupon is ready.");
    expect(
      call.mock.calls.filter((row) => row[0].endsWith("/place")),
    ).toHaveLength(1);
    expect(
      call.mock.calls.find((row) => row[0].endsWith("/recovery/resume")),
    ).toEqual([
      "/nodics/checkoutCore/v0/checkouts/key-1/recovery/resume",
      session,
      { confirmed: true },
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { scopeQualified: false, recoveryAction: "RESUME_BUNDLE_PURCHASE" },
  { scopeQualified: true, recoveryAction: "UNRECOGNIZED_ACTION" },
  { scopeQualified: true, recoveryAction: undefined },
])("unqualified recovery is never offered: %j", async (evidence) => {
  prepare();
  call
    .mockRejectedValueOnce(new Error("Outcome unavailable"))
    .mockResolvedValueOnce({
      status: "COMPENSATION_REQUIRED",
      orderCode: "purchase-key-1",
      cartCode: "purchase-key-1-cart",
      ...evidence,
    });
  view();
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Check purchase" }));
  expect(
    screen.queryByRole("button", { name: "Continue original purchase" }),
  ).toBeNull();
  expect(
    call.mock.calls.some((row) => row[0].endsWith("/recovery/resume")),
  ).toBe(false);
});
it("lost recovery acknowledgement requires another status read before recovery is offered again", async () => {
  prepare();
  call
    .mockRejectedValueOnce(new Error("Outcome unavailable"))
    .mockResolvedValueOnce({
      status: "COMPENSATION_REQUIRED",
      scopeQualified: true,
      orderCode: "purchase-key-1",
      cartCode: "purchase-key-1-cart",
      recoveryAction: "RESUME_BUNDLE_PURCHASE",
    })
    .mockRejectedValueOnce(new Error("Recovery outcome unavailable"));
  const { complete } = view();
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Check purchase" }));
  await user.click(
    await screen.findByRole("button", { name: "Continue original purchase" }),
  );
  await screen.findByText("Recovery outcome unavailable");
  expect(
    screen.queryByRole("button", { name: "Continue original purchase" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Check purchase" })).toBeEnabled();
  expect(complete).not.toHaveBeenCalled();
});
it("Enterprise checkout preserves the signed employee session", async () => {
  call
    .mockResolvedValueOnce({
      ...wallet,
      owner: { ownerType: "ENTERPRISE", ownerCode: "buyer-enterprise" },
    })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce(added());
  const owner: Session = {
    kind: "ENTERPRISE",
    token: "employee-proof",
    loginId: "staff",
    enterpriseCode: "buyer-enterprise",
  };
  view(offer, owner);
  await review();
  expect(call.mock.calls.every((row) => row[1] === owner)).toBe(true);
});
it("an Enterprise cannot use a personal wallet projection", async () => {
  call.mockResolvedValueOnce(wallet);
  view(offer, {
    kind: "ENTERPRISE",
    token: "employee-proof",
    loginId: "staff",
    enterpriseCode: "buyer-enterprise",
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Review coupon purchase/ }));
  await screen.findByText("The wallet does not match the current account.");
  expect(call).toHaveBeenCalledTimes(1);
});
it("a completed command bound to another order cannot complete the reviewed purchase", async () => {
  prepare();
  call
    .mockRejectedValueOnce(new Error("Outcome unavailable"))
    .mockResolvedValueOnce({
      status: "COMPLETED",
      scopeQualified: true,
      orderCode: "other-order",
      cartCode: "purchase-key-1-cart",
    });
  const { complete } = view();
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Check purchase" }));
  await screen.findByText(
    "The original purchase reference does not match this order.",
  );
  expect(complete).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledTimes(5);
});
it("certificate-only coupon needs no wallet and sends no payment fields", async () => {
  call
    .mockResolvedValueOnce({
      contractVersion: 1,
      ownerRef: { module: "profile", schema: "customer", code: "buyer" },
      page: 1,
      limit: 25,
      total: 1,
      items: [
        {
          code: "certificate",
          revision: 4,
          valid: true,
          available: true,
          brandCode: "brand",
        },
      ],
    })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce(added("0.00"))
    .mockResolvedValueOnce({
      status: "COMPLETED",
      code: "purchase-key-1",
      orderCode: "purchase-key-1",
      cartCode: "purchase-key-1-cart",
    });
  view({
    ...offer,
    acquisitionRequirements: {
      type: "CERTIFICATES",
      certificates: {
        quantity: 1,
        categoryCode: "PHONE",
        brandCodes: ["brand"],
        modelCodes: ["model"],
        milestoneCode: "RECYCLED",
      },
    },
  });
  const user = userEvent.setup();
  expect(screen.getByText("PHONE")).toBeVisible();
  expect(screen.getByText("RECYCLED")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeDisabled();
  await user.click(await screen.findByRole("checkbox"));
  await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByText("Your coupon is ready.");
  const payload = call.mock.calls.at(-1)?.[2];
  expect(payload).toMatchObject({
    couponSelections: { "purchase-key-1-entry": [["certificate"]] },
  });
  expect(payload).not.toHaveProperty("paymentMethod");
  expect(payload).not.toHaveProperty("walletCode");
  expect(call.mock.calls.some((row) => row[0].includes("/wallet"))).toBe(false);
});
it("current typed ownership blocks own-bundle cart mutation", async () => {
  call.mockResolvedValue(wallet);
  view({
    ...offer,
    kind: "ASSET",
    ownerRef: { module: "profile", schema: "customer", code: "buyer" },
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Review purchase" }));
  await screen.findByText("You own this bundle.");
  expect(call).toHaveBeenCalledTimes(1);
});
it("unavailable offers and missing Commerce binding cannot start checkout", () => {
  const v = view({ ...offer, available: false });
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeDisabled();
  v.rerender(
    <TransactionPage {...v.props} offer={{ ...offer, commerce: undefined }} />,
  );
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeDisabled();
  expect(call).not.toHaveBeenCalled();
});
it("unknown coupon consideration never defaults to a reward-only purchase", () => {
  view({ ...offer, acquisitionRequirements: undefined });
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeDisabled();
  expect(
    screen.getByText("This offer is not ready for checkout."),
  ).toBeVisible();
  expect(call).not.toHaveBeenCalled();
});
it("failed wallet refresh cannot create a cart", async () => {
  call.mockRejectedValueOnce(new Error("Wallet unavailable"));
  view();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Review coupon purchase/ }));
  await screen.findByText("Wallet unavailable");
  expect(call).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("account switching drops a late previous-owner review", async () => {
  let resolve!: (value: unknown) => void;
  call.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const v = view();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Review coupon purchase/ }));
  v.rerender(
    <TransactionPage
      {...v.props}
      session={{ token: "other", loginId: "other" }}
    />,
  );
  await act(async () => resolve(wallet));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});
it("restores an uncertain purchase across remount, token refresh and offer revision without a new placement", async () => {
  prepare();
  call.mockRejectedValueOnce(new Error("Acknowledgement lost"));
  const previous = view();
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByText("Acknowledgement lost");
  const stored = sessionStorage.getItem(sessionStorage.key(0)!);
  expect(JSON.parse(stored!)).toEqual({
    key: "key-1",
    cartCode: "purchase-key-1-cart",
    orderCode: "purchase-key-1",
  });
  expect(stored).not.toMatch(/token|wallet|certificate|balance/);
  previous.unmount();
  call.mockReset();
  call.mockResolvedValueOnce({ status: "UNCONFIRMED", scopeQualified: false });
  const next = view(
    { ...offer, revision: "v8" },
    { ...session, token: "renewed" },
  );
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Check original purchase" }),
  );
  await screen.findByText(/Purchase status: UNCONFIRMED/);
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][0]).toBe(
    "/nodics/checkoutCore/v0/checkouts/commands/key-1",
  );
  call
    .mockResolvedValueOnce({
      status: "COMPLETED",
      scopeQualified: true,
      cartCode: "purchase-key-1-cart",
      orderCode: "purchase-key-1",
    })
    .mockResolvedValueOnce({ status: "COMPLETED", code: "purchase-key-1" });
  await user.click(
    screen.getByRole("button", { name: "Check original purchase" }),
  );
  await screen.findByText("Your coupon is ready.");
  expect(next.complete).toHaveBeenCalledTimes(1);
  expect(sessionStorage.length).toBe(0);
  expect(
    call.mock.calls.every(
      ([url]) => !url.endsWith("/place") && !url.startsWith("/nodics/cart/"),
    ),
  ).toBe(true);
});
it("does not expose another owner or Enterprise's retained purchase reference", async () => {
  prepare();
  call.mockRejectedValueOnce(new Error("Acknowledgement lost"));
  const previous = view(),
    user = await review();
  await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
  await screen.findByText("Acknowledgement lost");
  previous.unmount();
  call.mockReset();
  const different = view(offer, { token: "different", loginId: "other" });
  expect(
    screen.queryByRole("region", { name: "Original purchase" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: /Review coupon purchase/ }),
  ).toBeEnabled();
  different.rerender(
    <TransactionPage
      {...different.props}
      session={{
        ...session,
        token: "enterprise",
        kind: "ENTERPRISE",
        enterpriseCode: "buyer-enterprise",
      }}
    />,
  );
  expect(screen.queryByText("Reference: key-1")).toBeNull();
  expect(call).not.toHaveBeenCalled();
});
it("refuses to dispatch when the recovery reference cannot be retained", async () => {
  prepare();
  view();
  const user = await review();
  const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  try {
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    await screen.findByText(
      "The original operation reference cannot be saved. Nothing new was sent.",
    );
    expect(call).toHaveBeenCalledTimes(3);
  } finally {
    save.mockRestore();
  }
});
for (const conflict of [
  { cartCode: undefined },
  { orderCode: "other" },
  { cartCode: "other" },
])
  it(`does not complete a receipt with missing or contradictory original bindings: ${JSON.stringify(conflict)}`, async () => {
    prepare();
    call.mockResolvedValueOnce({
      status: "COMPLETED",
      code: "purchase-key-1",
      orderCode: "purchase-key-1",
      cartCode: "purchase-key-1-cart",
      ...conflict,
    });
    const v = view(),
      user = await review();
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    await screen.findByText(/Purchase confirmation is pending/);
    expect(v.complete).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(1);
  });
