import { Leaf } from "lucide-react";
import type {
  EnvironmentalAssessment,
  EnvironmentalIndicator,
} from "../../api";
import "./environmentalImpact.css";

const units: Record<string, string> = {
  KG_CO2E: "kg CO₂e",
  T_CO2E: "tCO₂e",
  KG: "kg",
  KWH: "kWh",
  L: "L",
  EACH: "items",
};
const statuses: Record<EnvironmentalIndicator["status"], string> = {
  NOT_ASSESSED: "Not assessed",
  ILLUSTRATIVE: "Unvalidated",
  ESTIMATED: "Estimated",
  CONFIRMED: "Assessed",
  RECALCULATED: "Recalculated",
  FAILED: "Unavailable",
};

/** Displays owner-calculated values; never calculates emissions or converts them into credits. */
export function EnvironmentalImpactCard({
  assessment,
}: {
  assessment?: EnvironmentalAssessment;
}) {
  const indicators = assessment?.indicators || [];
  const headline = assessment?.methodology.isMock
    ? undefined
    : indicators.find(
        (item) => item.key === "avoidedEmissions" && item.value !== null,
      );
  const illustrative = assessment?.status === "ILLUSTRATIVE";
  const method = assessment?.methodology;
  return (
    <section className="environment-card" aria-label="Environmental assessment">
      <div className="environment-heading">
        <Leaf size={22} aria-hidden="true" />
        <h3>Environmental impact</h3>
        <span
          className={`environment-status ${illustrative ? "illustrative" : ""}`}
        >
          {assessment ? statuses[assessment.status] : "Not assessed"}
        </span>
      </div>
      {headline ? (
        <div className="environment-headline">
          <strong>
            {Number(headline.value).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}{" "}
            <small>
              {units[headline.unitOfMeasure] || headline.unitOfMeasure}
            </small>
          </strong>
          <span>
            {assessment?.methodology.assessmentBasis === "POTENTIAL"
              ? "Potential CO₂e savings"
              : headline.label}
          </span>
        </div>
      ) : (
        <p>
          More evidence is needed to assess this item’s environmental impact.
        </p>
      )}
      <p className="environment-explanation">
        {illustrative
          ? "A sourced assessment is needed before an emissions saving can be reported."
          : "Environmental values depend on the item, treatment route and calculation method. Photo recognition alone does not establish them."}
      </p>
      {indicators.find(
        (item) => item.key === "carbonEquivalent" && item.value !== null,
      ) && (
        <div className="environment-credit">
          <span>Carbon equivalent</span>
          <strong>
            {indicators.find((item) => item.key === "carbonEquivalent")?.value}{" "}
            tCO₂e
          </strong>
        </div>
      )}
      {assessment?.methodology.assessmentBasis === "POTENTIAL" && (
        <p className="environment-explanation">
          Potential savings assume the stated future treatment. Submission or
          approval alone does not confirm recycling.
        </p>
      )}
      {!!indicators.length && (
        <details className="environment-details">
          <summary>View environmental properties ({indicators.length})</summary>
          <dl>
            {indicators.map((item) => (
              <div className="environment-indicator" key={item.key}>
                <dt>{item.label}</dt>
                <dd>
                  <strong>
                    {item.value === null || illustrative
                      ? statuses[item.status]
                      : `${Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${units[item.unitOfMeasure] || item.unitOfMeasure}`}
                  </strong>
                  {item.value !== null && <span>{statuses[item.status]}</span>}
                </dd>
                {item.value === null && (
                  <dd className="environment-requirements">
                    {item.reason} Assessment needs:{" "}
                    {item.requirements.join("; ")}.
                  </dd>
                )}
                {item.key === "netEmissionsBenefit" &&
                  item.value !== null &&
                  Number(item.value) < 0 && (
                    <dd className="environment-requirements">
                      A negative benefit represents an emissions increase within
                      the stated assessment boundary.
                    </dd>
                  )}
              </div>
            ))}
          </dl>
          <div className="environment-method">
            <h4>Calculation basis</h4>
            <p>
              {method?.isMock ? "Method not validated" : "Assessment method"}
              {!method?.isMock && method?.formulaVersion
                ? ` · ${method.formulaVersion}`
                : " not provided"}
            </p>
            {method?.methodologyRef && (
              <p>Methodology: {method.methodologyRef}</p>
            )}
            {assessment?.inputs?.weightKg !== undefined && (
              <p>
                Calculation weight: {assessment.inputs.weightKg} kg ·{" "}
                {assessment.inputs.weightSource === "ESTIMATED_RANGE_MIDPOINT"
                  ? "estimated range midpoint"
                  : assessment.inputs.weightSource === "QUANTITY_DEFAULT_WEIGHT"
                    ? "assumed from item count"
                    : assessment.inputs.weightSource === "verifiedWeight"
                      ? "verified input"
                      : assessment.inputs.weightSource === "receivedWeight"
                        ? "received weight"
                        : "declared input"}
              </p>
            )}
            {!illustrative &&
              assessment?.factors?.factorKgCO2ePerKg !== undefined && (
                <p>
                  Emissions factor:{" "}
                  {assessment.factors.factorKgCO2ePerKg.toLocaleString(
                    undefined,
                    { maximumFractionDigits: 6 },
                  )}{" "}
                  kg CO₂e/kg
                </p>
              )}
            {!illustrative && assessment?.factors?.factorSetVersion && (
              <p>Factor set: {assessment.factors.factorSetVersion}</p>
            )}
            {method?.factorDatasetRef && (
              <p>Factor dataset: {method.factorDatasetRef}</p>
            )}
            {assessment?.inputs?.weightMinKg !== undefined &&
              assessment.inputs.weightMinKg !==
                assessment.inputs.weightMaxKg && (
                <p>
                  Estimated total weight range: {assessment.inputs.weightMinKg}–
                  {assessment.inputs.weightMaxKg} kg
                </p>
              )}
            {assessment?.factors?.savingsMinKgCO2e !== undefined &&
              assessment.factors.savingsMinKgCO2e !==
                assessment.factors.savingsMaxKgCO2e && (
                <p>
                  Potential savings range: {assessment.factors.savingsMinKgCO2e}
                  –{assessment.factors.savingsMaxKgCO2e} kg CO₂e
                </p>
              )}
            {!illustrative && method?.providerCode && (
              <p>
                Provider: {method.providerCode} · {method.providerVersion || ""}
              </p>
            )}
            <p>Region: {method?.geography || "Not specified"}</p>
            <p>Baseline: {method?.baselineScenario || "Not specified"}</p>
            <p>Treatment: {method?.treatmentScenario || "Not specified"}</p>
            <p>
              Assessment boundary: {method?.systemBoundary || "Not specified"}
            </p>
            {method?.referenceYear && (
              <p>Reference year: {method.referenceYear}</p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
