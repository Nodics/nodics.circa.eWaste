import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { API, request, type Session } from "./api";
import { ReviewDialog } from "./ReviewDialog";
import { WastePhoto, wasteName } from "./features/waste/WasteCard";
import type { WasteDetail, WasteItem } from "./features/waste/wasteTypes";
import type { JourneyHost } from "./channels/journeyHost";
import "./outcomeInbox.css";
import { HeaderPopover } from "./HeaderPopover";

type Message = {
  code: string;
  createdAt: string;
  source?: { module: string; type: string; code: string };
};
type Update = Message & { item?: WasteItem };
const validCode = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
function itemHref(code: string | undefined, mobile: boolean) {
  if (!mobile)
    return code
      ? `/account/submissions/${encodeURIComponent(code)}`
      : "/account";
  const url = new URL(window.location.href);
  url.searchParams.delete("asset");
  if (code) url.searchParams.set("submission", code);
  else url.searchParams.delete("submission");
  url.searchParams.set("view", "submissions");
  return url.pathname + url.search + url.hash;
}
/** Communication owns notifications; item names, feedback and evidence come from an independently authorized Waste read. */
export function OutcomeInbox({
  session,
  mobile = false,
  onFollow,
}: {
  session: Session;
  mobile?: boolean;
  onFollow?: () => void;
}) {
  const [updates, setUpdates] = useState<Update[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setUpdates([]);
    setError("");
    setLoading(true);
    void request<Message[]>(
      "/nodics/commsApi/v0/customer/communications",
      session,
    )
      .then(async (messages) => {
        const enriched = await Promise.all(
          messages.map(async (message) => {
            const source = message.source;
            if (
              source?.module !== "eWaste" ||
              source.type !== "wasteSubmission" ||
              !validCode.test(source.code)
            )
              return message;
            try {
              const detail = await request<WasteDetail>(
                `${API}/account/items/${encodeURIComponent(source.code)}?view=submissions`,
                session,
              );
              if (
                detail.contractVersion !== 1 ||
                detail.item?.code !== source.code ||
                detail.item.resource !== "submissions"
              )
                return message;
              return { ...message, item: detail.item };
            } catch {
              return message;
            }
          }),
        );
        if (active)
          setUpdates(
            enriched.sort(
              (a, b) =>
                (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
            ),
          );
      })
      .catch(() => {
        if (active) setError("Your updates couldn’t load. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.token, reload]);
  return (
    <section aria-label="Your updates" className="customer-updates">
      <p className="customer-updates-intro">
        Keep up with your items and their next chapter.
      </p>
      {loading ? (
        <p role="status">Loading your updates…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : updates.length ? (
        <div className="customer-updates-list">
          {updates.map((update) => {
            const item = update.item,
              approved = item?.status.code === "APPROVED",
              rejected = item?.status.code === "REJECTED";
            const title = approved
              ? "Your item has been approved"
              : rejected
                ? "Your item wasn’t approved"
                : "An update on your item";
            const date = new Date(update.createdAt),
              dated = Number.isFinite(date.getTime());
            return (
              <article key={update.code} className="customer-update">
                <div className="customer-update-photo">
                  {item ? (
                    <WastePhoto item={item} session={session} />
                  ) : (
                    <Bell size={25} />
                  )}
                </div>
                <div className="customer-update-content">
                  {item && (
                    <p className="customer-update-item">{wasteName(item)}</p>
                  )}
                  <h3>
                    {approved ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock3 size={18} />
                    )}{" "}
                    {title}
                  </h3>
                  <p>
                    {approved
                      ? "The collection team has approved your item."
                      : rejected
                        ? "The collection team has reviewed your item. Open the details to see the outcome."
                        : "Open your items to see the latest details."}
                  </p>
                  {item?.descriptor.review.comment?.trim() && (
                    <blockquote>{item.descriptor.review.comment}</blockquote>
                  )}
                  <a
                    className="customer-update-link"
                    href={itemHref(item?.code, mobile)}
                    onClick={onFollow}
                  >
                    {item ? "View item details" : "View your items"}
                    <ArrowUpRight size={16} />
                  </a>
                  {dated && (
                    <time dateTime={date.toISOString()}>
                      {date.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      ·{" "}
                      {date.toLocaleTimeString("en-GB", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </time>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="customer-updates-empty">
          <Bell size={30} />
          <h3>You’re all caught up</h3>
          <p>Updates will appear here when your items are reviewed.</p>
        </div>
      )}
      <button
        className="customer-updates-refresh"
        disabled={loading}
        onClick={() => setReload((value) => value + 1)}
      >
        <RefreshCw size={15} />
        {loading ? "Checking for updates…" : "Check for updates"}
      </button>
    </section>
  );
}
/** A quiet header entry; loading notifications never takes space away from the page banner. */
export function CustomerUpdates({
  session,
  mobile = false,
  host,
  onToggle,
}: {
  session: Session;
  mobile?: boolean;
  host?: JourneyHost;
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onToggle?.(false);
  };
  useEffect(() => {
    if (open) return host?.bindBack?.(close);
  }, [open, host]);
  if (!mobile)
    return (
      <HeaderPopover
        href="/account/updates"
        label="Updates"
        title="Your updates"
        icon={<Bell size={20} />}
      >
        {(dismiss) => <OutcomeInbox session={session} onFollow={dismiss} />}
      </HeaderPopover>
    );
  return (
    <>
      <button
        className="icon-button customer-updates-trigger"
        aria-label="Updates"
        title="Updates"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          onToggle?.(true);
        }}
      >
        <Bell size={20} />
      </button>
      {open && (
        <ReviewDialog
          title="Your updates"
          onClose={close}
          className="customer-updates-dialog"
        >
          <OutcomeInbox session={session} mobile={mobile} onFollow={close} />
        </ReviewDialog>
      )}
    </>
  );
}
