import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CataloguePage, CatalogueProductPage } from "./CataloguePage";
import { request, type Offer } from "../../api";
import { ProductGallery } from "./ProductContent";
vi.mock("../../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api")>()),
  request: vi.fn(),
}));
const call = vi.mocked(request);
const offer: Offer = {
  code: "CPN_1",
  kind: "COUPON",
  name: "Repair credit",
  issuer: "Repair partner",
  rewardPrice: 10,
  revision: "published-v1",
  imageUrl: "/media/coupon.svg",
  expiresAt: "2099-12-31T23:59:59Z",
  terms: ["Use once at the partner."],
};
const listing = {
  kind: "COUPON",
  items: [offer],
  total: 25,
  page: 1,
  pageSize: 12,
  facets: {
    categories: [],
    conditions: [],
    issuers: [{ code: "Repair partner", label: "Repair partner" }],
  },
};
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  history.replaceState({}, "", "/coupons");
  call.mockReset();
  call.mockImplementation(async (path) =>
    String(path).includes("/catalogue/") ? offer : listing,
  );
});
afterEach(cleanup);
it("loads server pagination, shares layout controls, and preserves listing state in detail links", async () => {
  const user = userEvent.setup();
  render(<CataloguePage kind="COUPON" />);
  await screen.findByRole("heading", { name: "Repair credit" });
  await user.click(screen.getByRole("button", { name: "List view" }));
  expect(document.querySelector(".catalogue-items-list")).toBeTruthy();
  const link = screen.getByRole("link", {
    name: "View details: Repair credit",
  });
  expect(link.getAttribute("href")).toContain("layout=list");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(
      call.mock.calls.some(([path]) => String(path).includes("page=2")),
    ).toBe(true),
  );
  expect(window.location.search).toContain("page=2");
});
it("filters require Apply, can be cancelled, and send only selected criteria to the server", async () => {
  const user = userEvent.setup();
  render(<CataloguePage kind="COUPON" />);
  await screen.findByRole("heading", { name: "Repair credit" });
  await user.click(screen.getByRole("button", { name: "Filters" }));
  const dialog = screen.getByRole("dialog", { name: "Advanced filters" });
  await user.selectOptions(
    within(dialog).getByLabelText("Partner"),
    "Repair partner",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Close dialog" }),
  );
  expect(window.location.search).not.toContain("issuer=");
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.type(screen.getByLabelText("Minimum points"), "20");
  await user.type(screen.getByLabelText("Maximum points"), "10");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Minimum points");
  await user.clear(screen.getByLabelText("Maximum points"));
  await user.type(screen.getByLabelText("Maximum points"), "30");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() =>
    expect(
      call.mock.calls.some(
        ([path]) =>
          String(path).includes("minPoints=20") &&
          String(path).includes("maxPoints=30"),
      ),
    ).toBe(true),
  );
});
it("quick view fetches fresh details and never performs a purchase", async () => {
  const user = userEvent.setup();
  render(<CataloguePage kind="COUPON" />);
  await screen.findByRole("heading", { name: "Repair credit" });
  await user.click(
    screen.getByRole("button", { name: "Quick view: Repair credit" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Quick view" });
  await within(dialog).findByRole("link", { name: "Open full details" });
  expect(call).toHaveBeenCalledWith(
    expect.stringContaining("/catalogue/CPN_1?kind=COUPON"),
    null,
    undefined,
    "GET",
    expect.anything(),
  );
  expect(
    within(dialog).queryByRole("button", { name: /purchase/i }),
  ).toBeNull();
  expect(call.mock.calls.every(([, , body]) => body === undefined)).toBe(true);
  await user.click(
    within(dialog).getByRole("button", { name: "Close dialog" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("direct detail ignores list filtering and offers explicit published terms and missing information", async () => {
  history.replaceState(
    {},
    "",
    "/coupons/CPN_1?q=unmatched&page=20&layout=list",
  );
  render(
    <CatalogueProductPage
      code="CPN_1"
      kind="COUPON"
      renderPurchase={() => <button>Review purchase</button>}
    />,
  );
  await screen.findByRole("heading", { level: 1, name: "Repair credit" });
  expect(call.mock.calls).toHaveLength(1);
  expect(String(call.mock.calls[0][0])).toBe(
    "/nodics/circa.ewaste/v0/catalogue/CPN_1?kind=COUPON",
  );
  expect(screen.getByText("Use once at the partner.")).toBeVisible();
  expect(
    screen.getByText(
      "Eligibility requirements have not been provided by the publisher.",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Back to coupons" }).getAttribute("href"),
  ).toContain("q=unmatched");
});
it("unavailable details keep purchase actions hidden and retry can recover", async () => {
  const user = userEvent.setup();
  call.mockRejectedValueOnce(new Error("Product unavailable"));
  render(
    <CatalogueProductPage
      code="CPN_1"
      kind="COUPON"
      renderPurchase={() => <button>Review purchase</button>}
    />,
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Review purchase" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Review purchase" });
});
it("cross-kind backend responses cannot render a purchase action", async () => {
  call.mockResolvedValue({ ...offer, kind: "ASSET" });
  render(
    <CatalogueProductPage
      code="CPN_1"
      kind="COUPON"
      renderPurchase={() => <button>Review purchase</button>}
    />,
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Review purchase" })).toBeNull();
});
it("late responses after a product change cannot replace the current details", async () => {
  let resolveFirst: (value: Offer) => void = () => {};
  call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve as typeof resolveFirst;
      }),
  );
  const { rerender } = render(
    <CatalogueProductPage
      code="OLD"
      kind="COUPON"
      renderPurchase={() => null}
    />,
  );
  rerender(
    <CatalogueProductPage
      code="CPN_1"
      kind="COUPON"
      renderPurchase={() => null}
    />,
  );
  await screen.findByRole("heading", { level: 1, name: "Repair credit" });
  resolveFirst({ ...offer, code: "OLD", name: "Old product" });
  await waitFor(() => expect(screen.queryByText("Old product")).toBeNull());
});
it("gallery selection changes the main image and failed artwork becomes a placeholder", async () => {
  const user = userEvent.setup();
  render(
    <ProductGallery
      offer={{
        ...offer,
        gallery: [
          { url: "/media/one.svg", alt: "Front" },
          { url: "/media/two.svg", alt: "Back" },
        ],
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "View photo 2" }));
  const main = document.querySelector<HTMLImageElement>(
    ".catalogue-gallery-main img",
  )!;
  expect(main.alt).toBe("Back");
  fireEvent.error(main);
  expect(
    screen.getByRole("img", { name: "No image available for Back" }),
  ).toBeVisible();
});
it("invalid saved selectors can reset without being trapped in an error retry loop", async () => {
  history.replaceState({}, "", "/coupons?sort=INVALID");
  call.mockRejectedValueOnce(new Error("Invalid catalogue sort"));
  const user = userEvent.setup();
  render(<CataloguePage kind="COUPON" />);
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Reset listing" }));
  await screen.findByRole("heading", { name: "Repair credit" });
  expect(new URL(window.location.href).searchParams.get("sort")).toBe(
    "FEATURED",
  );
});
