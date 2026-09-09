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
it("distinguishes simulations, missing values, measured zero and credit status", () => {
  render(<EnvironmentalImpactCard assessment={assessment}/>);
  expect(screen.getByText("Illustrative emissions saving")).toBeInTheDocument();
  expect(screen.getByText(/not a verified emissions saving/)).toBeInTheDocument();
  const water = screen.getByText("Water saved").parentElement!;
  expect(within(water).getByText("Not assessed")).toBeInTheDocument();
  expect(within(water).queryByText("0 L")).not.toBeInTheDocument();
  expect(screen.getByText("0 kWh")).toBeInTheDocument();
  expect(screen.getByText("Credit issuance requires registry evidence.")).toBeInTheDocument();
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
  expect(screen.getByText("Not assessed")).toBeInTheDocument();
});
