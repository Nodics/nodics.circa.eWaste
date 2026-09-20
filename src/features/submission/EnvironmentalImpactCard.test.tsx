import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { EnvironmentalAssessment } from "../../api";
import { EnvironmentalImpactCard } from "./EnvironmentalImpactCard";

afterEach(cleanup);
it("shows AI reference explanations using customer labels and safe source links", () => {
  render(<EnvironmentalImpactCard assessment={{ ...assessment, status: 'ESTIMATED',
    indicators: [{ ...assessment.indicators[0], status: 'ESTIMATED' }],
    methodology: { ...assessment.methodology, isMock: false, providerCode: 'OPENAI_EWASTE_ASSESSMENT', assessmentBasis: 'REFERENCE_SCENARIO' },
    metricEvidence: [{ metricCode: 'CO2', min: 1, max: 1, sourceUrl: 'https://www.epa.gov/reference', explanation: 'Published factor multiplied by estimated mass.' }] }}/ >);
  expect(screen.getByText(/AI-assisted estimate using published references/)).toBeInTheDocument();
  expect(screen.getByText('Published factor multiplied by estimated mass.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View published reference' })).toHaveAttribute('href', 'https://www.epa.gov/reference');
  expect(screen.queryByText('OPENAI_EWASTE_ASSESSMENT')).not.toBeInTheDocument();
});
const assessment: EnvironmentalAssessment = {
  contractVersion: 1, mappingVersion: "test", status: "ILLUSTRATIVE", assessedAt: "2026-09-09", publicClaimAllowed: false,
  indicators: [
    { key: "avoidedEmissions", metricCode: "CO2", label: "Avoided emissions", unitOfMeasure: "KG_CO2E", value: "1", status: "ILLUSTRATIVE", basis: "mock", requirements: [], reason: null },
    { key: "waterSaved", metricCode: "WATER", label: "Water saved", unitOfMeasure: "L", value: null, status: "NOT_ASSESSED", basis: null, requirements: ["Water assessment"], reason: "No calculation is available." },
    { key: "energySaved", metricCode: "ENERGY", label: "Energy saved", unitOfMeasure: "KWH", value: "0", status: "ESTIMATED", basis: "test", requirements: [], reason: null },
  ],
  methodology: { formulaVersion: "mock", profileCode: "test", providerCode: "test", isMock: true },
  carbonCredits: { status: "NOT_ASSESSED", issuedQuantity: null, registryReference: null, reason: "Credit issuance requires registry evidence." },
};
it("keeps unvalidated historical values separate without unwanted application labels", () => {
  render(<EnvironmentalImpactCard assessment={assessment}/>);
  expect(screen.queryByText(/Illustrative|demo/i)).not.toBeInTheDocument();
  expect(screen.getByText(/A sourced assessment is needed/)).toBeInTheDocument();
  expect(screen.queryByText("Water saved")).not.toBeInTheDocument();
  expect(screen.queryByText("0 L")).not.toBeInTheDocument();
  expect(screen.queryByText("0 kWh")).not.toBeInTheDocument();
  expect(screen.queryByText("Carbon credits")).not.toBeInTheDocument();
  expect(screen.queryByText(/0 credits/i)).not.toBeInTheDocument();
});
it("supports old drafts without inventing environmental values", () => {
  render(<EnvironmentalImpactCard/>);
  expect(screen.getByText(/We need a supported impact factor/)).toBeInTheDocument();
  expect(screen.queryByText(/kg CO₂e/)).not.toBeInTheDocument();
});
it("shows signed net impact and never treats assessment confirmation as credit certification", () => {
  render(<EnvironmentalImpactCard assessment={{ ...assessment, status: "CONFIRMED", indicators: [{ ...assessment.indicators[0], key: "netEmissionsBenefit", label: "Net emissions benefit", value: "-2.5", status: "CONFIRMED" }], methodology: { ...assessment.methodology, isMock: false } }}/>);
  expect(screen.getByText("-2.5 kg CO₂e")).toBeInTheDocument();
  expect(screen.getByText(/emissions increase within/)).toBeInTheDocument();
  expect(screen.queryByText("Carbon credits")).not.toBeInTheDocument();
});

it("shows potential savings, carbon equivalent and sourced range evidence without issuing credits", () => {
  render(<EnvironmentalImpactCard assessment={{ ...assessment, status: 'ESTIMATED', methodology: { ...assessment.methodology, isMock: false, assessmentBasis: 'POTENTIAL', providerCode: 'EPA_WARM_ELECTRONICS', providerVersion: '1', baselineScenario: 'Landfilling', treatmentScenario: 'Recycling', geography: 'US reference' }, inputs: { weightKg: 2, weightMinKg: 1, weightMaxKg: 3, weightSource: 'ESTIMATED_RANGE_MIDPOINT' }, indicators: [{ ...assessment.indicators[0], value: '2.380992', status: 'ESTIMATED' }, { ...assessment.indicators[0], key: 'carbonEquivalent', label: 'Carbon equivalent', value: '0.002381', unitOfMeasure: 'T_CO2E', status: 'ESTIMATED' }] }}/>);
  expect(screen.getByText('Potential CO₂e savings')).toBeInTheDocument();
  expect(screen.getByText(/Environmental Protection Agency’s Waste Reduction Model/)).toBeInTheDocument();
  expect(screen.queryByText(/EPA_WARM_ELECTRONICS|Factor set:|Factor dataset:/)).not.toBeInTheDocument();
  expect(screen.getByText('0.002381 tCO₂e')).toBeInTheDocument();
  expect(screen.getByText(/estimated range midpoint/)).toBeInTheDocument();
  expect(screen.getByText(/Estimated total weight range: 1–3 kg/)).toBeInTheDocument();
  expect(screen.queryByText(/Illustrative|demo/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Carbon credits')).not.toBeInTheDocument();
});


it("shows sourced benefit ranges and omits unavailable rows without turning missing values into zero", () => {
  render(<EnvironmentalImpactCard assessment={{ ...assessment, status: "ESTIMATED",
    methodology: { ...assessment.methodology, isMock: false, assessmentBasis: "POTENTIAL" },
    factors: { savingsMinKgCO2e: .02, savingsMaxKgCO2e: .04, energyMinKWh: .1, energyMaxKWh: .3 },
    inputs: { weightMinKg: .05, weightMaxKg: .1 },
    indicators: [ { ...assessment.indicators[0], value: ".03", status: "ESTIMATED" },
      assessment.indicators[1], { ...assessment.indicators[2], value: ".2", status: "ESTIMATED" } ] }} />);
  expect(screen.getByText(/^0.02–0.04$/)).toBeInTheDocument();
  expect(screen.getByText("0.1–0.3 kWh")).toBeInTheDocument();
  expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  expect(screen.queryByText("Water saved")).not.toBeInTheDocument();
});
it("never renders stale numeric values from a failed assessment", () => {
  render(<EnvironmentalImpactCard assessment={{ ...assessment, status: "FAILED",
    methodology: { ...assessment.methodology, isMock: false } }} />);
  expect(screen.queryByText(/kg CO₂e/)).not.toBeInTheDocument();
  expect(screen.queryByText("Calculation basis")).not.toBeInTheDocument();
});

it("clearly distinguishes a reference proxy from an item-specific assessment", () => {
 render(<EnvironmentalImpactCard assessment={{...assessment,status:"ESTIMATED",indicators:[{...assessment.indicators[0],status:"ESTIMATED"}],
 methodology:{...assessment.methodology,isMock:false,assessmentBasis:"REFERENCE_SCENARIO",referenceScenarioExplanation:"Peripherals proxy; assumed weight."}}}/>);
 expect(screen.getByText("Reference estimate")).toBeInTheDocument();
 expect(screen.getByText(/not a measured saving for your item/)).toBeInTheDocument();
});

it("retains input estimates without claiming unsupported climate savings", () => {
 render(<EnvironmentalImpactCard assessment={{...assessment,status:"ESTIMATED",
 inputs:{weightMinKg:.1,weightMaxKg:.3},
 indicators:[{...assessment.indicators[0],key:"recyclingInputMass",label:"Potential recycling input",unitOfMeasure:"KG",value:".2",status:"ESTIMATED"}],
 methodology:{...assessment.methodology,isMock:false,assessmentBasis:"INPUT_ONLY",formulaVersion:"RECYCLING_INPUT_ASSESSMENT_V1",providerCode:"EPA_WARM_ELECTRONICS",providerVersion:"4",assessmentLimitation:"No supported carbon factor is mapped."}}}/>);
 expect(screen.getByText("0.1–0.3 kg")).toBeInTheDocument();
 expect(screen.getByText(/Carbon savings have not been calculated/)).toBeInTheDocument();
 expect(screen.getByText("Recycling quantity assessment")).toBeInTheDocument();
 expect(screen.queryByText(/RECYCLING_INPUT_ASSESSMENT|EPA_WARM|Provider:|Environmental Protection Agency/)).not.toBeInTheDocument();
 expect(screen.queryByText(/compare recycling with landfilling/)).not.toBeInTheDocument();
 expect(screen.queryByText("Assessment needed")).not.toBeInTheDocument();
 expect(screen.queryByText(/kg CO₂e/)).not.toBeInTheDocument();
});


it("keeps small carbon equivalents readable and hides internal reference identifiers", () => {
 render(<EnvironmentalImpactCard assessment={{...assessment,status:"ESTIMATED",
 methodology:{...assessment.methodology,isMock:false,assessmentBasis:"REFERENCE_SCENARIO",formulaVersion:"WARM_BASELINE_MINUS_TREATMENT_V1",providerCode:"EPA_WARM_ELECTRONICS",referenceScenarioExplanation:"Mixed-electronics reference comparison; composition may differ."},
 factors:{savingsMinKgCO2e:.253532,savingsMaxKgCO2e:.811301,factorSetVersion:"EPA_WARM_V16_DEC2023"},
 indicators:[{...assessment.indicators[0],status:"ESTIMATED",value:".532417"},{...assessment.indicators[0],key:"carbonEquivalent",label:"Carbon equivalent",unitOfMeasure:"T_CO2E",status:"ESTIMATED",value:"0.000532"}]}}/>);
 expect(screen.getByText("0.254–0.811")).toBeInTheDocument();
 expect(screen.getAllByText("0.000532 tCO₂e")).toHaveLength(2);
 expect(screen.queryByText(/WARM_BASELINE|EPA_WARM_|Weight basis:/)).not.toBeInTheDocument();
 expect(screen.getByText(/composition may differ/)).toBeInTheDocument();
});
