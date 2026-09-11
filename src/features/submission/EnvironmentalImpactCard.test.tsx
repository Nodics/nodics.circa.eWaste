import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { EnvironmentalAssessment } from "../../api";
import { EnvironmentalImpactCard } from "./EnvironmentalImpactCard";

afterEach(cleanup);
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
  const water = screen.getByText("Water saved").parentElement!;
  expect(within(water).getByText("Not assessed")).toBeInTheDocument();
  expect(within(water).queryByText("0 L")).not.toBeInTheDocument();
  expect(screen.queryByText("0 kWh")).not.toBeInTheDocument();
  expect(screen.queryByText("Carbon credits")).not.toBeInTheDocument();
  expect(screen.queryByText(/0 credits/i)).not.toBeInTheDocument();
});
it("supports old drafts without inventing environmental values", () => {
  render(<EnvironmentalImpactCard/>);
  expect(screen.getByText(/More evidence is needed/)).toBeInTheDocument();
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
  expect(screen.getByText('0.002381 tCO₂e')).toBeInTheDocument();
  expect(screen.getByText(/estimated range midpoint/)).toBeInTheDocument();
  expect(screen.getByText(/Estimated total weight range: 1–3 kg/)).toBeInTheDocument();
  expect(screen.queryByText(/Illustrative|demo/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Carbon credits')).not.toBeInTheDocument();
});
