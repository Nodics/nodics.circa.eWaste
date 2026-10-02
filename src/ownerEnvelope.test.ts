/** Authored nested owner-error fixtures; behavioral execution remains joint. */
import { expect, it } from "vitest";
import { unwrap } from "./api";

it.each([
  { data: { success: false, result: { registered: true } } },
  {
    result: {
      code: "ERR_PROFILE_REGISTRATION_FORM",
      data: { registered: true },
    },
  },
])(
  "rejects nested failure evidence rather than claiming registration",
  (value) => {
    expect(() => unwrap(value)).toThrow("could not be confirmed");
  },
);

it("preserves a genuine nested registration projection", () => {
  expect(unwrap({ data: { result: { registered: true } } })).toEqual({
    registered: true,
  });
});
