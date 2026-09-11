import { Leaf, Layers, ChevronDown } from "lucide-react";
import {
  nameOf,
  type ItemDescriptor,
  type Facts,
  type EnvironmentalAssessment,
  type DescriptorRange,
} from "../../api";
import { EnvironmentalImpactCard } from "./EnvironmentalImpactCard";
import "./itemDetails.css";

const words = (value?: string | null) =>
  !value || value === "UNKNOWN"
    ? "Not established"
    : value.toLowerCase().replaceAll("_", " ");
const range = (value?: DescriptorRange | null) =>
  value?.min != null && value.max != null
    ? `${value.min}–${value.max} ${value.unit.toLowerCase()} · ${words(value.basis)}`
    : "Not established";
/** Shared customer presentation for confirmation, submitted/reviewed outcomes and owned assets. Values come from the authorized owner descriptor. */
export function ItemDetailsCard({
  record,
  image,
  onEdit,
}: {
  record: {
    code: string;
    submissionStatus?: string;
    descriptor?: ItemDescriptor;
    submittedFacts?: Facts;
    confirmedFacts?: Facts;
    metadata: {
      publicReason?: string;
      facts?: Facts;
      estimate?: {
        metadata?: { environmentalAssessment?: EnvironmentalAssessment };
      };
    };
  };
  image?: string;
  onEdit?: () => void;
}) {
  const descriptor = record.descriptor;
  const facts =
    record.confirmedFacts ||
    record.submittedFacts ||
    record.metadata.facts ||
    {};
  const title =
    descriptor?.identity.name || facts.name || "Your recycling item";
  const review = descriptor?.review || {
    decision: record.submissionStatus,
    comment: record.metadata.publicReason,
  };
  const assessment =
    descriptor?.environment.assessment ||
    record.metadata.estimate?.metadata?.environmentalAssessment;
  return (
    <section className="item-detail-card" aria-label="Complete item details">
      {review?.comment && (
        <div
          className={`item-detail-outcome ${review.decision === "REJECTED" ? "rejected" : ""}`}
        >
          <strong>Reviewer’s comment</strong>
          <p>{review.comment}</p>
        </div>
      )}
      <div className="item-detail-identity">
        {image && <img src={image} alt={title} />}
        <div>
          <span className="item-detail-eyebrow">
            {descriptor?.stage === "REVIEWED" ? "Reviewed item" : "Your item"}
          </span>
          <h2>{title}</h2>
          <p>
            {descriptor?.identity.description ||
              facts.description ||
              "No description available."}
          </p>
          {onEdit && (
            <button className="item-detail-edit" onClick={onEdit}>
              Edit name and description
            </button>
          )}
        </div>
      </div>
      {descriptor?.requiresClassificationReview && (
        <p className="item-detail-note">
          The collection team will identify and classify this item during
          review. You only need to check its name and description.
        </p>
      )}
      {descriptor?.evidenceReview?.manualApprovalRequired && (
        <div className="item-detail-evidence" role="note">
          <strong>{descriptor.evidenceReview.label}</strong>
          <p>
            {descriptor.evidenceReview.customerMessage ||
              descriptor.evidenceReview.message}
          </p>
          <small>{descriptor.evidenceReview.sourceLabel}</small>
        </div>
      )}
      <EnvironmentalImpactCard assessment={assessment || undefined} />
      <div className="item-detail-purpose">
        <Leaf size={19} />
        <p>
          Your contribution helps keep valuable materials in a controlled
          recovery process.
        </p>
      </div>
      <details className="item-detail-disclosure">
        <summary>
          <Layers size={18} />
          <span>Full classification and properties</span>
          <ChevronDown size={17} />
        </summary>
        <ItemSpecifications
          descriptor={descriptor}
          facts={facts}
          code={record.code}
        />
      </details>
    </section>
  );
}

/** Complete property rendering shared by submission review and customer detail pages. */
export function ItemSpecifications({
  descriptor,
  facts = {},
  code,
}: {
  descriptor?: ItemDescriptor;
  facts?: Facts;
  code: string;
}) {
  const observations = descriptor?.environment.observations;
  return (
    <div className="item-property-content">
      <h3>Classification</h3>
      <dl>
        {["family", "category", "itemType"].map((key) => {
          const entry =
            descriptor?.classification[
              key as "family" | "category" | "itemType"
            ];
          return (
            <div key={key}>
              <dt>
                {key === "itemType"
                  ? "Item type"
                  : key[0].toUpperCase() + key.slice(1)}
              </dt>
              <dd>{nameOf(entry?.name || undefined) || words(entry?.code)}</dd>
            </div>
          );
        })}
        <div>
          <dt>Brand / model</dt>
          <dd>
            {[
              descriptor?.identity.brand || facts.brand,
              descriptor?.identity.model || facts.model,
            ]
              .filter(Boolean)
              .join(" · ") || "Not established"}
          </dd>
        </div>
        <div>
          <dt>Condition</dt>
          <dd>{words(descriptor?.condition.value || facts.conditionGrade)}</dd>
        </div>
      </dl>
      <h3>Physical properties</h3>
      <dl>
        <div>
          <dt>Quantity</dt>
          <dd>
            {descriptor?.physical.quantity ??
              facts.quantity ??
              "Not established"}
          </dd>
        </div>
        <div>
          <dt>Handling size</dt>
          <dd>
            {words(descriptor?.physical.size.value || facts.sizeClass)}
            {descriptor?.physical.size.basis &&
              descriptor.physical.size.basis !== "UNKNOWN" && (
                <small>{words(descriptor.physical.size.basis)}</small>
              )}
          </dd>
        </div>
        <div>
          <dt>Recorded weight</dt>
          <dd>
            {descriptor?.physical.weight.value
              ? `${descriptor.physical.weight.value} kg`
              : "Not established"}
            {descriptor?.physical.weight.basis &&
              descriptor.physical.weight.basis !== "UNKNOWN" && (
                <small>{words(descriptor.physical.weight.basis)}</small>
              )}
          </dd>
        </div>
        <div>
          <dt>Approximate weight</dt>
          <dd>{range(descriptor?.physical.weightEstimate)}</dd>
        </div>
        {(["length", "width", "height"] as const).map((axis) => (
          <div key={axis}>
            <dt>{axis[0].toUpperCase() + axis.slice(1)}</dt>
            <dd>{range(descriptor?.physical.dimensionsEstimate?.[axis])}</dd>
          </div>
        ))}
      </dl>
      <h3>Materials and components</h3>
      {descriptor?.materials.length ? (
        <ul className="item-materials">
          {descriptor.materials.map((material) => (
            <li key={material.ref.code}>
              <strong>
                {nameOf(material.name || undefined) || words(material.ref.code)}
              </strong>
              <span>
                {words(material.kind)} · {words(material.basis)}
              </span>
              {material.confidence != null && (
                <small>
                  {Math.round(material.confidence * 100)}% analysis confidence
                </small>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Material composition has not been established.</p>
      )}
      <h3>Environmental observations</h3>
      <dl>
        <div>
          <dt>Recyclability</dt>
          <dd>{words(observations?.recyclability.value)}</dd>
        </div>
        <div>
          <dt>Visible contamination</dt>
          <dd>{words(observations?.contamination.value)}</dd>
        </div>
        <div>
          <dt>Material recovery</dt>
          <dd>{words(observations?.recoveryPotential.value)}</dd>
        </div>
        <div>
          <dt>Hazard observations</dt>
          <dd>
            {observations?.hazards.length
              ? observations.hazards
                  .map(
                    (hazard) =>
                      `${words(hazard.code)} (${words(hazard.basis)})`,
                  )
                  .join(", ")
              : "Not established"}
          </dd>
        </div>
      </dl>
      <p className="item-detail-note">
        Image observations and estimates are advisory. No visible hazard does
        not establish that an item is safe. Detailed material quantities and
        composition require further assessment.
      </p>
      <p className="item-detail-reference">Reference · {code}</p>
    </div>
  );
}
