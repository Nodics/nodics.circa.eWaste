import { listingPageSizes } from "../../components/listing/listingOptions";
import type { WasteQuery, WasteSelection } from "./wasteTypes";

export const emptyWasteQuery: WasteQuery = {
  view: "submissions",
  q: "",
  status: "ALL",
  categoryCode: "",
  itemTypeCode: "",
  dateFrom: "",
  dateTo: "",
  sort: "RECENT",
  page: 1,
  limit: 12,
};
const codePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;

/** UI query state is portable across back navigation; the backend independently validates every selector. */
export function readWasteQuery(
  url = new URL(window.location.href),
): WasteQuery {
  const params = url.searchParams;
  const query = { ...emptyWasteQuery };
  for (const key of [
    "q",
    "status",
    "categoryCode",
    "itemTypeCode",
    "dateFrom",
    "dateTo",
    "sort",
  ] as const)
    if (params.has(key)) query[key] = params.get(key) || "";
  query.view =
    params.get("view") === "assets" ||
    url.pathname.startsWith("/account/assets/") ||
    params.has("asset")
      ? "assets"
      : params.get("view") === "drafts" || params.get("status") === "DRAFT"
        ? "drafts"
        : "submissions";
  // Previously shared draft-filter links now open the separate unfinished collection.
  if (params.get("view") !== "drafts" && query.view === "drafts")
    query.status = "ALL";
  query.page = /^[1-9]\d*$/.test(params.get("page") || "")
    ? Number(params.get("page"))
    : 1;
  const limit = Number(params.get("limit"));
  if (listingPageSizes.some((size) => size === limit)) query.limit = limit;
  return query;
}
export function readWasteSelection(mobile: boolean): WasteSelection | null {
  const url = new URL(window.location.href);
  const resource = mobile
    ? url.searchParams.has("asset")
      ? "assets"
      : "submissions"
    : url.pathname.startsWith("/account/assets/")
      ? "assets"
      : "submissions";
  const raw = mobile
    ? url.searchParams.get(resource === "assets" ? "asset" : "submission")
    : url.pathname.match(/^\/account\/(?:assets|submissions)\/([^/]+)$/)?.[1];
  let code: string;
  try {
    code = decodeURIComponent(raw || "");
  } catch {
    return null;
  }
  return codePattern.test(code) ? { resource, code } : null;
}
export function wasteQueryParams(query: WasteQuery): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== "") params.set(key, String(value));
  });
  return params;
}
/** Preserves host launch parameters while changing only the customer view and item selector. */
export function wasteHref(
  query: WasteQuery,
  selection: WasteSelection | null,
  mobile: boolean,
): string {
  const url = new URL(window.location.href);
  if (!mobile)
    url.pathname = selection
      ? `/account/${selection.resource}/${encodeURIComponent(selection.code)}`
      : "/account/items";
  for (const [key, value] of Object.entries(query)) {
    if (value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  url.searchParams.delete("submission");
  url.searchParams.delete("asset");
  url.searchParams.delete("account");
  if (mobile && selection)
    url.searchParams.set(
      selection.resource === "assets" ? "asset" : "submission",
      selection.code,
    );
  if (!mobile) url.hash = "";
  return url.pathname + url.search + url.hash;
}
