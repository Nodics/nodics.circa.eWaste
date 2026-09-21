import { describe, expect, it } from "vitest";

import { originalRewardOf, type Asset } from "./api";

const asset = (metadata: Asset["metadata"]): Asset => ({
  code: "ASSET_1",
  revision: 1,
  assetStatus: "OWNED",
  ownerRef: { module: "profile", schema: "customer", code: "CUSTOMER_1" },
  sourceSubmissionCode: "SUBMISSION_1",
  metadata,
});

describe("confirmed reward projection", () => {
  it("prefers settled Rules assessment evidence over legacy valuation fields", () => {
    expect(
      originalRewardOf(
        asset({
          facts: {},
          rewardSettlement: {
            assessmentCode: "ASSESSMENT_1",
            rewardTypeCode: "points",
            rewardAmount: "25.00",
            policyCode: "EWASTE_REWARD",
            policyVersion: 3,
            settledAt: "2026-09-20T00:00:00.000Z",
          },
          valuation: {
            pointsRewardTypeCode: "points",
            rewards: [{ rewardTypeCode: "points", amount: "10.00" }],
          },
        }),
      ),
    ).toBe("25.00");
  });

  it("shows a confirmed outcome while settlement is pending", () => {
    expect(
      originalRewardOf(
        asset({
          facts: {},
          confirmedReward: {
            rewardTypeCode: "points",
            rewardAmount: "18.50",
          },
        }),
      ),
    ).toBe("18.50");
  });
});
