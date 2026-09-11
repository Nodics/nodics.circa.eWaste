import { useState } from "react";
import { Coins, ImageOff, Leaf, ArrowUpRight, Eye } from "lucide-react";
import { type Offer } from "../../api";
import { publishedArtwork } from "../../cms";
import { ItemSpecifications } from "../submission/ItemDetailsCard";
import { EnvironmentalImpactCard } from "../submission/EnvironmentalImpactCard";
import "./catalogue.css";

export const humanize = (value?: string | null) =>
  !value || value === "UNKNOWN"
    ? "Not established"
    : value.toLowerCase().replaceAll("_", " ");
export const expiryLabel = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString("en-GB")
    : "Not provided";
/** Renders only published product imagery; unavailable images have an honest placeholder. */
export function ProductImage({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={publishedArtwork(url)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className="catalogue-image-empty"
      role="img"
      aria-label={`No image available for ${name}`}
    >
      <ImageOff size={32} />
      <span>Image unavailable</span>
    </div>
  );
}
/** One public card interaction pattern: real detail links and a separate quick-view action. */
export function CatalogueCard({
  offer,
  href,
  onQuickView,
}: {
  offer: Offer;
  href: string;
  onQuickView?: () => void;
}) {
  return (
    <article className="catalogue-card">
      <div className="catalogue-card-media">
        <a href={href} aria-label={`View details: ${offer.name}`}>
          <ProductImage
            key={offer.imageUrl}
            url={offer.imageUrl}
            name={offer.name}
          />
        </a>
        <span className="catalogue-badge">
          {offer.available === false
            ? "Unavailable"
            : offer.kind === "ASSET"
              ? "Verified asset"
              : "Partner offer"}
        </span>
        {onQuickView && (
          <button
            className="catalogue-quick-trigger"
            aria-label={`Quick view: ${offer.name}`}
            onClick={onQuickView}
          >
            <Eye size={17} />
            <span>Quick view</span>
          </button>
        )}
      </div>
      <div className="catalogue-card-body">
        <p className="catalogue-eyebrow">
          {offer.issuer ||
            (offer.kind === "ASSET" ? "Circa collection" : "Partner offer")}
        </p>
        <h2>
          <a href={href}>{offer.name}</a>
        </h2>
        <p className="catalogue-card-description">
          {offer.descriptor?.identity.description ||
            offer.description ||
            "View the product for more information."}
        </p>
        <p className="catalogue-card-facts">
          {offer.kind === "ASSET"
            ? humanize(offer.condition || offer.descriptor?.condition.value)
            : offer.expiresAt
              ? `Valid until ${expiryLabel(offer.expiresAt)}`
              : "Validity not provided"}
        </p>
        <div className="catalogue-card-price">
          <Coins size={16} />
          <strong>{offer.rewardPrice.toLocaleString()}</strong> points
        </div>
        <a className="catalogue-detail-link" href={href}>
          View details <ArrowUpRight size={16} />
        </a>
      </div>
    </article>
  );
}
/** Product gallery is shared by quick view and the full detail page. */
export function ProductGallery({ offer }: { offer: Offer }) {
  const gallery = offer.gallery?.length
    ? offer.gallery
    : offer.imageUrl
      ? [{ url: offer.imageUrl, alt: offer.name }]
      : [];
  const [selected, setSelected] = useState(0);
  const photo = gallery[selected] || gallery[0];
  return (
    <div className="catalogue-gallery">
      <div className="catalogue-gallery-main">
        <ProductImage
          key={photo?.url}
          url={photo?.url}
          name={photo?.alt || offer.name}
        />
      </div>
      {gallery.length > 1 && (
        <div
          className="catalogue-gallery-thumbs"
          role="group"
          aria-label="Product photos"
        >
          {gallery.map((item, index) => (
            <button
              key={item.url}
              aria-label={`View photo ${index + 1}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              <ProductImage url={item.url} name={item.alt || offer.name} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function ProductSummary({
  offer,
  quick = false,
}: {
  offer: Offer;
  quick?: boolean;
}) {
  const Heading = quick ? "h2" : "h1";
  return (
    <div className="catalogue-summary">
      <p className="catalogue-eyebrow">{offer.issuer || "Circa collection"}</p>
      <Heading>{offer.name}</Heading>
      <p>
        {offer.descriptor?.identity.description ||
          offer.description ||
          "A description has not been provided."}
      </p>
      <p className="catalogue-product-price">
        <Coins size={23} />
        <strong>{offer.rewardPrice.toLocaleString()}</strong> reward points
      </p>
      <dl className="catalogue-summary-facts">
        {offer.kind === "ASSET" ? (
          <>
            <div>
              <dt>Category</dt>
              <dd>{offer.category?.label || "Not established"}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>
                {humanize(offer.condition || offer.descriptor?.condition.value)}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Partner</dt>
              <dd>{offer.issuer || "Not provided"}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{expiryLabel(offer.expiresAt)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Availability</dt>
          <dd>
            {offer.available === false ? "Currently unavailable" : "Available"}
          </dd>
        </div>
      </dl>
      {offer.kind === "ASSET" && (
        <p className="catalogue-carbon">
          <Leaf size={16} />
          {offer.carbonUnits ?? 0} carbon units transfer with ownership.
        </p>
      )}
      {quick && offer.kind === "COUPON" && (
        <p>
          Check eligibility, terms and redemption instructions before
          purchasing.
        </p>
      )}
    </div>
  );
}
function PublishedTerms({ title, lines }: { title: string; lines?: string[] }) {
  return (
    <section className="catalogue-terms-section">
      <h3>{title}</h3>
      {lines?.length ? (
        lines.map((line, index) => <p key={index}>{line}</p>)
      ) : (
        <p>{title} have not been provided by the publisher.</p>
      )}
    </section>
  );
}
/** Owner-specific detail sections share presentation without making coupons behave like Waste assets. */
export function ProductInformation({ offer }: { offer: Offer }) {
  return (
    <div className="catalogue-information">
      {offer.kind === "ASSET" ? (
        <>
          <details open>
            <summary>Specifications</summary>
            {offer.descriptor ? (
              <ItemSpecifications
                descriptor={offer.descriptor}
                code={offer.assetCode || offer.code}
              />
            ) : (
              <p>Verified specifications have not been provided.</p>
            )}
          </details>
          <details open>
            <summary>Environmental assessment</summary>
            <EnvironmentalImpactCard
              assessment={offer.descriptor?.environment.assessment || undefined}
            />
          </details>
          <details open>
            <summary>Ownership & purchase conditions</summary>
            <p>
              The listed asset changes ownership after a confirmed purchase.
              Original approval rewards remain with the contributor.
            </p>
            {offer.saleMode === "DIGITAL_OWNERSHIP" && (
              <p>
                This listing transfers digital ownership. Physical delivery is
                not included.
              </p>
            )}
            <PublishedTerms
              title="Additional purchase conditions"
              lines={offer.purchaseConditions}
            />
          </details>
        </>
      ) : (
        <>
          <details open>
            <summary>Offer & validity</summary>
            <p>{offer.description || offer.name}</p>
            <p>
              Issued by {offer.issuer || "the publishing partner"}.{" "}
              {offer.expiresAt
                ? `Valid until ${expiryLabel(offer.expiresAt)}.`
                : "An expiry date has not been provided."}
            </p>
          </details>
          <details open>
            <summary>Eligibility & terms</summary>
            <PublishedTerms
              title="Eligibility requirements"
              lines={offer.eligibility}
            />
            <PublishedTerms title="Terms and conditions" lines={offer.terms} />
            <PublishedTerms title="Exclusions" lines={offer.exclusions} />
          </details>
          <details open>
            <summary>How to redeem</summary>
            <PublishedTerms
              title="Redemption instructions"
              lines={offer.redemptionInstructions}
            />
            <p>
              After purchase, your issued coupon appears in My Account →
              Purchases & coupons.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
