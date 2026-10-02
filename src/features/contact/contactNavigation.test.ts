/** Authored default-off account deep-link fixtures; NOT RUN. */
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("keeps contact navigation and Web/mobile selectors inert unless explicitly enabled", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "false");
  vi.resetModules();
  const sections = await import("../../AccountSections");
  expect(
    sections.accountSections.some((row) => row.code === "preferences"),
  ).toBe(false);
  expect(
    sections.readAccountSection(
      false,
      new URL("https://fixture.invalid/account/preferences"),
    ),
  ).toBeNull();
  expect(
    sections.readAccountSection(
      true,
      new URL("https://fixture.invalid/mobile?account=preferences"),
    ),
  ).toBeNull();
});
it("admits only the existing account destination when explicitly enabled", async () => {
  vi.stubEnv("VITE_CIRCA_CONTACT_PREFERENCES_ENABLED", "true");
  vi.resetModules();
  const sections = await import("../../AccountSections");
  expect(
    sections.accountSections.some((row) => row.code === "preferences"),
  ).toBe(true);
  expect(
    sections.readAccountSection(
      false,
      new URL("https://fixture.invalid/account/preferences"),
    ),
  ).toBe("preferences");
  expect(
    sections.readAccountSection(
      true,
      new URL("https://fixture.invalid/mobile?account=preferences"),
    ),
  ).toBe("preferences");
});
