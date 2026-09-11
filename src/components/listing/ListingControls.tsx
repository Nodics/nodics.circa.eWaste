import { listingPageSizes } from "./listingOptions";
import {
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  List,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import "./listingControls.css";

export type ListingLayout = "grid" | "list";
type Copy = (key: string, fallback: string) => string;
const fallbackCopy: Copy = (_key, fallback) => fallback;
/** Shared listing interactions for customer collections and the public catalogue. Data and filters remain owned by each caller. */
export function ListingToolbar({
  query,
  onQuery,
  layout,
  onLayout,
  sort,
  onSort,
  sorts,
  onFilters,
  filterCount = 0,
  onRefresh,
  busy,
  disabled = false,
  copy = fallbackCopy,
  className = "",
}: {
  query: string;
  onQuery: (value: string) => void;
  layout: ListingLayout;
  onLayout: (value: ListingLayout) => void;
  sort: string;
  onSort: (value: string) => void;
  sorts: { code: string; label: string }[];
  onFilters: () => void;
  filterCount?: number;
  onRefresh: () => void;
  busy: boolean;
  disabled?: boolean;
  copy?: Copy;
  className?: string;
}) {
  return (
    <div className={`listing-toolbar ${className}`}>
      <label className="listing-search">
        <Search size={19} />
        <span className="listing-sr-only">
          {copy("searchLabel", "Search your items")}
        </span>
        <input
          type="search"
          value={query}
          maxLength={180}
          placeholder={copy(
            "searchPlaceholder",
            "Search by item, brand or reference…",
          )}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="listing-filter-button"
        disabled={disabled}
        onClick={onFilters}
      >
        <SlidersHorizontal size={18} />
        {copy("filters", "Filters")}
        {filterCount > 0 && <span>{filterCount}</span>}
      </button>
      <div
        className="listing-layout-controls"
        role="group"
        aria-label={copy("layoutLabel", "Listing layout")}
      >
        <button
          type="button"
          aria-label={copy("gridView", "Grid view")}
          aria-pressed={layout === "grid"}
          onClick={() => onLayout("grid")}
        >
          <Grid2X2 size={19} />
        </button>
        <button
          type="button"
          aria-label={copy("listView", "List view")}
          aria-pressed={layout === "list"}
          onClick={() => onLayout("list")}
        >
          <List size={20} />
        </button>
      </div>
      <label className="listing-sort">
        <span>{copy("sortBy", "Sort by")}</span>
        <select
          aria-label={copy("sortBy", "Sort by")}
          value={sort}
          disabled={disabled}
          onChange={(event) => onSort(event.target.value)}
        >
          {sorts.map((value) => (
            <option key={value.code} value={value.code}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="listing-refresh"
        onClick={onRefresh}
        disabled={busy}
        aria-label={copy("refreshItems", "Refresh items")}
      >
        <RefreshCw size={18} className={busy ? "listing-spinning" : ""} />
      </button>
    </div>
  );
}
/** Shared previous/next pagination with explicit, accessible page state. */
export function ListingPagination({
  page,
  pageSize,
  total,
  busy,
  onPage,
  copy = fallbackCopy,
  className = "",
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
  copy?: Copy;
  className?: string;
}) {
  if (total <= pageSize) return null;
  return (
    <nav
      className={`listing-pagination ${className}`}
      aria-label={copy("pagination", "Item pages")}
    >
      <button disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        <ArrowLeft size={17} />
        {copy("previous", "Previous")}
      </button>
      <span>
        {copy("page", "Page")} {page} {copy("of", "of")}{" "}
        {Math.ceil(total / pageSize)}
      </span>
      <button
        disabled={busy || page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        {copy("next", "Next")}
        <ArrowRight size={17} />
      </button>
    </nav>
  );
}

/** One page-size selector for public and private listings; the caller resets its page and requests fresh results. */
export function ListingPageSize({
  value,
  onChange,
  copy = fallbackCopy,
}: {
  value: number;
  onChange: (value: number) => void;
  copy?: Copy;
}) {
  const label = copy("perPage", "Per page");
  return (
    <label className="listing-page-size">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {listingPageSizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
