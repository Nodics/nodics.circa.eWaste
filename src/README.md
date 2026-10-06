# Circa Frontend Implementation

This source README preserves the shared renderers' transport, state, recovery and
verification contracts. Start with [the root README](../README.md#ownership) for
setup and canonical backend documentation links. Backend rules described below
are consumed API boundaries, not a second policy authority.

This is storefront contributor guidance. The Circa accelerator's framework product
documentation and imported content belong to the Nodics framework documentation
owner. Do not copy import data, tenant policy or notification delivery authority
into this frontend repository.

## Ownership And Entry Points

Circa renders Web/mobile/Telegram shells over the same owner-authorized journeys.
Profile owns customer authentication and participation; eWaste composes customer
journeys; Waste owns submissions/receipts/assets; Location owns centres and arrival;
Media owns evidence access; Commerce owns orders, coupons, reviews and refunds;
Loyalty owns wallet value; Communication owns notification delivery and inbox state.

Customer-owned purchase history uses GET `/nodics/eWaste/v0/purchases`.
Coupon reveal uses the existing POST `/nodics/eWaste/v0/coupons/:code/reveal`
with explicit confirmation. Order concern history and submission use GET/POST
`/nodics/eWaste/v0/purchases/:code/reviews`. These are fixed composition endpoints,
not browser-selected owner URLs. Current authenticated session accompanies reads
and commands; identifiers select records and never confer access.

## Purchases And Coupons

`PurchaseHistory` projects bounded display fields from owner reads. Malformed,
duplicate or unbounded history fails closed before reveal controls appear.
Owner-supplied purchase timestamps, retained terms and expiry determine display.
Validity is purchase-relative backend policy; the browser does not recalculate
launch-relative validity or extend expiry. Invalid/expired validity cannot reveal
a token. Only ACTIVE, not-yet-redeemed entitlement history can present a reveal
request; the owner rechecks actual eligibility, including claimed coupon policy.

Reveal accepts only a bounded non-empty token in a `REVEALED` owner outcome.
Deferred/acknowledgement outcomes do not expose a token. Tokens stay in component
memory and clear on refresh/session change. REDEEMED history renders recorded
receipt, merchant, timestamp and a canonical Store reference with positive revision
when supplied. No outlet is inferred from an offer name or nearby map location.

Refresh is explicit, on focus/visible resume and every 60 seconds by default.
`refreshIntervalMs` supports 15-300 seconds, with invalid values falling back to
60 seconds. It changes freshness only. Loading/failed refresh retains marked-stale
history but hides reveal controls; it never repeats purchase, claim, redemption,
wallet or refund commands. Context-bound snapshots and request generations prevent
late data from appearing after a session change.

## Cancellation, Refund And Dispute Review

`OrderReview` first fetches authoritative case history. Loading, failed or malformed
history disables confirmation. The customer selects DISPUTE, CANCELLATION or REFUND
and provides a bounded reason before one explicit command with a stable idempotency
key. A concern request does not itself refund a payment or redeem/revoke a coupon.
The recorded case and owner refund evidence are rendered separately.

An unconfirmed write freezes the original request, reason and reference in memory.
The customer must inspect history before **Resume same review request** becomes
available. Resuming sends exactly the original command and idempotency key, not a
new refund request. There is no automatic retry and no inference of success from an
empty history read. If a valid persisted case was acknowledged but history refresh
fails, the UI reports that distinction and requires inspection before another case.
Closing/reopening preserves uncertainty within the mounted session; session/order
changes discard it, abort reads and reject late responses. Browser reload loses
this in-memory recovery reference and requires owner/operator reconciliation;
do not promise crash-proof automatic recovery.

## eWaste Consistency

Location browsing/directions never prove arrival. The owner checks fresh reported
coordinates against the configured centre radius. Photo preparation and analysis
do not imply submission; customer final confirmation remains explicit. Saved drafts
survive navigation, and the shared item workspace presents owner-projected reviewed
facts, public feedback and calculation provenance. Neither prospective environmental
impact nor illustrative carbon metrics imply issued credits, wallet rewards or
completed physical diversion. Staff review, collection-centre affiliation and
merchant/operator authority remain Axis/backend workflows, not customer toggles.

## Safe Customization

Change published shell/content/theme presentation through existing WCMS/configuration
paths. Frontend-only changes belong in shared renderers so Web/mobile/Telegram do
not fork business rules. `PurchaseHistory` may change heading level and bounded
refresh interval. Offer names/images come from owner catalogue data; they do not
define executable coupon benefits. Extend DTO presentation only after the matching
owner contract exists, retaining strict projection and explicit confirmation.

Do not create browser-owned enterprise/store/centre associations, coupon stock,
single-use guarantees, credential links, benefit pricing, refund/settlement terms,
notification recipients or sender policy. Unspecified sample staff/emails/allocations
and reward/sale/refund/mail inputs remain gated; no fictional business records or
runtime activation is provided by this batch.

## Verification Boundary

`src/PurchaseHistory.test.tsx` and `src/OrderReview.test.tsx` contain isolated authored
fixtures for stale/expired/malformed history, token outcomes, authoritative refresh,
session isolation and uncertain same-input replay. Isolated automated execution
passed in the joint validation batch. `npm run typecheck` validates TypeScript only;
`npm run verify` also executes behavioral suites and builds. Visual acceptance must cover
desktop/mobile/Telegram shell integration, empty/denied states, expiry, focus refresh,
loading, slow responses, session change, command conflict and uncertain recovery.
Connected refund/replay and native Telegram acceptance remain separate evidence.

# Customer Consent And Registration Boundary

`CustomerAuthentication` calls the existing Circa registration adapter, which
forwards only name/email/password to Profile `/customer/registrations`.
Only the owner's explicit `{registered:true}` confirms account creation.
An interrupted or malformed registration switches this mounted form to sign-in
only; it never retries a registration or claims that an account was created.
Credentials remain cleared after submission. Late results after unmount do not
authenticate or link a host session. Authentication is not consent acceptance.

Profile `/customer/participation/workspace`, `/accept`, `/renew` and `/withdraw`
currently require a human PASSWORD Employee canonical actor. Circa customer
credentials cannot be substituted for this proof, and no frontend permission,
invented terms or eligibility ALLOW fallback is supplied.

The shared authentication form now offers a separate **Use employee account**
path. `EmployeeCustomerParticipation` requires freshly entered Employee credentials
through the fixed Profile `/employee/browser/authenticate` owner. It never copies
the ordinary Customer form's credentials or stores Employee proof in Circa session
storage, customer memory or a channel link. Profile-issued Employee access remains
private component memory. The same child is composed by Web/mobile/Telegram hosts.

The typed client validates version 1, owner Profile, the current fixed `default`
enterprise, exact plain-text terms, bounded digest/version and owner presentation.
The checkbox starts unchecked. Acceptance/renewal and withdrawal each require an
explicit second confirmation. Confirmed writes clear actionable terms and require
explicit inspection. A switch additionally requires fresh COMPLETE state with
the owner's explicit `participation.currentTerms === true` and
`participation.canSwitch === true`. Returning participants can therefore inspect
and review switching without renewing already-current consent. Missing/non-boolean
or contradictory flags fail closed; COMPLETE alone is not current-terms evidence.
WITHDRAWN or unqualified lifecycle transitions stay disabled; policy enforcement
and eligibility remain Profile-owned. Errors never restore stale actionable state.

The canonical `/nodics/profile/v0/employee/browser/customer-participation/switch` POST accepts only the
reviewed participation `revision`. Profile requires matching Employee access
and refresh proof, validates exact origin and Employee CSRF, and returns
`authToken`, `loginId`, `enterpriseCode` in its `SUC_PRFL_00000` data envelope.
It clears Employee cookies and writes distinct Customer cookies; uncertainty
clears both namespaces. The transport sends Employee bearer plus the Employee CSRF
companion for this fixed route, never the Customer companion. The non-secret
`VITE_EMPLOYEE_CSRF_COOKIE_NAME` may match a qualified owner's cookie configuration
(default `nodics_axis_csrf`). The HttpOnly refresh proof remains browser/server
owned; it is never copied to a header, URL or request body.

Switching is independently reviewed and one-shot. Circa discards Employee access
and old Customer memory before requesting issuance. Only the confirmed returned
Customer access/login ID reaches the host's existing `onLogin` continuation.
Telegram performs its existing signed host link/entry there, with Customer proof
only; no Employee groups are merged. If host continuation fails after issuance,
the returned Customer proof remains in component memory and an explicit Continue
repeats only the host callback, never the issuance command. An uncertain issuance
discards Employee proof and requires normal explicit sign-in, without automatic
switch/restore. Cancel uses the corresponding fixed browser-session logout owner.
Unloading discards component proof; server cookie lifetime remains owner-governed.

Deployment remains gated. Profile scopes the Employee refresh cookie to
`/nodics/profile/v0/employee/browser`; the canonical switch now lives within
that path without widening the HttpOnly cookie scope. There is no request to the
retired Customer-browser switch path and no fallback retry. Both browser-session owners must admit the actual
Circa origin and be independently qualified. Participation/eligibility and the
switch API remain default-off. The current owner workspace publishes both
current-terms and switch-admission flags; these are read-only owner evidence, not
a frontend eligibility decision. Already-current consent disables acceptance/
renewal while an admitted switch remains independently reviewed. A false
`canSwitch` never falls back to a local receipt, credential or COMPLETE phase.
The existing participation presentation also does not publish Employee-entry or
switch-specific captions; these remain storefront presentation, not policy.

Profile now publishes committed-consent stamp inspection/repair at
`/enterprise-administration/:enterpriseCode/consent/stamps/repair` for qualified
target/platform operators, not Circa customers. Axis consumes it as a separate
operator task with explicit inspection, review and original-command recovery.
Circa does not reconstruct private stamp keys, replay grant/revoke commands,
repair private records or equate a persisted consent row with completed repair.
Fenced-target recovery uses the existing authorized Axis enterprise workspace's
`task=stamp-repair` subview and exact target selector; it never loads the ordinary
hierarchy workspace first. Its title comes from native navigation, with generic
neutral inspection icon before reading the repair-specific configured projection.
All thirteen mandatory repair presentation labels then come from that same GET;
malformed or missing copy cannot unlock controls.
Circa customers cannot use this operator view. Isolated fixtures passed; installed operator acceptance remains separate.

`employeeParticipationClient.test.ts`, `EmployeeCustomerParticipation.test.tsx`
and `participationTransport.test.ts` author exact-body/receipt, explicit review,
uncertain issuance, Customer-only continuation and CSRF-namespace fixtures.
Isolated fixtures passed. Connected cookie scoping, fresh PASSWORD/origin checks,
logout, reload recovery and native Telegram host acceptance are joint-session gates.

## Contact Proof And Notification Preferences

The five fixed Profile POST routes `/customer/contacts/verification/inspect`,
`begin`, `verify`, `consent` and `suppression` exist behind default-off exposure
and independent owner qualification. Inspection selects `{ownerId,channel}`;
begin adds `expectedRevision`; verify adds `expectedRevision,commandId,secret`;
consent adds `expectedRevision,purpose,purposeVersion,granted,operationReference`; suppression
adds `expectedRevision,purpose,suppressed`. Proof/destination are not returned.
Account email, buyer identity, prior delivered messages and participation consent
are not verified contact evidence or transactional-notification consent.

The fixed GET `/nodics/profile/v0/customer/contacts/verification/workspace`
now publishes exact version 1 `PROFILE_VERIFIED_CONTACT_WORKSPACE` metadata:
`contractVersion,kind,ownerId,channels,purposes,presentation`. Profile derives the
canonical Customer projection from signed Customer proof. Circa does not infer
`ownerId` from account code/login ID, decode identity selectors from JWTs or accept
arbitrary owner IDs/addresses. The ID stays private transport state and is not
shown in the page or review. Channels are unique EMAIL/SMS choices; each purpose
publishes unique code, positive version, admitted channels and a bounded label.
Malformed, extra, missing or contradictory metadata fails closed.

`features/contact/ContactPreferences.tsx` is the shared account task for Web,
mobile and Telegram. The **Contact preferences** destination uses the existing
account section navigation (`/account/preferences` or mobile `account=preferences`).
`VITE_CIRCA_CONTACT_PREFERENCES_ENABLED` must be exactly `true` to expose it;
unset/false hides navigation and refuses direct section selection and client
requests. This project presentation switch defaults off and grants no permission,
owner qualification, delivery configuration or verified evidence. No deployment
value is enabled by this source batch.

When explicitly enabled, entering the task reads metadata only. The customer
selects a published channel and explicitly inspects content-free progress before
any command is available. NOT_STARTED at revision zero can begin a challenge;
ISSUED admits entry/review of the bounded transient code; VERIFIED is owner proof,
not consent. Held/pending checkpoints remain inspection-only. Begin/verify each
require a second explicit confirmation. The reviewed command freezes the owner,
channel, revision and command ID. The entered secret is cleared from the input
when preparing review, is never rendered in summaries, and is discarded on
cancel, outcome, context change and unmount. The owner consumes proof internally.
Begin/verify outcomes display returned progress status, not a preference-saved
message or an inferred verified claim; an ISSUED/false result remains unverified.

Notification consent and suppression are independent, initially unchecked form
choices, not switches claiming to reflect saved preferences. Select one published
purpose; review displays its label/version and exact intended boolean. Granting
requires inspected verified state and a fresh operation reference; the owner
rechecks suppression and actual proof. Clearing suppression does not grant consent.
Consent/suppression receipts must match purpose, boolean and next Contact revision;
consent receipts must additionally match the frozen `purposeVersion`.
The consent POST pins both Contact revision and the exact reviewed published
`purposeVersion`. The client freezes that version from the workspace purpose,
displays the frozen command version in review and sends it without refreshing or
substituting a newer policy. Profile must reject a fresh policy-version mismatch;
uncertainty still requires inspection and a new explicit review, never automatic retry.

All mutation outcomes discard actionable progress. An unknown result displays
the configured uncertain message, clears the code/review and offers explicit
inspection, not automatic begin/verify/consent/suppression replay. Reload loses
transient state and never repeats a delivery or proof consume. Metadata refresh
checks self/channel selections anew; identity/channel/session changes invalidate
old progress and late outcomes. Inspection may observe held delivery checkpoints
through the fixed owner operation; no receipt-repair mutation is invented.

Exactly twenty required plain-text labels are supplied by
`profileVerifiedContacts.presentation`: `title`, `inspectLabel`, `emptyMessage`,
`workingLabel`, `reviewTitle`, `confirmLabel`, `cancelLabel`, `uncertainMessage`,
`unavailableMessage`, `recordedMessage`, `channelLabel`, `purposeLabel`, `ownerLabel`,
`verificationCodeLabel`, `beginLabel`, `verifyLabel`, `consentLabel`,
`suppressionLabel`, `grantedLabel`, `suppressedLabel`. The title is bounded to
160 characters, other text and purpose labels to 500. Later Profile layers own
these labels and `profileVerifiedContacts.purposeLabels`; the frontend escapes
them as text and accepts no HTML, authority keys or executable URLs. Before
metadata is available only neutral transport/loading/inspection presentation is
used. Framework product documentation remains outside this frontend repository.

Source gates remain the default-off API exposure, Contact/CAS/privacy/transport/
delivery qualifications, approved maximum verification age, permissions, actual
stored contacts, Communication delivery and approved purpose policy. No address,
recipient, sample record, consent or sender is invented or activated here.
`contactClient.test.ts`, `ContactPreferences.test.tsx` and
`contactNavigation.test.ts` author metadata/proof
projection, default-off, exact command/receipt, explicit review, transient secrecy
and uncertain one-shot fixtures. Isolated fixtures passed; connected delivery, code
expiry, actual Customer scope, suppression, cross-channel and mobile acceptance
remain joint-session gates.
