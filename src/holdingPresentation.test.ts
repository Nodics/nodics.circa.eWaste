import { expect, it } from "vitest";
import { carbonLabel, readableCode } from "./holdingPresentation";

it("keeps machine references out of the primary label while retaining distinguishing suffixes", () => {
  expect(readableCode("SMALL_APPLIANCE")).toBe("Small appliance");
  expect(carbonLabel("CARBON_0123456789abcdef")).toBe(
    "Carbon holding · 89abcdef",
  );
  expect(carbonLabel("CARBON_0123456700000001")).not.toBe(
    carbonLabel("CARBON_0123456700000002"),
  );
});
