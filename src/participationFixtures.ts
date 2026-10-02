/** Isolated public DTO fixtures, never runtime data or approved business terms. */
export const participationFixture = {
  contractVersion: 1,
  owner: "profile",
  enterpriseCode: "default",
  participation: null as null | {
    phase: "COMPLETE" | "WITHDRAWN";
    revision: number;
    currentTerms: boolean;
    canSwitch: boolean;
  },
  lifecycleQualified: true,
  terms: {
    version: "fixture-1",
    digest: "a".repeat(64),
    documentCode: "fixture-document",
    title: "Owner fixture terms",
    content: "Isolated fixture content, not approved deployment terms.",
  },
  presentation: {
    title: "Owner participation",
    refreshLabel: "Inspect owner",
    consentLabel: "Fixture consent",
    acceptLabel: "Accept owner terms",
    acceptedMessage: "Owner accepted",
    uncertainMessage: "Inspect before another command",
    renewLabel: "Renew owner terms",
    withdrawLabel: "Withdraw owner",
    withdrawReviewTitle: "Review withdrawal",
    confirmLabel: "Confirm owner",
    cancelLabel: "Cancel review",
  },
};
