# Circa Frontend Implementation

This source README preserves the shared renderers' transport, state, recovery and
verification contracts. Start with [the root README](../README.md#ownership) for
setup and canonical backend documentation links. Backend rules described below
are consumed API boundaries, not a second policy authority.

This is storefront contributor guidance. The Circa accelerator's framework product
documentation and imported content belong to the Nodics framework documentation
owner. Do not copy import data, tenant policy or notification delivery authority
into this frontend repository.

Shared `request()` forwards an own string `body.idempotencyKey` unchanged as
`Idempotency-Key` for non-GET/non-HEAD requests. It never generates a key, coerces
non-string values, changes the body or replaces a retry's command identity.
Empty, non-ASCII/control-containing and edge-whitespace strings are rejected
before dispatch rather than silently normalized by HTTP header transport.
Domain key format/length and replay semantics remain backend-owned.
`api.idempotency.test.ts` covers exact forwarding, retries and read omission.

## Shared Purchase And Certificate Selection

Catalogue cards, quick view and product summaries display the backend's declared
coupon acquisition requirements. Certificate-only offers show their certificate
requirement instead of a misleading zero-point price; combined offers show both
points and certificates. This presentation never changes eligibility, price or
certificate consumption, which remain with Commerce and Waste owners.

Purchase history prefers Digital's `productName` projected from the immutable
purchase promise. It does not fetch today's catalogue or rewrite original rights.
The original Product reference remains secondary; absent retained names use a
generic heading. Merchant codes remain explicitly labelled references.
`PurchaseHistory.test.tsx` protects retained-name precedence, reference visibility
and owner-only history requests. Certificate category codes are formatted as
readable labels; carbon rows use a short distinguishing reference with the full
audit identity in expandable details. These are presentation only: command codes,
eligibility, balances and synthetic markers stay unchanged.

### Pending Reference Helper

`pendingReferences.ts` owns only tab-local recovery hints. API:
`pendingReferenceKey(session,capability,owner?,scope?)`,
`readPendingReference<T>(key,validate): T|null`,
`savePendingReference<T>(key,value,validate): void`, and
`clearPendingReference<T>(key,expected,validate): void`.
The caller validator is `(value:unknown)=>value is T`; owner is
`{ownerType,ownerCode}` and scope is an optional string. Keys partition actor,
represented namespace, canonical owner when known, capability and optional offer,
not tokens or mutable revisions. Reads/saves/clears throw on storage or schema
failure. Save rejects a different unresolved value; clear compares the original
expected value so a late reply cannot clear a newer command. Save must complete
before dispatch. The helper never decides completion, permission or balance.
Callers allowlist minimal original hints; bounded original quote input may contain
IDs, source amount and original key, never credentials, external account mappings,
ledger, balance or exchange-rate snapshots. Backend owners reauthorize and retain
the authoritative instruction and receipts. Missing outcomes do not authorize
replacement commands. Tab closure/cleared storage is not cross-device recovery.

BundleComposer retains only the original manifest key; Digital's immutable
manifest retains the reviewed follow-on instruction. Exact command query is
read-only; explicit resume loads original owner data. BundleGifts retains only
an operation code and reads `/digitalCore/v0/gifts/inspect`, independently of
list pagination. Only a server-retained resumable decision may be continued;
an undecided/absent result cannot invent a replacement decision. RewardTransfer
retains only the original transfer key after canonical wallet-owner resolution,
then uses Loyalty's existing exact GET status route after remount/refresh/reload.
No restored flow automatically repeats a debit or gift. Matching terminal owner
evidence clears each hint; resolved history does not disable legitimate new work.

`TransactionPage` uses `CommercePurchase` for fixed-price purchases by Customer
and Enterprise owners. It consumes the published offer's `commerce` binding;
missing store, currency, locale, jurisdiction, variant or required reward-program
references disable purchase rather than inventing project defaults. The original
session is forwarded unchanged. The backend resolves the merchant Store separately
from the purchasing owner and employee actor.

Review creates a one-entry Cart and displays its returned calculation. Exact
decimal strings are retained; the UI does not subtract floating-point balances or
settle value. Confirmation calls the existing Checkout once with the reviewed Cart
revision, calculation, order and idempotency references. An uncertain response
offers read-only inspection of the original command and completed Order. Only a
server-qualified recovery action with the exact reviewed Cart/Order binding offers
explicit continuation of the original purchase. Continuation sends confirmation
only, never another payment or replacement placement; an uncertain continuation
requires another status read. A pending request blocks native Back; a closed uncertain
review can be reopened. Session/offer changes invalidate late responses.

Before placement, the browser retains only the original command, Cart and Order
references in tab-scoped session storage, partitioned by acting login, owner kind,
Enterprise and offer. Reload, token refresh and offer revisions restore a pending
status view instead of creating a replacement purchase. No token, balance or
certificate selection is retained. Storage failure blocks dispatch. Retained
references never grant access: Checkout revalidates the current actor and exact
Cart/Order binding. Only an authoritative completed receipt clears the reference;
absence or an uncertain outcome does not permit a new purchase.

After an original checkout command returns scope-qualified `COMPENSATED` with
matching order/cart identities, the customer may explicitly select **Start a new
purchase**. This retires only that exact saved reference and resets the draft/key;
it does not place, refund or resume a purchase. The retired reference remains in
the visible Previous purchase attempts section for the current mounted journey
(not a replacement for backend audit history). Unknown, foreign and
`COMPENSATION_REQUIRED` outcomes cannot unlock this action. A fresh status check
revokes earlier eligibility while pending; obsolete-session replies are ignored.

Certificate-only coupons omit Wallet and Payment fields. Combined purchases send
both the reward payment and `couponSelections[entryCode][unitIndex]`. The shared
purchase control requires an explicit owner-projected coupon consideration type;
missing requirements never default to a rewards-only purchase. The shared
`CertificatePicker` reads Digital's owner-scoped paginated certificate projection;
unavailable/consumed holdings cannot be newly selected; an already selected item
can still be removed if it becomes unavailable. Selection is not a reservation or
ownership claim: Digital and Waste validate and reserve on confirmed acquisition.
The same picker is reused by bundle authoring. Auction listings use `AuctionJourney`
and `BidComposer`, not a parallel fixed-price button.

`AuctionJourney` consumes the selected callback or rereads direct-link
`auctionRound`/`storeCode` selectors under the current session. `AuctionPurchase`
revalidates Bidding's exact selected buyer DTO, inspects the existing one-entry
Cart/private quote and calculates its review using the retained revision. It does
not create/edit a Cart, ask for Wallet selectors or recheck a protected hold as
new available balance. Account `BidHistory` mounts the same purchase component
directly, even when the listing no longer appears in the public catalogue.

The stable original key is `auction-purchase:<orderCode>`; an Order reference in
the selected DTO is not a completed Order. Command status is read before review.
Uncertain placement offers status only; only qualified exact Cart/Order status
with `RESUME_ORIGINAL_PLACEMENT` enables confirmed original-command recovery.
An uncertain recovery requires another status read. Completion requires matching
`code`, `orderCode` and `cartCode`, not a first matching alias. Uncertain cancellation keeps
the original cancellation key and blocks competing purchase. Existing owner
`GET /checkouts/:orderCode` returns READY, CANCELLATION_PENDING or CANCELLED and
the retained cancellation key, or the original placement key/status. This closes
the unstarted cancellation gap in placement-key status lookup. Before dispatch,
the browser stores only cancellation Cart/Order/key hints in sessionStorage,
partitioned by acting login, owner kind, Enterprise and round. The consumer retains
the existing auction namespace and domain validator while using `pendingReferences`
for validated reads, verified saves and expected-reference-only clearing; a late
reply cannot delete a changed hint. No shared business payload schema is imposed.
Reload retains the original retry even before the request reaches the owner journal. Missing storage
never replaces a server-retained key; failed storage blocks dispatch. Hints cannot
authorize a release or override the current owner's status. Expired unstarted
intake remains cancellable. Session/Enterprise/offer changes discard private state
and late results; tokens and financial evidence are not persisted in the browser.
`AuctionPurchase.test.tsx` and `BidsPanel.test.tsx` cover these source contracts,
including malformed history refusal, lost acknowledgements and selected history
without a public offer. No deployed payment or browser acceptance is inferred.

`CataloguePurchase.test.tsx`, `CertificatePicker.test.tsx` and mobile catalogue
fixtures exercise these request and state contracts. They are isolated UI tests,
not actual payment, persistence, device or installed-runtime acceptance.

## Enterprise Sessions And Account

Enterprise sign-in, cookie restore and accepted membership switching confirm the
original Employee bearer through Profile's existing `/identity/scopes/me` self-read.
Its `enterprise: { code, displayName }` must match the selected signed Enterprise;
missing or foreign projection evidence refuses session admission. `displayName`
comes only from canonical Profile Enterprise data. Profile validates its configured
name bound; browser admission checks nonempty/control-free display shape without
a copied name maximum. A null name displays
**Enterprise account**, with the exact reference retained separately in the account
heading and header accessible name/tooltip. Private native codes are never
humanized into business names. Name evidence stays in memory and refreshes on
restore/switch; only the existing code hint goes into session storage. No generic
`/enterprise/get`, directory grants, browser JWT decoding or Customer conversion
is needed. Profile owns current identity, membership and placement validation;
Circa owns presentation only. `api.enterpriseSession`, `EnterpriseAccount` and
`CircaApp` focused tests cover canonical/null names and fresh context replacement.
Native browser acceptance requires main's coordinated source adoption; unit checks
do not establish installed runtime behavior.

Customer and Enterprise account navigation includes `Create bundle` at
`/account/bundles`; Customer mobile uses the same account renderer with
`account=bundles`. `features/bundles/BundleCompositionPage` reads Digital's actual
composition-context endpoint, retains Profile-derived ownership, and requires an
explicit governed destination for fixed/auction listings. Gift remains selectable
when listing dependencies are disabled/unavailable. No customer eWaste account
read is used for this shared view. See [composer implementation](features/bundles/README.md)
for exact owner calls, stale-session isolation and original-command recovery.
The Enterprise wallet also mounts the shared `PartnerRewardConversion` beside
`RewardTransfer`, retaining the original Employee token and represented Enterprise.

`PartnerRewardConversion` consumes LoyaltyAPI's owner-scoped verified account
choices and quote/confirm/status operations. It does not calculate rates, verify
external accounts or credit a partner wallet. Confirmation sends only the retained
conversion reference. Unknown outcomes reconcile that same reference; a manual
reference lookup also works when new routes are disabled. The component rejects
foreign owner projections, changed quote terms and late previous-session reads.
No configured provider or verified link means no selectable route. Framework
policy defaults stay in Loyalty; real account linking and provider qualification
remain integration responsibilities, not browser-created evidence.

Conversion reload recovery uses the shared `pendingReferences` helper with three
immutable, actor/typed-owner-scoped session-storage entries: the exact original
quote selectors/amount/idempotency key, the conversion code, and a confirmation
attempt marker. The quote command is saved before quoting; the code and marker
are saved before confirming. No bearer, external account locator, provider
evidence, quoted rate or balance is stored. A lost quote response retries only
its original command/key. A known code restores through owner `status`, including
when new conversion choices are disabled. Restoring, uncertain and malformed
hints never open a fresh-conversion form; unavailable storage prevents dispatch.

Authoritative HOLDING, HELD, SUBMITTED, CREDIT_CONFIRMED and NO_CREDIT_CONFIRMED
remain recovery-only even when found by manual reference. Closing the dialog
only hides it, preserving the attempt. Only COMPLETED, REJECTED or EXPIRED clears
an attempted conversion's exact hints. An unconfirmed QUOTED review can be closed
without a backend mutation. If status returns QUOTED after an uncertain confirm,
the attempted marker remains: the user may explicitly confirm that same original
code again, never automatically or as a new conversion. Expected-value clears
prevent late replies from removing a different operation.

`PartnerRewardConversion.test.tsx` covers reload/token refresh, lost quote and
confirm responses, manual pending-state recovery, storage failure/corruption,
actor/owner isolation and explicit original-code retry. These are isolated UI
units, not browser/E2E or provider acceptance. Session-storage loss, a new tab or
another device still requires the original reference; the backend has no complete
participant conversion-history projection. This change does not impose a backend
commercial concurrency rule or infer pending absence from bounded wallet history.

`api.ts` owns the shared transport and in-memory session. `EnterpriseSession` is
`{kind:"ENTERPRISE", token, loginId, enterpriseCode}`: `token` remains Profile's
Employee access token, not a Customer token or a fabricated service identity.
The older `kind:"EMPLOYEE"` is transient proof for personal participation and
cannot be saved as an admitted Circa session. Existing Customer session callers
remain supported without a kind discriminator.

`EnterpriseAuthentication` uses Profile's existing Employee browser PASSWORD
contract, matching Axis's `employeeAuthClient.ts` without importing a sibling
application. Exact calls are POST `/nodics/profile/v0/employee/browser/authenticate`
with `{loginId,password}`, POST `/restore` with `{}`, POST `/logout` with `{}`,
and POST `/switch-enterprise` with `{assignmentCode,revision}` under that same
browser prefix. The `x-enterprise-code` header is the current context, including
on switching, never the proposed target. Browser requests use same-origin
credentials, no-store caching, redirect rejection, and the Employee CSRF companion
(`VITE_EMPLOYEE_CSRF_COOKIE_NAME`, existing default `nodics_axis_csrf`). Restore,
logout and switching require that companion; Customer CSRF is never substituted.
HttpOnly refresh cookies are read/rotated/revoked only by Profile/browser transport.

Before admitting an issued token, the client reads
`GET /nodics/profile/v0/identity/scopes/me` with that exact bearer and context.
It requires a human principal, matching issued login identity when present, and
the owner scope projection. It never decodes JWT claims, derives role grants,
or treats an empty or populated scope list as business eligibility. The domain
owner still checks each command and current allow/deny scope. Profile current
scope read exposure is consequently an admission dependency, not an optional
browser fallback. Passwords clear immediately; access tokens remain memory-only.
The only persisted Enterprise session value is a non-secret sessionStorage
Enterprise-code hint (`circa.enterprise-session`). This hint routes cookie restore;
it is not proof of identity or membership. Legacy `circa.session` is discarded.

`EnterpriseSessionControls` reads
`GET /nodics/profile/v0/enterprise-memberships/workspace`. It renders only
Profile-projected REGISTERED/accepted SWITCH choices. After explicit review,
the helper clears old admission, rereads the workspace and requires the same
assignment code/revision/target before issuing one switch. The response must
name the reviewed target and pass a new human scope read without changing actor.
Stale generations, contradictory proof and uncertain acknowledgements require
sign-in again; no automatic switch retry or old-owner fallback is performed.
Logout clears local admission even if server revocation cannot be confirmed,
and reports that uncertainty. Personal/mobile/channel hosts do not restore an
Enterprise session unless they explicitly opt in; only the website opts in here.

`EnterpriseAccount({session,path,onSwitch})` keys its children by token, Enterprise
and path, aborting old requests and dropping owner data/selections on transitions.
The website routes `/account` to session controls, `/wallet` and `/account/wallet`
to Enterprise wallet, `/account/entitlements` to Digital history, `/account/bids`
to Bidding history, `/account/gifts` to `BundleGifts` with
`{module:"profile",schema:"enterprise",code:session.enterpriseCode}`, and
`/account/carbon` to `CarbonHoldings`. Wallet uses only
`GET /nodics/loyaltyApi/v0/participant/wallet`, verifies the returned Enterprise
owner and wallet binding, preserves exact program/type/decimal evidence and
mounts `RewardTransfer({session})` only for an existing wallet. Explicit refresh
rereads balances; the browser never provisions a wallet or manufactures zeroes.

`PurchaseHistory` is shared by Customer and Enterprise accounts and reads canonical
`GET /nodics/order/v0/orders?limit=100` plus
`GET /nodics/digitalCore/v0/entitlements`. `/account/purchases` also resolves to the
Enterprise entitlement view. Enterprise entitlement `ownerRef` must be
`{type:"ENTERPRISE",code:session.enterpriseCode}`; orders must carry matching
`evidence.ownerRef:{module:"profile",schema:"enterprise",code}`. An entitlement's
`enterpriseCode` is the merchant namespace, never proof of its buyer. Digital's
owner list/reveal resolves the retained buyer across those merchant namespaces.
Missing, foreign or Customer owner evidence fails closed, without personal fallback.

Explicit coupon reveal calls only
`POST /nodics/digitalCore/v0/entitlements/:code/reveal` with `{confirmed:true}` and
the unchanged Employee bearer/signed Enterprise. A confirmed REVEALED token remains
component-local; refresh, session change and late-response invalidation clear it.
Non-coupon entitlements never offer coupon reveal. Merchant claim/redemption and
customer-only order reviews are not mounted for Enterprise. Personal order reviews
retain their existing component and customer authority. This increment supplies
plain coupon-code display, not a newly invented QR payload or merchant protocol.

Bidding account history uses `GET /nodics/bidding/v0/bids` and renders the
server-authorized participant projection. Denied, malformed or mismatched reads
show unavailability, not an empty-success fallback. Checkout is separately owned
by the shared Commerce purchase component. Personal inbox and the submission
assistant are not mounted for Enterprise.
Transport additionally refuses Enterprise credentials on customer-only eWaste,
Profile Customer/personal-participation and Customer inbox routes. Public browsing
can still use unauthenticated public projections.

Source handoff and remaining boundaries:

- Digital's current `listContext` and router admit Employee reads with fresh
  Profile Enterprise scope. This renderer consumes that implementation; it does
  not need a new endpoint or an alternate owner parameter.
- Negotiated Bidding's current `participantQuery` includes human sellerRefs but
  only includes buyerId for Customer actors. Human Enterprise buyer history
  requires backend ownership work; the browser cannot fill missing records.
  Timed auction listing requires an actual storeCode; no all-store discovery
  contract or business store selection is invented here.
- Profile browser origins/cookie settings, membership exposure and current-scope
  read, plus each domain permission/scope and backend connection, must be qualified
  by their existing framework owners. All reusable defaults/validation remain in
  implementing framework `config/properties.js`; selections remain governed
  records. No business default, grant, seed, shared schema or API addition is
  required from this frontend increment, and none was made.
- Existing Personal `EmployeeCustomerParticipation` keeps its separate terms,
  consent and Employee-to-Customer switch contract. Enterprise sign-in never
  calls it. Mobile/Telegram remain personal-only entry surfaces in this increment.
- Installed cookie behavior, deployment exposure, end-to-end grants and responsive
  browser appearance remain unverified until the deferred live acceptance phase.

Focused tests: `api.enterpriseSession.test.ts`, `EnterpriseAuthentication.test.tsx`,
`EnterpriseAccount.test.tsx`, `CircaApp.enterpriseSession.test.tsx`. They exercise
the real shared transport against isolated fetch fixtures, current/target header
separation, no persisted tokens, CSRF isolation, stale restore/switch rejection,
review, owner DTOs, routing, personal isolation and logout. Run `npm test` and
`npx tsc --noEmit --incremental false` for source-only checks; do not infer live
acceptance from these tests.

## Carbon Holdings And Material Entitlements

`CarbonHoldings.tsx` exports `CarbonHoldings({ session: Session })` for the
parent account shell to mount. It contains separate carbon and material sections;
`MaterialEntitlements({ session })` is also exported for a standalone placement
(do not mount it twice alongside CarbonHoldings). Styles are isolated in
`CarbonHoldings.css`. It does not change the wallet, navigation, shared transport
or shared styles.

The fixed read-only POST endpoints are
`/nodics/wasteCarbon/v0/carbon/holdings` and
`/nodics/wasteReward/v0/waste/material-value/allocations`, both on
`wasteServer`, not loyaltyServer or a customer accelerator. The body contains
only `{page}`; current Profile authority determines the customer or represented
Enterprise owner. The existing `request` function supplies signed session
transport. This renderer does not decode tokens or invent an Enterprise selector.
The shared transport now uses the admitted Enterprise session's current header
and original Employee bearer for the website Enterprise account. Personal
Customer sessions retain their existing default context. This component does not
add a second authentication client.

The current Vite `/nodics` catch-all targets local Waste at 4370. Docker's Waste
host port is 5370. Source presence does not activate wasteCarbon: the parent must
select it in the intended Waste runtime, import existing permission definitions
and assign `carbon.holdings.read` / `waste.materialValue.read`; represented
Enterprise reads additionally need Profile scope access. Registry/payment
adapter qualification is separate from module selection and read availability.
No deployment or grants were changed by this renderer.

Per-lot prospective, realized, unreserved available, reserved and nonspendable
total quantities are displayed exactly as owner DTO strings with their units.
Precision comes from the owner projection, without a frontend policy ceiling.
No cross-lot/unit sum, rounding, circaCarbon reward lookup or impact-to-credit
conversion occurs. Issuance/program, original allocation and acquisition
references remain visible as escaped text. Synthetic records stay labelled;
NOT_CHECKED eligibility never becomes a transferable claim. No retirement,
trade, transfer or certification command is exposed.

Incoming carbon acquisitions may be realized but reserved for bundle completion.
The owner supplies TRANSFERRED/HELD until original-operation finalize confirms
COMPLETED/RELEASED. The provenance view displays that distinction; it cannot
finalize a bundle or derive available quantity from acquired quantity.

Material attribution remains separate: original contributor, monetary attributed
value and entitlement, configured reward calculation, confirmed-payment state
and matched credit evidence are displayed without creating a spendable balance.
CREDIT_PENDING is reconciliation uncertainty, not a new-credit button. Loyalty
alone owns the resulting wallet entry and spendable balance. The client rejects
malformed amounts, contradictory credit/payment flags, missing provenance and
duplicate lot/batch identities rather than supplying zeroes or inferring success.

Each section has independent empty/loading/error/retry and server pagination.
Customer sessions admit only Customer projections; Enterprise projections must
match the represented Enterprise. Session keys include owner kind and Enterprise
context even when the actor and token are unchanged. These display checks do not
replace backend authorization.
Session changes immediately discard old owner data and abort obsolete requests;
late responses cannot restore it. `CarbonHoldings.test.tsx` uses isolated owner
DTOs and covers these boundaries. Run the focused Vitest tests and TypeScript
without emission; no browser, server or end-to-end execution is required for this
unit stage. Visual layout and installed API acceptance remain unverified.

## Ownership And Entry Points

Circa renders Web/mobile/Telegram shells over the same owner-authorized journeys.
Profile owns customer authentication and participation; eWaste composes customer
journeys; Waste owns submissions/receipts/assets; Location owns centres and arrival;
Media owns evidence access; Commerce owns orders, coupons, reviews and refunds;
Loyalty owns wallet value; Communication owns notification delivery and inbox state.

Purchase history uses GET `/nodics/order/v0/orders?limit=100` and
`/nodics/digitalCore/v0/entitlements`. Coupon reveal uses POST
`/nodics/digitalCore/v0/entitlements/:code/reveal` with explicit confirmation.
Personal order concern history and submission retain GET/POST
`/nodics/eWaste/v0/purchases/:code/reviews`. These are fixed owner endpoints,
not browser-selected owner URLs. Current authenticated session accompanies reads
and commands; identifiers select records and never confer access.
The personal purchases section mounts canonical history independently of eWaste
marketplace discovery. It applies no application order-code prefix and remains
reachable when the public catalogue is unavailable.

## Telegram Configuration Recovery

Mobile notification detail links use the mounted shell's item navigation, not a
document reload or a second Telegram authentication attempt. Keep native launch
parameters, clear competing account/catalogue selectors, and let the Waste owner
authorize the selected item. Ordinary Web links and modified link clicks retain
their normal browser behavior. `OutcomeInbox.test.tsx` and
`mobile/MobileApp.link.test.tsx` cover this boundary; native delivery and linked
detail acceptance require separate client evidence.

Telegram entry consumes Profile's `ERR_PROFILE_TELEGRAM_CONFIGURATION_REQUIRED`
and eWaste's mapped `ERR_EWASTE_CHANNEL_CONFIGURATION_REQUIRED` public error
codes. Configuration refusal shows administrator guidance with no retry control
or session admission. Generic outages, timeouts and invalid proofs keep manual
reconnect recovery; English message text never determines configuration state.
Neither path automatically repeats entry, linking or a business command.

Customize presentation in the existing host shell, not by copying credentials
into the frontend or changing authentication. `channels/TelegramSessionBinding.test.tsx`
exercises the actual shared HTTP error parser and public envelope; backend owner
tests cover the Profile-to-eWaste error mapping. Source tests do not qualify a
native Telegram client or message delivery.

## Mounted Mobile And Telegram Shop

Ownership activity consumes Waste's canonical `transferType`, `assetCode`,
`transferStatus` and `occurredAt` fields. It displays the known asset name or
retained code, recorded status and valid timestamp without inferring completion
or exposing the other customer's identity. Missing status remains unknown.
`AccountSections.test.tsx` covers completed, pending, incomplete and empty history.

`mobile/MobileApp` exposes Shop alongside Home, Centres, Items and Account.
`mobile/MobileCatalogue` composes the shared `CataloguePage`,
`CatalogueProductPage`, `TransactionPage` and `CustomerAuthentication`; it owns
only mounted navigation and sign-in presentation. There is no separate mobile
cart or checkout engine. The current purchase flow reviews one published offer,
refreshes the owner wallet and sends the existing confirmed revision/idempotency
command only after the customer confirms. Commerce/Loyalty retain financial and
permission authority. No payment provider or configuration is enabled.

`/mobile` and `/telegram` use `shop=assets|coupons` and an optional bounded
`product` selector. Listing filters, page and layout survive product/back links;
host launch parameters survive navigation but are never forwarded as catalogue
query selectors. Ordinary links remain usable with keyboard and modified clicks.
In-place navigation keeps the host mounted; account/item destinations clear shop
selectors. A direct product link is public browsing, not authorization or a
Telegram inbound bot intent. Signed channel entry/link still belongs to the
existing host and owner authentication APIs.

Guests sign in through the shared form and return to the same product without
automatically reviewing or purchasing. Telegram Back dismisses filters, quick
view, sign-in or purchase review first; pending purchase review stays open.
Owner-denied reads, invalid/unavailable products, insufficient balance, empty
catalogues and failed reads retain accessible error/retry or return navigation.
Session changes discard purchase display/review and late results. The existing
explicit purchase retry retains its command key while that product/session is
mounted. Leaving the product or reloading loses that in-memory reference; inspect
authoritative account history before attempting another purchase after an unknown
outcome. This does not add durable order reconciliation or promise crash recovery.

`mobile/MobileApp.catalogue.test.tsx` covers mounted Web/Telegram navigation,
sign-in continuation, explicit confirmation, history return, native Back,
permission denial, insufficient balance, read recovery and session isolation
using isolated owner fixtures. `mobile/MobileApp.link.test.tsx` retains submission
reachability across all five tabs. Run these together with the shared catalogue
tests, then `npm run verify`. Isolated tests/builds do not qualify native Telegram
clients, installed owner APIs or proposed inbound/outbound provider flows.

`node test/live/mobile-catalogue-contract.mjs` uses an already-running loopback
Vite server (default `http://127.0.0.1:3600`) for isolated browser acceptance at
320, 390, 768 and 1440 pixels on both mounted entry routes. It intercepts all
owner HTTP, including authentication, with scoped test fixtures; unknown routes
fail closed. The parent read-only guard protects the remaining static requests.
No business request or real authentication reaches a backend. The runner reads
existing public artwork read-only from the Circa backend module's asset files;
it neither imports nor changes permanent demo data. Fixture offers and balances
exist only in the runner and are not module data or payment qualification.
The optional Google font stylesheet is fulfilled empty locally, so screenshots
use the application's system-font fallback without contacting that provider.

Checks include image natural dimensions and nonblank canvas pixels, horizontal
overflow inside the shell and dialogs, taps, detail/back links, filters, quick
view, focus restoration, mocked shared sign-in, owner denial and cancelled
purchase review with zero business writes. Telegram SDK/Back are explicit browser
test doubles, not actual native-client proof. Screenshots and `result.json` go to
ignored `test-results/mobile-catalogue-contract`; `CIRCA_MOBILE_CATALOGUE_EVIDENCE`
may select another output directory. `CIRCA_SITE_URL` accepts loopback HTTP only.
Retained-data E2E, installed providers and actual native acceptance are separate.
This test does not change native/framework arrival-radius policies.
The browser run also covers shared `ReviewDialog` opener restoration. Its layout
cleanup closes the native modal and restores a still-connected opener before
React removes the dialog; `ReviewDialog.test.tsx` retains that regression.

## Purchases And Coupons

`PurchaseHistory` projects bounded display fields from owner reads. Malformed,
duplicate or unbounded history fails closed before reveal controls appear.
Both participant kinds use the canonical Order and Digital APIs, not the eWaste
purchase/reveal adapter or a frontend order-code prefix filter. Enterprise typed
buyer evidence is mandatory and independent of the merchant's storage namespace.
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

`src/PurchaseHistory.test.tsx`, `src/EnterpriseAccount.test.tsx` and `src/OrderReview.test.tsx` contain isolated authored
fixtures for stale/expired/malformed history, token outcomes, authoritative refresh,
session isolation, Enterprise-vs-merchant ownership and uncertain same-input replay. Isolated automated execution
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

## Bounded browser regression follow-up (23 October 2026)

Findings 3, 4 and 6 from the 21 October acceptance record were reproduced in
source. Item ownership and catalogue detail now distinguish contributor rewards
from separately selected realized, available bundle credits. New ownership copy
keys avoid reusing the obsolete attached-carbon transfer wording.

Asset quick/full detail promotes the digital certificate reference, ownership
status, recorded review decision/date, lifecycle events and assessment availability
above the detail tabs. These are the existing owner projection, not an inferred
certificate-validity or completed-recycling decision. Full detail links to the
assessment evidence; source submission and review history remain in their tabs.
Complete custody/recycling milestones are not supplied by this item-detail API.

`WalletHistory` provides Previous/Next navigation in personal and Enterprise
wallets, ten returned rows per display page. This is only a presentation chunk;
backend limits/defaults remain in Loyalty. A new snapshot resets the display page.
Both wallet APIs return bounded entries without total/cursor/continuation, so the
UI explicitly says older transactions may be omitted. Full ledger continuation
requires a Loyalty-owned API contract and is not closed by this frontend change.

Focused DOM tests cover evidence visibility, reward copy, paging boundaries,
empty snapshots and refresh reset. On 23 October, `npm run verify` passed
typecheck, 520 tests across 60 files and production build (chunk-size warning).
Browser verification is blocked by the user's Work settings; do not bypass them.
Live acceptance still needs desktop/mobile quick/full certificate views, published
copy, assessment navigation and wallets with more than ten returned transactions.
