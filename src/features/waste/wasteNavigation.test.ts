import { expect, it } from "vitest";
import { readWasteQuery, wasteHref } from "./wasteNavigation";
it("keeps drafts separate while preserving legacy draft links", () => {
  expect(readWasteQuery(new URL("https://example.test/account")).view).toBe("submissions");
  expect(readWasteQuery(new URL("https://example.test/account?view=drafts")).view).toBe("drafts");
  const legacy = readWasteQuery(new URL("https://example.test/account?status=DRAFT"));
  expect(legacy.view).toBe("drafts"); expect(legacy.status).toBe("ALL");
});
it("preserves the draft collection on detail and back navigation", () => {
  const query = readWasteQuery(new URL("https://example.test/account?view=drafts&page=2"));
  expect(wasteHref(query, { resource: "submissions", code: "DRAFT_1" }, false)).toContain("/account/submissions/DRAFT_1?view=drafts");
  expect(wasteHref(query, null, false)).toContain("/account/items?view=drafts");
});
