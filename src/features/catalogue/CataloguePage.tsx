import { publicMedia } from "../../cms";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Search, X } from "lucide-react";
import { APP_API, request, type Offer } from "../../api";
import { ReviewDialog } from "../../ReviewDialog";
import {
  ListingPagination,
  ListingPageSize,
  ListingToolbar,
} from "../../components/listing/ListingControls";
import {
  CatalogueCard,
  ProductGallery,
  ProductInformation,
  ProductSummary,
  humanize,
} from "./ProductContent";
import {
  catalogueParams,
  cataloguePath,
  emptyCatalogueQuery,
  productHref,
  readCatalogueQuery,
  type CatalogueQuery,
} from "./catalogueNavigation";
import type { CatalogueListing, CatalogueOption } from "./catalogueTypes";

const sorts = [
  { code: "FEATURED", label: "Featured" },
  { code: "POINTS_ASC", label: "Points: low to high" },
  { code: "POINTS_DESC", label: "Points: high to low" },
  { code: "NAME", label: "Name: A to Z" },
];
function FilterSelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: CatalogueOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {title}
      <select
        aria-label={title}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {title === "Condition" ? humanize(option.label) : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function CatalogueFilters({
  kind,
  query,
  facets,
  onApply,
  onClose,
}: {
  kind: Offer["kind"];
  query: CatalogueQuery;
  facets: CatalogueListing["facets"];
  onApply: (query: CatalogueQuery) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(query),
    [error, setError] = useState("");
  return (
    <ReviewDialog
      title="Advanced filters"
      onClose={onClose}
      className="catalogue-filter-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            draft.minPoints &&
            draft.maxPoints &&
            Number(draft.minPoints) > Number(draft.maxPoints)
          ) {
            setError("Minimum points must not exceed maximum points.");
            return;
          }
          onApply({ ...draft, page: 1 });
        }}
      >
        {kind === "ASSET" ? (
          <>
            <FilterSelect
              title="Category"
              value={draft.category}
              options={facets.categories}
              onChange={(category) => setDraft({ ...draft, category })}
            />
            <FilterSelect
              title="Condition"
              value={draft.condition}
              options={facets.conditions}
              onChange={(condition) => setDraft({ ...draft, condition })}
            />
          </>
        ) : (
          <>
            <FilterSelect
              title="Partner"
              value={draft.issuer}
              options={facets.issuers}
              onChange={(issuer) => setDraft({ ...draft, issuer })}
            />
            <label>
              Valid through
              <input
                type="date"
                value={draft.validUntil}
                onChange={(event) =>
                  setDraft({ ...draft, validUntil: event.target.value })
                }
              />
            </label>
          </>
        )}
        <fieldset>
          <legend>Reward points</legend>
          <label>
            Minimum points
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.minPoints}
              onChange={(event) =>
                setDraft({ ...draft, minPoints: event.target.value })
              }
            />
          </label>
          <label>
            Maximum points
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.maxPoints}
              onChange={(event) =>
                setDraft({ ...draft, maxPoints: event.target.value })
              }
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="catalogue-filter-actions">
          <button
            type="button"
            className="catalogue-secondary"
            onClick={() => {
              setDraft({
                ...emptyCatalogueQuery,
                q: draft.q,
                sort: draft.sort,
                layout: draft.layout,
                pageSize: draft.pageSize,
              });
              setError("");
            }}
          >
            Reset filters
          </button>
          <button className="primary" type="submit">
            Apply filters
          </button>
        </div>
      </form>
    </ReviewDialog>
  );
}
/** Direct product reads reject stale responses and never rely on a card cached from the listing. */
function useProduct(code: string, kind: Offer["kind"]) {
  const [data, setData] = useState<Offer | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setData(null);
    request<Offer>(
      `${APP_API}/catalogue/${encodeURIComponent(code)}?kind=${kind}`,
      null,
      undefined,
      "GET",
      { signal: controller.signal },
    )
      .then((value) => {
        if (active) {
          if (value.code !== code || value.kind !== kind)
            throw new Error("This product is unavailable.");
          setData(value);
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Product details could not load.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [code, kind, revision]);
  return { data, error, busy, retry: () => setRevision((value) => value + 1) };
}
function ProductLoadState({
  busy,
  error,
  retry,
}: {
  busy: boolean;
  error: string;
  retry: () => void;
}) {
  return busy ? (
    <p className="catalogue-loading" role="status">
      Loading product details…
    </p>
  ) : (
    <div className="catalogue-empty">
      <h2>Product details unavailable</h2>
      <p role="alert">{error}</p>
      <button className="primary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
function QuickView({
  code,
  kind,
  href,
  onClose,
}: {
  code: string;
  kind: Offer["kind"];
  href: string;
  onClose: () => void;
}) {
  const { data, busy, error, retry } = useProduct(code, kind);
  return (
    <ReviewDialog
      title="Quick view"
      onClose={onClose}
      className="catalogue-quick-dialog"
    >
      {data && !busy ? (
        <>
          <div className="catalogue-product-layout">
            <ProductGallery offer={data} />
            <ProductSummary offer={data} quick />
          </div>
          <a className="primary catalogue-open-details" href={href}>
            Open full details <ArrowUpRight size={17} />
          </a>
        </>
      ) : (
        <ProductLoadState busy={busy} error={error} retry={retry} />
      )}
    </ReviewDialog>
  );
}
/** Shared Shop/Coupons listing with owner-backed facets and server-side pagination. */
export function CataloguePage({ kind }: { kind: Offer["kind"] }) {
  const [query, setQuery] = useState(readCatalogueQuery),
    [data, setData] = useState<CatalogueListing | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0),
    [filtersOpen, setFiltersOpen] = useState(false),
    [quick, setQuick] = useState<Offer | null>(null);
  useEffect(() => {
    const change = () => setQuery(readCatalogueQuery());
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const params = catalogueParams(query);
  params.delete("layout");
  params.set("kind", kind);
  const search = params.toString();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      request<CatalogueListing>(
        `${APP_API}/catalogue?${search}`,
        null,
        undefined,
        "GET",
        { signal: controller.signal },
      )
        .then((value) => {
          if (active) setData(value);
        })
        .catch((reason) => {
          if (active) {
            setData(null);
            setError(
              reason instanceof Error
                ? reason.message
                : "The catalogue could not load.",
            );
          }
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [search, revision]);
  const update = (next: CatalogueQuery) => {
    setQuery(next);
    history.replaceState(
      history.state,
      "",
      `${cataloguePath(kind)}?${catalogueParams(next)}`,
    );
  };
  const filterKeys = [
    "category",
    "condition",
    "issuer",
    "minPoints",
    "maxPoints",
    "validUntil",
  ] as const;
  const chips = filterKeys
    .filter((key) => query[key])
    .map((key) => ({
      key,
      label:
        key === "category"
          ? data?.facets.categories.find(
              (value) => value.code === query.category,
            )?.label || query.category
          : key === "condition"
            ? humanize(query.condition)
            : key === "minPoints"
              ? `From ${query.minPoints} points`
              : key === "maxPoints"
                ? `Up to ${query.maxPoints} points`
                : key === "validUntil"
                  ? `Valid through ${query.validUntil}`
                  : query[key],
    }));
  const clear = () =>
    update({
      ...emptyCatalogueQuery,
      layout: query.layout,
      pageSize: query.pageSize,
      sort: query.sort,
    });
  return (
    <main className="container catalogue-page">
      <header
        className={`catalogue-page-heading catalogue-banner-${kind.toLowerCase()}`}
      >
        <div className="catalogue-banner-copy">
          <span className="catalogue-eyebrow">
            {kind === "ASSET"
              ? "The circular marketplace"
              : "Rewards with possibilities"}
          </span>
          <h1>
            {kind === "ASSET"
              ? "Find its next chapter."
              : "Something good awaits."}
          </h1>
          <p>
            {kind === "ASSET"
              ? "Browse verified assets and keep their value in circulation."
              : "Choose a partner offer and put your reward points to work."}
          </p>
        </div>
        <img
          className="catalogue-banner-image"
          src={publicMedia(
            kind === "ASSET"
              ? "circa-hero-circular-value"
              : "circa-coupon-market",
          )}
          alt={
            kind === "ASSET"
              ? "Laptops, phones and cameras ready for another chapter"
              : "A partner reward coupon with a green checkmark"
          }
        />
        <div className="catalogue-banner-shade" aria-hidden="true" />
      </header>
      <ListingToolbar
        query={query.q}
        onQuery={(q) => update({ ...query, q, page: 1 })}
        layout={query.layout}
        onLayout={(layout) => update({ ...query, layout })}
        sort={query.sort}
        onSort={(sort) => update({ ...query, sort, page: 1 })}
        sorts={
          kind === "COUPON"
            ? [...sorts, { code: "EXPIRY", label: "Expiring soon" }]
            : sorts
        }
        onFilters={() => setFiltersOpen(true)}
        filterCount={chips.length}
        onRefresh={() => setRevision((value) => value + 1)}
        busy={busy}
        disabled={!data}
        copy={(key, fallback) =>
          key === "searchLabel"
            ? "Search marketplace"
            : key === "searchPlaceholder"
              ? "Search by product, partner or reference…"
              : fallback
        }
      />
      {!!chips.length && (
        <div className="catalogue-applied-filters" aria-label="Applied filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => update({ ...query, [chip.key]: "", page: 1 })}
            >
              {chip.label}
              <X size={14} />
              <span className="listing-sr-only">Remove filter</span>
            </button>
          ))}
          <button onClick={clear}>Clear all</button>
        </div>
      )}
      <div className="catalogue-results-heading">
        <span aria-live="polite">
          {busy
            ? "Updating products…"
            : error
              ? "Results unavailable"
              : `${data?.total || 0} products`}
        </span>
        <div className="listing-result-controls">
          <ListingPageSize
            value={query.pageSize}
            onChange={(pageSize) => update({ ...query, pageSize, page: 1 })}
          />
          {!busy && !error && !!data?.total && (
            <span>
              {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}
            </span>
          )}
        </div>
      </div>
      {error ? (
        <div className="catalogue-empty">
          <h2>Products couldn’t load</h2>
          <p role="alert">{error}</p>
          <button
            className="primary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
          <button
            className="catalogue-secondary"
            onClick={() => update({ ...emptyCatalogueQuery })}
          >
            Reset listing
          </button>
        </div>
      ) : busy ? (
        <p className="catalogue-loading" role="status">
          Loading products…
        </p>
      ) : data?.items.length ? (
        <div className={`catalogue-items catalogue-items-${query.layout}`}>
          {data.items.map((offer) => (
            <CatalogueCard
              key={offer.code}
              offer={offer}
              href={productHref(offer, query)}
              onQuickView={() => setQuick(offer)}
            />
          ))}
        </div>
      ) : (
        <div className="catalogue-empty">
          <Search size={32} />
          <h2>No matching products</h2>
          <p>
            {query.q || chips.length
              ? "Try a different search or clear your filters."
              : "New products will appear here when they become available."}
          </p>
          {(query.q || !!chips.length) && (
            <button className="primary" onClick={clear}>
              Clear all
            </button>
          )}
        </div>
      )}
      {!error && data && (
        <ListingPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          busy={busy}
          onPage={(page) => {
            update({ ...query, page });
            document
              .querySelector(".catalogue-page .listing-toolbar")
              ?.scrollIntoView({ block: "start" });
          }}
        />
      )}
      {filtersOpen && data && (
        <CatalogueFilters
          kind={kind}
          query={query}
          facets={data.facets}
          onApply={(value) => {
            update(value);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {quick && (
        <QuickView
          code={quick.code}
          kind={kind}
          href={productHref(quick, query)}
          onClose={() => setQuick(null)}
        />
      )}
    </main>
  );
}
/** Full product pages fetch by route identity; the caller retains the existing reviewed purchase operation. */
export function CatalogueProductPage({
  code,
  kind,
  renderPurchase,
}: {
  code: string;
  kind: Offer["kind"];
  renderPurchase: (offer: Offer) => ReactNode;
}) {
  const { data, busy, error, retry } = useProduct(code, kind);
  const backHref = `${cataloguePath(kind)}?${catalogueParams(readCatalogueQuery())}`;
  return (
    <main className="container catalogue-product-page">
      <a className="back-link" href={backHref}>
        <ArrowLeft size={17} />
        Back to {kind === "ASSET" ? "assets" : "coupons"}
      </a>
      {data && !busy ? (
        <>
          <div className="catalogue-product-layout">
            <ProductGallery offer={data} />
            <div>
              <ProductSummary offer={data} />
              {renderPurchase(data)}
            </div>
          </div>
          <ProductInformation offer={data} />
        </>
      ) : (
        <ProductLoadState busy={busy} error={error} retry={retry} />
      )}
    </main>
  );
}
