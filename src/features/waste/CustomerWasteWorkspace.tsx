import {
  ListingToolbar,
  ListingPagination,
  ListingPageSize,
} from "../../components/listing/ListingControls";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Check, Leaf, X } from "lucide-react";
import { API, nameOf, request, type Session } from "../../api";
import {
  contentItems,
  contentText,
  publicMedia,
  usePublishedPage,
} from "../../cms";
import { ReviewDialog } from "../../ReviewDialog";
import type { JourneyHost } from "../../channels/journeyHost";
import { WasteCard, WasteDraftCard } from "./WasteCard";
import { WasteDetailView } from "./WasteDetail";
import {
  emptyWasteQuery,
  readWasteQuery,
  readWasteSelection,
  wasteHref,
  wasteQueryParams,
} from "./wasteNavigation";
import type {
  WasteCopy,
  WasteListing,
  WasteQuery,
  WasteSelection,
} from "./wasteTypes";
import "./wasteWorkspace.css";

function WasteFilters({
  query,
  data,
  copy,
  onApply,
  onClose,
}: {
  query: WasteQuery;
  data: WasteListing;
  copy: WasteCopy;
  onApply: (query: WasteQuery) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(query);
  return (
    <ReviewDialog
      title={copy("advancedFilters", "Advanced filters")}
      onClose={onClose}
      className="waste-filter-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ ...draft, page: 1 });
        }}
      >
        <label>
          {copy("category", "Category")}
          <select
            value={draft.categoryCode}
            onChange={(event) =>
              setDraft({
                ...draft,
                categoryCode: event.target.value,
                itemTypeCode: "",
              })
            }
          >
            <option value="">{copy("allCategories", "All categories")}</option>
            {data.filters.categories.map((value) => (
              <option key={value.code} value={value.code}>
                {nameOf(value.name) || value.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("itemType", "Item type")}
          <select
            value={draft.itemTypeCode}
            onChange={(event) =>
              setDraft({ ...draft, itemTypeCode: event.target.value })
            }
          >
            <option value="">{copy("allItemTypes", "All item types")}</option>
            {data.filters.itemTypes
              .filter(
                (value) =>
                  !draft.categoryCode ||
                  value.categoryCode === draft.categoryCode,
              )
              .map((value) => (
                <option key={value.code} value={value.code}>
                  {nameOf(value.name) || value.code}
                </option>
              ))}
          </select>
        </label>
        {query.view === "submissions" && (
          <fieldset>
            <legend>{copy("submittedDate", "Submission date")}</legend>
            <label>
              {copy("dateFrom", "From")}
              <input
                type="date"
                value={draft.dateFrom}
                max={draft.dateTo || undefined}
                onChange={(event) =>
                  setDraft({ ...draft, dateFrom: event.target.value })
                }
              />
            </label>
            <label>
              {copy("dateTo", "To")}
              <input
                type="date"
                value={draft.dateTo}
                min={draft.dateFrom || undefined}
                onChange={(event) =>
                  setDraft({ ...draft, dateTo: event.target.value })
                }
              />
            </label>
          </fieldset>
        )}
        <div className="waste-filter-footer">
          <button
            type="button"
            className="waste-secondary"
            onClick={() =>
              setDraft({
                ...draft,
                categoryCode: "",
                itemTypeCode: "",
                dateFrom: "",
                dateTo: "",
              })
            }
          >
            {copy("resetFilters", "Reset filters")}
          </button>
          <button className="waste-primary" type="submit">
            {copy("applyFilters", "Apply filters")}
            <Check size={17} />
          </button>
        </div>
      </form>
    </ReviewDialog>
  );
}

/** One customer renderer for web and Telegram. WCMS owns composition; the endpoint owns scope, counts, taxonomy, facts and action availability. */
export function CustomerWasteWorkspace({
  session,
  mobile = false,
  initialSelection,
  onContinue,
  onBackToAccount,
  onNavigate,
  host,
  endpoint = API,
  revision = 0,
}: {
  session: Session;
  mobile?: boolean;
  initialSelection?: WasteSelection;
  onContinue: (code: string) => void;
  onBackToAccount?: () => void;
  onNavigate?: () => void;
  host?: JourneyHost;
  endpoint?: string;
  revision?: number;
}) {
  const [query, setQuery] = useState<WasteQuery>(() => readWasteQuery());
  const [selection, setSelection] = useState<WasteSelection | null>(
    () => initialSelection || readWasteSelection(mobile),
  );
  const [quick, setQuick] = useState<WasteSelection | null>(null),
    [filtersOpen, setFiltersOpen] = useState(false),
    [layout, setLayout] = useState<"grid" | "list">("grid");
  const [data, setData] = useState<WasteListing | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const cms = usePublishedPage("/account/waste", reload + revision);
  const content = cms.page?.sections.find(
    (value) => value.renderer === "circa.wasteWorkspace",
  )?.properties;
  const labels =
    content?.labels && typeof content.labels === "object"
      ? (content.labels as Record<string, unknown>)
      : undefined;
  const copy = useCallback<WasteCopy>(
    (key, fallback) =>
      typeof labels?.[key] === "string" ? (labels[key] as string) : fallback,
    [labels],
  );
  const sections = useMemo(
    () =>
      contentItems(content, "sections").map((value) => ({
        code: contentText(value, "code"),
        label: contentText(value, "label"),
      })),
    [content],
  );
  const href = useCallback(
    (target: WasteSelection | null) => wasteHref(query, target, mobile),
    [query, mobile],
  );
  const navigate = useCallback(
    (target: WasteSelection | null) => {
      setQuick(null);
      setFiltersOpen(false);
      setSelection(target);
      onNavigate?.();
      history.pushState({}, "", wasteHref(query, target, mobile));
      window.dispatchEvent(new PopStateEvent("popstate"));
      if (mobile)
        document
          .querySelector(".waste-workspace")
          ?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    },
    [query, mobile, onNavigate],
  );
  const back = useCallback(() => navigate(null), [navigate]);
  const changed = useCallback(() => setReload((value) => value + 1), []);
  const update = (next: WasteQuery) => {
    setQuery(next);
    setError("");
    history.replaceState(history.state, "", wasteHref(next, selection, mobile));
  };
  useEffect(() => {
    const pop = () => {
      setSelection(readWasteSelection(mobile));
      setQuery(readWasteQuery());
      setQuick(null);
      setFiltersOpen(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [mobile]);
  useEffect(() => {
    if (!host?.bindBack) return;
    return host.bindBack(
      filtersOpen
        ? () => setFiltersOpen(false)
        : quick
          ? () => setQuick(null)
          : selection
            ? back
            : onBackToAccount || back,
    );
  }, [host, selection, quick, filtersOpen, back, onBackToAccount]);
  const queryString = wasteQueryParams(query).toString();
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    const timer = window.setTimeout(
      () => {
        void request<WasteListing>(
          `${endpoint}/account/items?${queryString}`,
          session,
        )
          .then((value) => {
            if (
              value.contractVersion !== 1 ||
              value.view !== query.view ||
              !Array.isArray(value.items) ||
              !Number.isSafeInteger(value.total)
            )
              throw Error("The item listing has an incompatible response.");
            if (active) setData(value);
          })
          .catch((cause) => {
            if (active)
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Your items could not be loaded.",
              );
          })
          .finally(() => {
            if (active) setBusy(false);
          });
      },
      query.q ? 300 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [queryString, session.token, endpoint, reload, revision]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) changed();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [changed]);
  const follow =
    (target: WasteSelection) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      navigate(target);
    };
  const detailProps = {
    session,
    endpoint,
    copy,
    sections,
    onOpen: navigate,
    href,
    onContinue,
    onChanged: changed,
    onBack: back,
  };
  if (!content)
    return (
      <section className="waste-workspace">
        <div className="waste-empty" role={cms.error ? "alert" : "status"}>
          {cms.error || cms.page ? (
            <>
              <h2>Your item workspace is unavailable</h2>
              <p>
                {cms.error ||
                  "The published workspace content could not be loaded."}
              </p>
              <button className="waste-primary" onClick={changed}>
                Try again
              </button>
            </>
          ) : (
            <>
              <span className="waste-loading-dot" />
              Loading your workspace…
            </>
          )}
        </div>
      </section>
    );
  const chips = [
    ...(query.q ? [{ key: "q", label: `“${query.q}”` }] : []),
    ...(query.status !== "ALL"
      ? [
          {
            key: "status",
            label:
              data?.statuses.find((value) => value.code === query.status)
                ?.label || query.status,
          },
        ]
      : []),
    ...(query.categoryCode
      ? [
          {
            key: "categoryCode",
            label:
              nameOf(
                data?.filters.categories.find(
                  (value) => value.code === query.categoryCode,
                )?.name,
              ) || query.categoryCode,
          },
        ]
      : []),
    ...(query.itemTypeCode
      ? [
          {
            key: "itemTypeCode",
            label:
              nameOf(
                data?.filters.itemTypes.find(
                  (value) => value.code === query.itemTypeCode,
                )?.name,
              ) || query.itemTypeCode,
          },
        ]
      : []),
    ...(query.dateFrom
      ? [
          {
            key: "dateFrom",
            label: `${copy("dateFrom", "From")} ${query.dateFrom}`,
          },
        ]
      : []),
    ...(query.dateTo
      ? [{ key: "dateTo", label: `${copy("dateTo", "To")} ${query.dateTo}` }]
      : []),
  ];
  return (
    <section className={`waste-workspace ${mobile ? "waste-mobile" : ""}`}>
      {selection ? (
        <WasteDetailView
          key={`${selection.resource}:${selection.code}`}
          selection={selection}
          {...detailProps}
        />
      ) : (
        <>
          <div className="waste-banner">
            {contentText(content, "bannerMediaCode") && (
              <img
                src={publicMedia(contentText(content, "bannerMediaCode"))}
                alt={contentText(content, "bannerAlt")}
              />
            )}
            <div className="waste-banner-shade" />
            <div className="waste-banner-copy">
              <span className="waste-eyebrow">
                {contentText(content, "eyebrow")}
              </span>
              <h1>{contentText(content, "title")}</h1>
              <p>{contentText(content, "description")}</p>
            </div>
          </div>
          <div
            className="waste-collection-tabs"
            role="group"
            aria-label={copy("collectionViews", "Your collections")}
          >
            <button
              aria-pressed={query.view === "submissions"}
              onClick={() =>
                update({
                  ...emptyWasteQuery,
                  limit: query.limit,
                  view: "submissions",
                })
              }
            >
              {copy("submissions", "Submissions")}
            </button>
            <button
              aria-pressed={query.view === "assets"}
              onClick={() =>
                update({
                  ...emptyWasteQuery,
                  limit: query.limit,
                  view: "assets",
                })
              }
            >
              {copy("ownedAssets", "Owned assets")}
            </button>
            <button
              aria-pressed={query.view === "drafts"}
              onClick={() =>
                update({
                  ...emptyWasteQuery,
                  limit: query.limit,
                  view: "drafts",
                })
              }
            >
              {copy("drafts", "Drafts")}
            </button>
          </div>
          <div className="waste-search-panel">
            <ListingToolbar
              className="waste-toolbar"
              query={query.q}
              onQuery={(q) => update({ ...query, q, page: 1 })}
              layout={layout}
              onLayout={setLayout}
              sort={query.sort}
              onSort={(sort) => update({ ...query, sort, page: 1 })}
              sorts={data?.sorts || []}
              onFilters={() => setFiltersOpen(true)}
              filterCount={
                chips.filter((chip) => !["q", "status"].includes(chip.key))
                  .length
              }
              onRefresh={changed}
              busy={busy}
              disabled={!data}
              copy={copy}
            />
            {data && data.view === query.view && (
              <div
                className="waste-status-filters"
                role="group"
                aria-label={copy("statusFilter", "Filter by status")}
              >
                {data.statuses.map((value) => (
                  <button
                    key={value.code}
                    aria-pressed={query.status === value.code}
                    onClick={() =>
                      update({ ...query, status: value.code, page: 1 })
                    }
                  >
                    {value.label}
                    <span>{value.count}</span>
                  </button>
                ))}
              </div>
            )}
            {!!chips.length && (
              <div
                className="waste-applied-filters"
                aria-label={copy("activeFilters", "Applied filters")}
              >
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() =>
                      update({
                        ...query,
                        [chip.key]: chip.key === "status" ? "ALL" : "",
                        ...(chip.key === "categoryCode"
                          ? { itemTypeCode: "" }
                          : {}),
                        page: 1,
                      })
                    }
                  >
                    {chip.label}
                    <X size={13} />
                    <span className="waste-sr-only">
                      {copy("removeFilter", "Remove filter")}
                    </span>
                  </button>
                ))}
                <button
                  className="waste-clear"
                  onClick={() =>
                    update({
                      ...emptyWasteQuery,
                      limit: query.limit,
                      view: query.view,
                    })
                  }
                >
                  {copy("clearAll", "Clear all")}
                </button>
              </div>
            )}
          </div>
          {query.view === "drafts" && (
            <div className="waste-drafts-intro">
              <h2>{copy("draftsTitle", "Pick up where you left off")}</h2>
              <p>
                {copy(
                  "draftsDescription",
                  "These items have not been submitted. Continue a draft to add a photo, check the details and send it for review.",
                )}
              </p>
            </div>
          )}
          <div className="waste-results-heading" aria-live="polite">
            <span>
              {busy
                ? copy("updating", "Updating your items…")
                : error
                  ? copy("resultsUnavailable", "Results unavailable")
                  : `${data?.total || 0} ${copy("items", "items")}`}
            </span>
            <div className="listing-result-controls">
              <ListingPageSize
                value={query.limit}
                onChange={(limit) => update({ ...query, limit, page: 1 })}
                copy={copy}
              />
              {!busy && !error && !!data?.total && (
                <span>
                  {(data.page - 1) * data.pageSize + 1}–
                  {Math.min(data.page * data.pageSize, data.total)}{" "}
                  {copy("of", "of")} {data.total}
                </span>
              )}
            </div>
          </div>
          {error ? (
            <div className="waste-empty">
              <h2>{copy("loadError", "Your items couldn’t load")}</h2>
              <p role="alert">{error}</p>
              <button className="waste-primary" onClick={changed}>
                {copy("retry", "Try again")}
              </button>
            </div>
          ) : !data || data.view !== query.view ? (
            <div className="waste-loading" role="status">
              <span />
              {copy("loadingItems", "Loading your items…")}
            </div>
          ) : data.items.length ? (
            <div
              className={`waste-items waste-items-${layout}${query.view === "drafts" ? " waste-draft-items" : ""}`}
              aria-busy={busy}
            >
              {data.items.map((item) =>
                query.view === "drafts" ? (
                  <WasteDraftCard
                    key={item.code}
                    item={item}
                    session={session}
                    copy={copy}
                    onContinue={() => onContinue(item.code)}
                  />
                ) : (
                  <WasteCard
                    key={item.code}
                    item={item}
                    session={session}
                    copy={copy}
                    href={href({ resource: item.resource, code: item.code })}
                    onOpen={follow({
                      resource: item.resource,
                      code: item.code,
                    })}
                    onQuickView={() =>
                      setQuick({ resource: item.resource, code: item.code })
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <div className="waste-empty">
              <Leaf size={38} />
              <h2>
                {query.view === "drafts"
                  ? copy("draftsEmptyTitle", "No unfinished submissions")
                  : copy("emptyTitle", "A little room for possibility")}
              </h2>
              <p>
                {chips.length
                  ? copy(
                      "emptyFiltered",
                      "No items match these filters. Try a different search or clear your filters.",
                    )
                  : query.view === "drafts"
                    ? copy(
                        "draftsEmptyBody",
                        "Any progress you save before submitting will appear here.",
                      )
                    : copy(
                        "emptyBody",
                        "Your saved submissions and owned assets will appear here as your journey grows.",
                      )}
              </p>
              {chips.length > 0 && (
                <button
                  className="waste-secondary"
                  onClick={() =>
                    update({
                      ...emptyWasteQuery,
                      limit: query.limit,
                      view: query.view,
                    })
                  }
                >
                  {copy("clearAll", "Clear all")}
                </button>
              )}
            </div>
          )}
          {data && (
            <ListingPagination
              className="waste-pagination"
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              busy={busy}
              onPage={(page) => update({ ...query, page })}
              copy={copy}
            />
          )}
        </>
      )}
      {filtersOpen && data && (
        <WasteFilters
          query={query}
          data={data}
          copy={copy}
          onClose={() => setFiltersOpen(false)}
          onApply={(value) => {
            update(value);
            setFiltersOpen(false);
          }}
        />
      )}
      {quick && (
        <ReviewDialog
          title={copy("quickView", "Quick view")}
          onClose={() => setQuick(null)}
          className="waste-quick-dialog"
        >
          <WasteDetailView selection={quick} {...detailProps} quick />
        </ReviewDialog>
      )}
    </section>
  );
}
