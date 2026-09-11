import type { MouseEvent } from "react";
import { ArrowRight, ArrowUpRight, Camera, Eye, ImageOff, Leaf } from "lucide-react";
import { nameOf, type Session } from "../../api";
import { PrivatePhoto } from "../../PrivatePhoto";
import type { WasteCopy, WasteItem } from "./wasteTypes";

export const wasteName = (item: WasteItem) =>
  item.descriptor.identity.name || "Your item";
export const displayDate = (value?: string | number | null) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
export const readable = (value?: string | null) =>
  !value || value === "UNKNOWN"
    ? "Not established"
    : value.toLowerCase().replaceAll("_", " ");

/** Uses the authorized resource photo route. An absent photo never becomes a fabricated item image. */
export function WastePhoto({
  item,
  session,
  className = "",
}: {
  item: WasteItem;
  session: Session;
  className?: string;
}) {
  return item.photo?.code || item.photo?.url ? (
    <PrivatePhoto
      record={{
        code: item.code,
        metadata: {
          photo: {
            code: item.photo.code || undefined,
            url: item.photo.url || undefined,
          },
        },
      }}
      kind={item.resource}
      session={session}
      alt={wasteName(item)}
      className={className}
    />
  ) : (
    <div
      className={`waste-photo-empty ${className}`}
      role="img"
      aria-label="No item photo"
    >
      <ImageOff size={32} />
      <span>No photo yet</span>
    </div>
  );
}
export function WasteStatus({ item }: { item: WasteItem }) {
  return (
    <span className={`waste-status waste-tone-${item.status.tone}`}>
      {item.status.label}
    </span>
  );
}
/** Unfinished submissions show saved progress and an explicit resume action. */
export function WasteDraftCard({ item, session, copy, onContinue }: {
  item: WasteItem;
  session: Session;
  copy: WasteCopy;
  onContinue: () => void;
}) {
  const action = item.actions.find(value => value.code === "CONTINUE");
  const date = displayDate(item.updatedAt);
  return (
    <article className="waste-draft-card">
      <div className="waste-draft-photo">
        {item.photo?.code || item.photo?.url
          ? <WastePhoto item={item} session={session} />
          : <Camera size={30} aria-hidden="true" />}
      </div>
      <div className="waste-draft-body">
        <WasteStatus item={item} />
        <h2>{item.descriptor.identity.name || copy("unfinishedSubmission", "Unfinished submission")}</h2>
        <p>{item.nextStep.description}</p>
        {date && <time>{copy("lastSaved", "Last saved")} {date}</time>}
      </div>
      {action && <button className="waste-primary" onClick={onContinue}>
        {action.label}<ArrowRight size={17} />
      </button>}
    </article>
  );
}
/** Shared list/grid card. Real links support browser open-in-new-tab; Quick view remains a distinct button. */
export function WasteCard({
  item,
  session,
  href,
  onOpen,
  onQuickView,
  copy,
}: {
  item: WasteItem;
  session: Session;
  href: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  onQuickView: () => void;
  copy: WasteCopy;
}) {
  const impact = item.descriptor.environment.assessment?.indicators.find(
    (value) => value.key === "avoidedEmissions" && value.value !== null,
  );
  const date = displayDate(item.submittedAt || item.updatedAt);
  return (
    <article className="waste-item-card">
      <div className="waste-card-image">
        <a
          href={href}
          onClick={onOpen}
          aria-label={`${copy("viewDetails", "View details")}: ${wasteName(item)}`}
        >
          <WastePhoto item={item} session={session} />
        </a>
        <WasteStatus item={item} />
        <button
          type="button"
          className="waste-quick-trigger"
          onClick={onQuickView}
          aria-label={`${copy("quickView", "Quick view")}: ${wasteName(item)}`}
        >
          <Eye size={17} />
          <span>{copy("quickView", "Quick view")}</span>
        </button>
      </div>
      <div className="waste-card-body">
        <p className="waste-category">
          {nameOf(item.descriptor.classification.category.name || undefined) ||
            copy("unclassified", "Awaiting classification")}
        </p>
        <h2>
          <a href={href} onClick={onOpen}>
            {wasteName(item)}
          </a>
        </h2>
        <p className="waste-card-description">
          {item.descriptor.identity.description || item.nextStep.description}
        </p>
        <div className="waste-card-facts">
          <span>{readable(item.descriptor.condition.value)}</span>
          {date && <time>{date}</time>}
        </div>
        {item.ownership?.askingPrice != null &&
        item.status.code === "LISTED" ? (
          <p className="waste-card-value">
            <strong>{item.ownership.askingPrice}</strong>{" "}
            {copy("points", "points")}
          </p>
        ) : impact ? (
          <p className="waste-card-impact">
            <Leaf size={14} />
            {impact.value}{" "}
            {impact.unitOfMeasure === "KG_CO2E"
              ? "kg CO₂e"
              : impact.unitOfMeasure}{" "}
            · {readable(impact.status)}
          </p>
        ) : (
          <p className="waste-card-impact">{item.nextStep.title}</p>
        )}
        <a className="waste-detail-link" href={href} onClick={onOpen}>
          {copy("viewDetails", "View details")}
          <ArrowUpRight size={16} />
        </a>
      </div>
    </article>
  );
}
