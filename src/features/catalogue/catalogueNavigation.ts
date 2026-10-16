import { listingPageSizes } from "../../components/listing/listingOptions";
import type { Offer } from "../../api";
export type CatalogueQuery = {
  q: string;
  category: string;
  condition: string;
  issuer: string;
  minPoints: string;
  maxPoints: string;
  validUntil: string;
  sort: string;
  page: number;
  pageSize: number;
  layout: "grid" | "list";
};
export const emptyCatalogueQuery: CatalogueQuery = {
  q: "",
  category: "",
  condition: "",
  issuer: "",
  minPoints: "",
  maxPoints: "",
  validUntil: "",
  sort: "FEATURED",
  page: 1,
  pageSize: 12,
  layout: "grid",
};
/** Keeps catalogue state in the URL for direct links, refresh and browser back. The server validates independently. */
export function readCatalogueQuery(
  url = new URL(window.location.href),
): CatalogueQuery {
  const value = { ...emptyCatalogueQuery },
    params = url.searchParams;
  for (const key of [
    "q",
    "category",
    "condition",
    "issuer",
    "minPoints",
    "maxPoints",
    "validUntil",
    "sort",
  ] as const)
    if (params.has(key)) value[key] = params.get(key) || "";
  value.layout = params.get("layout") === "list" ? "list" : "grid";
  value.page = /^[1-9]\d{0,3}$/.test(params.get("page") || "")
    ? Number(params.get("page"))
    : 1;
  value.pageSize = listingPageSizes.some(
    (size) => size === Number(params.get("pageSize")),
  )
    ? Number(params.get("pageSize"))
    : 12;
  return value;
}
export function catalogueParams(query: CatalogueQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== "") params.set(key, String(value));
  return params;
}
export function cataloguePath(kind: Offer["kind"]) {
  return kind === "ASSET" ? "/shop" : "/coupons";
}
export function productHref(
  offer: Pick<Offer, "code" | "kind">,
  query?: CatalogueQuery,
  mobile = false,
) {
  if (mobile) return catalogueHref(offer.kind, query, offer.code);
  return `${cataloguePath(offer.kind)}/${encodeURIComponent(offer.code)}${query ? "?" + catalogueParams(query) : ""}`;
}

export function readMobileCatalogue(url = new URL(window.location.href)) {
  const shop = url.searchParams.get("shop");
  if (shop !== "assets" && shop !== "coupons") return null;
  const product = url.searchParams.get("product");
  return {
    kind: shop === "assets" ? "ASSET" as const : "COUPON" as const,
    code: product === null
      ? null
      : /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(product) ? product : "",
  };
}

/** Host parameters are navigation context only, never catalogue API selectors. */
export function catalogueHref(
  kind: Offer["kind"],
  query?: CatalogueQuery,
  code?: string,
) {
  const url = new URL(window.location.href);
  for (const key of [
    "account", "view", "asset", "submission", "tab", "status", "categoryCode",
    "itemTypeCode", "dateFrom", "dateTo", "limit", "product",
    ...Object.keys(emptyCatalogueQuery),
  ]) url.searchParams.delete(key);
  url.searchParams.set("shop", kind === "ASSET" ? "assets" : "coupons");
  if (query)
    catalogueParams(query).forEach((value, key) => url.searchParams.set(key, value));
  if (code !== undefined) url.searchParams.set("product", code);
  return url.pathname + url.search + url.hash;
}
