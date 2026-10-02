/** Isolated public contract fixtures, not runtime contacts, destinations, business approval or consent. */
import { contactPresentationKeys } from "./contactClient";
export const contactFixture = {
  contractVersion: 1,
  kind: "PROFILE_VERIFIED_CONTACT_WORKSPACE",
  ownerId: "opaque_fixture_owner",
  channels: ["EMAIL"],
  purposes: [
    {
      code: "FIXTURE_TRANSACTION",
      version: 1,
      channels: ["EMAIL"],
      label: "Fixture transactional purpose",
    },
  ],
  presentation: Object.fromEntries(
    contactPresentationKeys.map((key) => [key, key]),
  ) as Record<(typeof contactPresentationKeys)[number], string>,
};
