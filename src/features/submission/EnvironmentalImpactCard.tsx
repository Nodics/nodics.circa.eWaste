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
  NOT_ASSESSED: "Pending calculation",
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
  const allIndicators = assessment?.indicators || [];
  const valid = assessment && !assessment.methodology.isMock &&
    !["FAILED", "ILLUSTRATIVE", "NOT_ASSESSED"].includes(assessment.status);
  const indicators = valid ? allIndicators.filter(item => item.value !== null &&
    ["ESTIMATED", "CONFIRMED", "RECALCULATED"].includes(item.status)) : [];
  const pending = allIndicators.filter(item => item.value === null);
  const factors = assessment?.factors;
  const hasSavingsRange = typeof factors?.savingsMinKgCO2e === "number" &&
    typeof factors?.savingsMaxKgCO2e === "number" && factors.savingsMinKgCO2e !== factors.savingsMaxKgCO2e;
  const format = (value: number | string) => Number(value).toLocaleString(undefined, { maximumSignificantDigits: 3 });
  const headline = assessment?.methodology.isMock
    ? undefined
    : indicators.find(
        (item) => item.key === "avoidedEmissions" && item.value !== null,
      );
  const illustrative = assessment?.status === "ILLUSTRATIVE";
  const method = assessment?.methodology;
  const inputOnly = method?.assessmentBasis === "INPUT_ONLY";
  const reference = method?.assessmentBasis === "REFERENCE_SCENARIO";
  return (
    <section className="environment-card" aria-label="Environmental assessment">
      <div className="environment-heading">
        <Leaf size={22} aria-hidden="true" />
        <h3>Environmental impact</h3>
        <span
          className={`environment-status ${illustrative ? "illustrative" : ""}`}
        >
          {valid ? inputOnly ? "Recycling input estimate" : reference ? "Reference estimate" : statuses[assessment.status] : "Assessment needed"}
        </span>
      </div>
      {headline ? (
        <div className="environment-headline">
          <strong>
            {hasSavingsRange
              ? `${format(factors!.savingsMinKgCO2e!)}–${format(factors!.savingsMaxKgCO2e!)}`
              : format(headline.value!)}{" "}
            <small>
              {units[headline.unitOfMeasure] || headline.unitOfMeasure}
            </small>
          </strong>
          <span>
            {["POTENTIAL", "REFERENCE_SCENARIO"].includes(assessment?.methodology.assessmentBasis || "")
              ? "Potential CO₂e savings"
              : headline.label}
          </span>
        </div>
      ) : inputOnly ? (
        <p>Carbon savings have not been calculated for this item yet. The current assessment covers recycling quantity only.</p>
      ) : (
        <p>
          We need a supported impact factor and an item weight to calculate this
          item’s potential savings. You can continue with the item for assessment.
        </p>
      )}
      <p className="environment-explanation">
        {illustrative
          ? "A sourced assessment is needed before an emissions saving can be reported."
          : inputOnly ? "These figures describe the item offered for recycling. Collection and treatment will establish the actual outcome."
          : valid ? "Potential benefits compare recycling with landfilling using the reference method below. Actual outcomes depend on treatment."
          : "No environmental savings have been recorded for this item yet."}
      </p>
      {reference && <p className="environment-explanation">{method?.referenceScenarioExplanation}
        {" "}This is a comparable-device scenario, not a measured saving for your item.</p>}
      {!!indicators.length && (
        <dl className="environment-benefits">
          {indicators.filter(item => ["energySaved", "recyclingInputMass", "recyclingItemCount"].includes(item.key)).map(item => {
            const bounds = item.key === "energySaved" ? [factors?.energyMinKWh, factors?.energyMaxKWh]
              : item.key === "recyclingInputMass" ? [assessment?.inputs?.weightMinKg, assessment?.inputs?.weightMaxKg] : [];
            return <div key={item.key}>
              <dt>{item.key === "energySaved" ? "Potential energy savings" : item.label}</dt>
              <dd><strong>{bounds[0] !== undefined && bounds[1] !== undefined && bounds[0] !== bounds[1]
                ? `${format(bounds[0])}–${format(bounds[1])}` : format(item.value!)} {item.unitOfMeasure === "EACH" && Number(item.value) === 1 ? "item" : units[item.unitOfMeasure] || item.unitOfMeasure}</strong></dd>
            </div>;
          })}
        </dl>
      )}
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
      {["POTENTIAL", "REFERENCE_SCENARIO"].includes(assessment?.methodology.assessmentBasis || "") && (
        <p className="environment-explanation">
          Potential savings assume the stated future treatment. Submission or
          approval alone does not confirm recycling.
        </p>
      )}
      {valid && pending.length > 0 && <p className="environment-explanation">
        Other outcomes, including water savings, recovered materials and completed diversion,
        are not included in this estimate. They need additional assessment or treatment evidence.
      </p>}
      {!!indicators.length && (
        <details className="environment-details">
          <summary>Calculation details ({indicators.length})</summary>
          <dl>
            {indicators.map((item) => (
              <div className="environment-indicator" key={item.key}>
                <dt>{item.label}</dt>
                <dd>
                  <strong>
                    {item.value === null || illustrative
                      ? statuses[item.status]
                      : `${format(item.value)} ${units[item.unitOfMeasure] || item.unitOfMeasure}`}
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
            {method?.providerCode === "OPENAI_EWASTE_ASSESSMENT" && <p>AI-assisted estimate using published references. Values describe potential benefits under the assumptions below.</p>}
            <p>
              {inputOnly ? "Recycling quantity assessment"
                : reference ? "Comparison with similar electronics"
                : "Comparison of recycling and landfill emissions"}
            </p>
            {reference && method?.weightReference && <p>Weight basis: {method?.weightReference}</p>}
            {reference && method?.weightReferenceUrl?.startsWith("https://") && <p><a href={method.weightReferenceUrl} target="_blank" rel="noreferrer">Published weight reference</a></p>}
            {reference && method?.comparisonReferenceUrl?.startsWith("https://") && <p><a href={method.comparisonReferenceUrl} target="_blank" rel="noreferrer">Second weight reference</a></p>}
            {assessment?.inputs?.weightKg !== undefined && (
              <p>
                Calculation weight: {assessment.inputs.weightKg} kg ·{" "}
                {assessment.inputs.weightSource === "REFERENCE_ASSUMPTION"
                  ? "reference weight assumption"
                  : assessment.inputs.weightSource === "ESTIMATED_RANGE_MIDPOINT"
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
            {!inputOnly && !illustrative && method?.providerCode === "EPA_WARM_ELECTRONICS" && (
              <p>Source: US Environmental Protection Agency’s Waste Reduction Model (WARM).
                {method.factorDatasetRef?.startsWith("https://") && <> <a href={method.factorDatasetRef} target="_blank" rel="noreferrer">View calculation source</a></>}
              </p>
            )}
            {!inputOnly && <>
            <p>Region: {method?.geography || "Not supplied by provider"}</p>
            <p>Baseline: {method?.baselineScenario || "Not specified"}</p>
            <p>Treatment: {method?.treatmentScenario || "Not specified"}</p>
            <p>
              Assessment boundary: {method?.systemBoundary || "Not specified"}
            </p>
            </>}
            {method?.referenceYear && (
              <p>Reference year: {method.referenceYear}</p>
            )}
            {!!assessment?.metricEvidence?.length && <details>
              <summary>Sources and assumptions</summary>
              {assessment.metricEvidence.map(evidence => <div key={evidence.metricCode}>
                <h4>{assessment.indicators.find(indicator => indicator.metricCode === evidence.metricCode)?.label || "Environmental estimate"}</h4>
                <p>{evidence.explanation}</p>
                {evidence.sourceUrl.startsWith("https://") && <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">View published reference</a>}
              </div>)}
            </details>}
          </div>
        </details>
      )}
    </section>
  );
}
