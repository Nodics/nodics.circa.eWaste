# Customer Contact Preferences

Circa composes Profile's fixed private Customer self workspace and five fixed
commands. Profile derives `ownerId`, selects stored contacts and owns canonical
identity, verification evidence, CAS, eligibility, notification purpose policy,
suppression and consent. Communication owns challenge issuance, delivery and proof
consume. Circa neither creates contacts nor treats login email as verified evidence.

The shared account destination works through Web `/account/preferences` and the
mobile/Telegram `account=preferences` selector. Set project presentation environment
`VITE_CIRCA_CONTACT_PREFERENCES_ENABLED=true` only for an approved deployment.
It is false when unset and never enables backend flags. Disabled navigation,
deep-link selection and typed clients send no contact request. Backend qualification,
API exposure, permission, maximum age and real delivery remain independent gates.

`contactClient.ts` validates the owner's exact six-field workspace, twenty
allowlisted plain-text captions, unique admitted channels/purposes and bounded
versions/labels. `ContactPreferences.tsx` renders only those owner choices and
caption values; before metadata arrives it uses neutral browser fallbacks. The
opaque owner ID stays in transport state and is not rendered, entered or decoded.
No address input, destination preview or arbitrary endpoint is supplied.

Select a channel and inspect before reviewing any write. Review freezes the
original owner/channel/revision/command ID. Verification code exists only in
input/review command memory and never in review text, logs, URLs or storage.
Every mutation is one-shot: confirmed or unknown outcomes clear actionable progress
and require fresh inspection. No timeout, reload or focus action retries a writer.
Held issue/verify/consume states stay inspect-only; no repair endpoint is invented.
Token/channel/context changes reject late results and discard transient choices.

Consent and suppression are separate initially unchecked command choices, not
readbacks of existing preferences. The backend rechecks actual verification and
suppression before granting consent; clearing suppression grants nothing. The
consent command pins Contact revision and the reviewed workspace `purposeVersion`.
The review shows the frozen command version; Profile rejects a mismatched fresh
purpose version. The client never replaces it with a newly fetched version while
confirming or automatically retries a stale consent command.

Customization belongs in later Profile `profileVerifiedContacts.presentation`
and `purposeLabels` configuration, retaining published keys, purpose owner and
plain text bounds. Change layout in this shared renderer rather than splitting
Web/mobile policy. Do not add frontend permission/role rules, default ALLOW,
Customer-to-Employee credential reuse or arbitrary owner selectors.

Run the fixtures in `contactClient.test.ts`, `ContactPreferences.test.tsx` and
`contactNavigation.test.ts` from this frontend repository. Historical results do
not establish current acceptance; `npm run typecheck` is static only. Connected delivery, expiry,
actual-self denial, held-state recovery, suppression and responsive/native Telegram
acceptance require the joint session. See the broader
[frontend implementation README](../../README.md#contact-proof-and-notification-preferences).
