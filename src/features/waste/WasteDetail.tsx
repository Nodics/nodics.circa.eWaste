import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Expand,
  Leaf,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { API, nameOf, request, type Session } from "../../api";
import { ReviewDialog } from "../../ReviewDialog";
import { ItemSpecifications } from "../submission/ItemDetailsCard";
import { ImpactAssessmentHistory } from "../submission/ImpactAssessmentHistory";
import { EnvironmentalImpactCard } from "../submission/EnvironmentalImpactCard";
import {
  WastePhoto,
  WasteStatus,
  displayDate,
  readable,
  wasteName,
} from "./WasteCard";
import type {
  WasteCopy,
  WasteDetail,
  WasteItem,
  WasteSelection,
} from "./wasteTypes";

type DetailProps = {
  selection: WasteSelection;
  session: Session;
  copy: WasteCopy;
  endpoint: string;
  onOpen: (selection: WasteSelection) => void;
  href: (selection: WasteSelection | null) => string;
  onContinue: (code: string) => void;
  onChanged: () => void;
  onBack: () => void;
  sections: { code: string; label: string }[];
  quick?: boolean;
};

function FollowLink({
  href,
  onFollow,
  children,
  className,
}: {
  href: string;
  onFollow: () => void;
  children: ReactNode;
  className?: string;
}) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      onFollow();
    }
  };
  return (
    <a href={href} onClick={click} className={className}>
      {children}
    </a>
  );
}

/** Both quick view and full detail fetch the current owner projection, independently of any list page. */
export function WasteDetailView({
  selection,
  session,
  copy,
  endpoint = API,
  onOpen,
  href,
  onContinue,
  onBack,
  sections,
  quick = false,
}: DetailProps) {
  const [data, setData] = useState<WasteDetail | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(false),
    [section, setSection] = useState("overview");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    setSection("overview");
    void request<WasteDetail>(
      `${endpoint}/account/items/${encodeURIComponent(selection.code)}?view=${selection.resource}`,
      session,
    )
      .then((value) => {
        if (
          value.contractVersion !== 1 ||
          value.item?.code !== selection.code ||
          value.item.resource !== selection.resource
        )
          throw Error(
            copy("detailUnavailable", "The item details are unavailable."),
          );
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : copy("detailUnavailable", "The item details are unavailable."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selection.code, selection.resource, session.token, endpoint, revision]);
  const refresh = () => setRevision((value) => value + 1);
  if (loading)
    return (
      <div className="waste-loading" role="status">
        <span />
        {copy("loadingDetail", "Loading item details…")}
      </div>
    );
  if (error || !data)
    return (
      <div className="waste-empty">
        <ShieldCheck size={32} />
        <h2>{copy("detailUnavailable", "Item details unavailable")}</h2>
        <p role="alert">{error}</p>
        <button className="waste-primary" onClick={refresh}>
          {copy("retry", "Try again")}
        </button>
        {!quick && (
          <button className="waste-secondary" onClick={onBack}>
            {copy("backToItems", "Back to your items")}
          </button>
        )}
      </div>
    );
  const item = data.item,
    descriptor = item.descriptor;
  const availableSections = sections.filter(
    (value) =>
      ["overview", "specifications", "environment", "history"].includes(
        value.code,
      ) ||
      (value.code === "ownership" && (item.ownership || data.relatedAsset)),
  );
  const renderActions = (target: WasteItem) =>
    target.actions.map((value) =>
      value.code === "CONTINUE" ? (
        <button
          key={value.code}
          className="waste-primary"
          onClick={() => onContinue(target.code)}
        >
          {value.label}
          <ArrowUpRight size={17} />
        </button>
      ) : value.code === "OPEN_LISTING" && value.targetCode ? (
        <a
          key={value.code}
          href={`/shop/${encodeURIComponent(value.targetCode)}`}
          className="waste-primary"
        >
          {value.label}
          <ArrowUpRight size={17} />
        </a>
      ) : ["LIST", "GIFT"].includes(value.code) ? (
        <a
          key={value.code}
          href={`/account/bundles?certificate=${encodeURIComponent(target.code)}&mode=${value.code === "GIFT" ? "GIFT" : "FIXED"}`}
          className={
            value.code === "LIST" ? "waste-primary" : "waste-secondary"
          }
        >
          {value.label}
          <ArrowUpRight size={17} />
        </a>
      ) : null,
    );
  const ownership = item.ownership || data.relatedAsset?.ownership;
  return (
    <article className={`waste-detail ${quick ? "waste-detail-quick" : ""}`}>
      {!quick && (
        <nav
          className="waste-breadcrumb"
          aria-label={copy("breadcrumbs", "Breadcrumbs")}
        >
          <FollowLink href={href(null)} onFollow={onBack}>
            <ArrowLeft size={16} />
            {copy("backToItems", "Your items")}
          </FollowLink>
          <ChevronRight size={14} />
          <span>{wasteName(item)}</span>
        </nav>
      )}
      <div className="waste-detail-layout">
        <div className="waste-gallery">
          <div className="waste-gallery-image">
            <WastePhoto item={item} session={session} />
            {!quick && (item.photo?.code || item.photo?.url) && (
              <button
                className="waste-image-expand"
                onClick={() => setZoom(true)}
                aria-label={copy("expandPhoto", "Enlarge item photo")}
              >
                <Expand size={20} />
              </button>
            )}
          </div>
          <p>
            <ShieldCheck size={15} />
            {copy(
              "privatePhoto",
              "Your item evidence is visible only to authorized viewers.",
            )}
          </p>
        </div>
        <div className="waste-detail-summary">
          <p className="waste-category">
            {[
              nameOf(descriptor.classification.family.name || undefined),
              nameOf(descriptor.classification.category.name || undefined),
            ]
              .filter(Boolean)
              .join(" / ") || copy("unclassified", "Awaiting classification")}
          </p>
          <h1>{wasteName(item)}</h1>
          <WasteStatus item={item} />
          {item.resource === "assets" && (
            <section
              className="waste-certificate"
              aria-label={copy(
                "certificateEvidence",
                "Digital certificate evidence",
              )}
            >
              <h2>{copy("certificateHeading", "Digital certificate")}</h2>
              <dl className="waste-key-facts">
                <div>
                  <dt>
                    {copy("certificateReference", "Certificate reference")}
                  </dt>
                  <dd>{item.code}</dd>
                </div>
                <div>
                  <dt>
                    {copy("certificateOwnershipStatus", "Ownership status")}
                  </dt>
                  <dd>{item.status.label}</dd>
                </div>
                <div>
                  <dt>
                    {copy("certificateReviewDecision", "Review decision")}
                  </dt>
                  <dd>{readable(descriptor.review.decision)}</dd>
                </div>
                <div>
                  <dt>{copy("certificateReviewed", "Reviewed")}</dt>
                  <dd>
                    {displayDate(item.reviewedAt) ||
                      copy("certificateDateMissing", "Not recorded")}
                  </dd>
                </div>
              </dl>
              <p>
                {copy(
                  "certificateEvidenceScope",
                  "Recorded item and review evidence. Ownership does not confirm completed recycling or carbon credit issuance.",
                )}
              </p>
              {data.history.length ? (
                <ul>
                  {data.history.map((event) => (
                    <li key={event.code}>
                      {event.label} · {displayDate(event.at)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {copy(
                    "certificateHistoryMissing",
                    "No dated lifecycle evidence is available for this certificate yet.",
                  )}
                </p>
              )}
              <p>
                {descriptor.environment.assessment ? (
                  <>
                    {copy(
                      "certificateAssessmentStatus",
                      "Environmental assessment",
                    )}
                    : {readable(descriptor.environment.assessment.status)}
                  </>
                ) : (
                  copy(
                    "certificateAssessmentMissing",
                    "Environmental assessment not available.",
                  )
                )}
              </p>
              {!quick &&
                availableSections.some(
                  (value) => value.code === "environment",
                ) && (
                  <button
                    className="waste-text-button"
                    onClick={() => setSection("environment")}
                  >
                    {copy(
                      "certificateViewAssessment",
                      "View assessment evidence",
                    )}{" "}
                    <ArrowUpRight size={17} />
                  </button>
                )}
            </section>
          )}
          <p className="waste-item-description">
            {descriptor.identity.description ||
              copy(
                "noDescription",
                "A description has not been provided for this item.",
              )}
          </p>
          <dl className="waste-key-facts">
            <div>
              <dt>{copy("condition", "Condition")}</dt>
              <dd>{readable(descriptor.condition.value)}</dd>
            </div>
            <div>
              <dt>{copy("quantity", "Quantity")}</dt>
              <dd>
                {descriptor.physical.quantity ??
                  copy("unknown", "Not established")}
              </dd>
            </div>
            {(descriptor.identity.brand || descriptor.identity.model) && (
              <div>
                <dt>{copy("brandModel", "Brand / model")}</dt>
                <dd>
                  {[descriptor.identity.brand, descriptor.identity.model]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            )}
            {displayDate(item.submittedAt) && (
              <div>
                <dt>{copy("submitted", "Submitted")}</dt>
                <dd>{displayDate(item.submittedAt)}</dd>
              </div>
            )}
            {item.ownership?.askingPrice != null &&
              item.status.code === "LISTED" && (
                <div>
                  <dt>{copy("listingPrice", "Price in reward points")}</dt>
                  <dd className="waste-detail-price">
                    {item.ownership.askingPrice}{" "}
                    <small>{copy("points", "points")}</small>
                  </dd>
                </div>
              )}
          </dl>
          {descriptor.review.comment && (
            <div className={`waste-review-note waste-tone-${item.status.tone}`}>
              <strong>{copy("reviewerFeedback", "Reviewer’s feedback")}</strong>
              <p>{descriptor.review.comment}</p>
            </div>
          )}
          <div className="waste-next-step">
            <Leaf size={21} />
            <div>
              <strong>{item.nextStep.title}</strong>
              <p>{item.nextStep.description}</p>
            </div>
          </div>
          <div className="waste-item-actions">
            {quick ? (
              <button
                className="waste-primary"
                onClick={() => onOpen(selection)}
              >
                {copy("fullDetails", "Open full details")}
                <ArrowUpRight size={18} />
              </button>
            ) : (
              renderActions(item)
            )}
          </div>
          {!quick && data.relatedAsset && (
            <FollowLink
              className="waste-related-asset"
              href={href({ resource: "assets", code: data.relatedAsset.code })}
              onFollow={() =>
                onOpen({ resource: "assets", code: data.relatedAsset!.code })
              }
            >
              <ShieldCheck size={21} />
              <span>
                <strong>{copy("linkedAsset", "Your approved asset")}</strong>
                <small>{data.relatedAsset.status.label}</small>
              </span>
              <ArrowUpRight size={19} />
            </FollowLink>
          )}
          <p className="waste-reference">
            {copy("reference", "Reference")} · {item.code}
          </p>
        </div>
      </div>
      {!quick && (
        <div className="waste-detail-sections">
          <div
            className="waste-section-tabs"
            role="tablist"
            aria-label={copy("detailSections", "Item detail sections")}
          >
            {availableSections.map((value) => (
              <button
                key={value.code}
                id={`waste-tab-${value.code}`}
                role="tab"
                aria-selected={section === value.code}
                aria-controls={`waste-panel-${value.code}`}
                onClick={() => setSection(value.code)}
              >
                {value.label}
              </button>
            ))}
          </div>
          {availableSections.map((value) => (
            <section
              key={value.code}
              id={`waste-panel-${value.code}`}
              role="tabpanel"
              aria-labelledby={`waste-tab-${value.code}`}
              hidden={section !== value.code}
            >
              {value.code === "overview" && (
                <div className="waste-overview">
                  <div>
                    <span className="waste-eyebrow">
                      {copy("itemStory", "Every item has a story")}
                    </span>
                    <h2>
                      {copy("overviewTitle", "A closer look at your item")}
                    </h2>
                    <p>
                      {descriptor.identity.description ||
                        copy(
                          "noDescription",
                          "A description has not been provided for this item.",
                        )}
                    </p>
                    <p>{item.nextStep.description}</p>
                    {descriptor.evidenceReview?.manualApprovalRequired && (
                      <div className="waste-evidence-note">
                        <strong>{descriptor.evidenceReview.label}</strong>
                        <p>
                          {descriptor.evidenceReview.customerMessage ||
                            descriptor.evidenceReview.message}
                        </p>
                      </div>
                    )}
                  </div>
                  <aside>
                    <Leaf size={29} />
                    <h3>
                      {copy("impactOverviewTitle", "Its environmental story")}
                    </h3>
                    <p>
                      {copy(
                        "impactOverviewBody",
                        "Explore the recorded assessment, its evidence and what still needs to be established in Environmental impact.",
                      )}
                    </p>
                    <button
                      className="waste-text-button"
                      onClick={() => setSection("environment")}
                    >
                      {copy("exploreImpact", "Explore environmental impact")}
                      <ArrowUpRight size={17} />
                    </button>
                  </aside>
                </div>
              )}
              {value.code === "specifications" && (
                <div className="waste-specifications">
                  <ItemSpecifications
                    descriptor={descriptor}
                    code={item.code}
                  />
                </div>
              )}
              {value.code === "environment" && (
                <>
                  <EnvironmentalImpactCard
                    assessment={descriptor.environment.assessment || undefined}
                  />
                  {data.impactHistory && (
                    <ImpactAssessmentHistory
                      key={item.code}
                      initial={data.impactHistory}
                      endpoint={endpoint}
                      code={item.code}
                      session={session}
                    />
                  )}
                </>
              )}
              {value.code === "history" && (
                <div className="waste-history">
                  <h2>{copy("journeyHistory", "Your item’s journey")}</h2>
                  {data.collectionPoint && (
                    <div className="waste-collection-point">
                      <MapPin size={23} />
                      <div>
                        <strong>
                          {nameOf(data.collectionPoint.name) ||
                            data.collectionPoint.code}
                        </strong>
                        <p>{copy("collectionPoint", "Collection centre")}</p>
                      </div>
                    </div>
                  )}
                  {data.history.length ? (
                    <ol>
                      {data.history.map((event) => (
                        <li key={event.code}>
                          <span className="waste-history-dot" />
                          <div>
                            <time>{displayDate(event.at)}</time>
                            <h3>{event.label}</h3>
                            {event.description && <p>{event.description}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>
                      {copy(
                        "noHistory",
                        "No dated journey events are available for this item yet.",
                      )}
                    </p>
                  )}
                  {data.sourceSubmission && (
                    <FollowLink
                      className="waste-detail-link"
                      href={href({
                        resource: "submissions",
                        code: data.sourceSubmission.code,
                      })}
                      onFollow={() =>
                        onOpen({
                          resource: "submissions",
                          code: data.sourceSubmission!.code,
                        })
                      }
                    >
                      {copy("sourceSubmission", "View original submission")}
                      <ArrowUpRight size={17} />
                    </FollowLink>
                  )}
                </div>
              )}
              {value.code === "ownership" && ownership && (
                <div className="waste-ownership">
                  <h2>{copy("ownershipTitle", "Ownership & value")}</h2>
                  <p>
                    {copy(
                      "ownershipTerms",
                      "This experience transfers digital certificate ownership. Physical delivery is not included.",
                    )}
                  </p>
                  <dl className="waste-key-facts">
                    <div>
                      <dt>
                        {copy("approvalReward", "Original approval reward")}
                      </dt>
                      <dd>
                        {ownership.originalReward ??
                          copy("unknown", "Not established")}{" "}
                        {ownership.originalReward != null
                          ? copy("points", "points")
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {copy(
                          "illustrativeCarbonRecord",
                          "Illustrative carbon units (historical record)",
                        )}
                      </dt>
                      <dd>
                        {ownership.illustrativeCarbonUnits ??
                          copy("unknown", "Not established")}
                      </dd>
                    </div>
                    {ownership.settlementStatus && (
                      <div>
                        <dt>{copy("settlement", "Settlement")}</dt>
                        <dd>{readable(ownership.settlementStatus)}</dd>
                      </div>
                    )}
                  </dl>
                  <p>
                    {copy(
                      "certificateRewardSeparation",
                      "Reward points and carbon reward units stay with the contributor. Certificate ownership does not transfer these rewards. Only separately selected realized, available carbon credits can be included in a bundle; illustrative units are not issued carbon credits.",
                    )}
                  </p>
                  {data.relatedAsset && (
                    <FollowLink
                      href={href({
                        resource: "assets",
                        code: data.relatedAsset.code,
                      })}
                      onFollow={() =>
                        onOpen({
                          resource: "assets",
                          code: data.relatedAsset!.code,
                        })
                      }
                      className="waste-primary"
                    >
                      {copy("manageAsset", "Open your asset")}
                      <ArrowUpRight size={17} />
                    </FollowLink>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {zoom && (
        <ReviewDialog
          title={wasteName(item)}
          onClose={() => setZoom(false)}
          className="waste-photo-dialog"
        >
          <WastePhoto item={item} session={session} />
        </ReviewDialog>
      )}
    </article>
  );
}
