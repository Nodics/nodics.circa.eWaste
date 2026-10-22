# Bundle Composer

`BundleComposer.tsx` is the shared Customer/represented-Enterprise bundle task.
It uses the existing participant transport, shared `CertificatePicker`,
`ParticipantSearch` and native `ReviewDialog`. `BundleCompositionPage` mounts it
in both account types. It does not own session admission, purchases, reward
ledgers, Product publication or availability.

## Mount Contract

Export: `BundleComposer({session, ownerRef, listingContext?, destinationName?, onComplete?, onLockedChange?})`.
The connected account entry is `BundleCompositionPage({session,onComplete?})`.

- `ownerRef` is the canonical Profile owner returned by an authorized owner read,
  not an editable selector or an Employee login ID. An Enterprise session must
  match the represented Enterprise. The original token remains in the shared
  transport; the composer does not decode or replace it.
- `listingContext` pins `listingContextRef:{code,revision}` and explicit governed `storeCode`, `categoryCodes`,
  `currency`, `priceBookCode` and
  `reward:{programCode,rewardTypeCode,scale}`. Scale is owner-derived from exact
  canonical Loyalty Program/RewardType evidence, never stored in the binding.
  It is a business selection, not
  frontend configuration or an authority grant. No default Store, reward program,
  price book or category is supplied here.
- Without an explicitly selected owner-projected listing context, Fixed price
  and Auction stay disabled. Gift remains independently selectable. The connected
  view reads POST `/nodics/digitalCore/v0/bundles/composition-context` with `{}`:
  `{contractVersion:1,ownerRef,listings:{state,items}}`. Each item carries
  `code,revision,name` and the complete listing context. `state` is AVAILABLE,
  DISABLED or UNAVAILABLE; only AVAILABLE may contain choices. No first-item
  auto-selection or hand-entered business identifiers are used.
- `onComplete` signals a confirmed PUBLISHED listing, reserved PENDING gift or
  COMPLETED gift returned by Digital. PENDING is not recipient acceptance.
  Parent account shells may refresh their existing owner views.

`AccountSections.tsx` exposes `/account/bundles` and mobile `account=bundles`;
`EnterpriseAccount.tsx` exposes `/account/bundles` with the original Employee
session. Neither mount fetches the customer-only eWaste account/marketplace.
The shared Digital proxy is reused; no new host or runtime property is needed.
Normal Customer and Enterprise views show the human destination name and currency,
not raw Store/category/pricebook/program IDs or context revisions. The optional
`destinationName` is display-only and never changes the wire command or authority.
`onLockedChange` disables destination changes and refresh during review, writes
and uncertain recovery, preserving the original command. No changes are made to
`CommercePurchase`, `CertificatePicker` or their owner protocols.

Digital reads active `digitalBundleListingContext` records in the participant
namespace and verifies Store placement through Product's existing owner handoff.
The records reference categories, currency, pricebook and reward program/type;
they are not another Product, Pricing or Loyalty authority. All sets require an
exact generated count. Publication pins and
revalidates context revision, every governed term and canonical reward precision
before any content hold. Empty governed sets
remain empty. Disabled listing policy or unavailable listing dependencies do not
hide separately authorized Gift composition. Denied owner access rejects the
whole context. Current Profile authority is checked before and after discovery.
Publication still requires Digital's actual Product/Pricing receipts and all
component holds; seeing a destination is not proof of installed publication.

## Exact Owner Calls

The parent-owned `CertificatePicker` calls POST
`/nodics/digitalCore/v0/holdings/certificates` with `{page}`. Digital resolves the
current Profile owner and delegates to qualified Waste certificate holdings.
Only the shared picker's selected `{code,revision}` enters a manifest. No
customer-only eWaste account read or manual certificate identifier field exists
in this composer.

Carbon uses POST `/nodics/wasteCarbon/v0/carbon/holdings` with `{page}`.
The returned owner must match the acting owner. The client validates exact
decimal strings, precision, revision, state and pagination. Only REALIZED lots
with positive available quantity can be selected. Prospective, reserved, impact
estimates and Loyalty's illustrative carbon are not spendable selections.
`eligibility:NOT_CHECKED` and `transferable:null` remain unqualified: selecting
available carbon is not a certification claim. Digital/component owners recheck
qualification, eligibility, quantity, revision and competing holds on command.

After explicit review:

1. POST `/nodics/digitalCore/v0/bundles` with
   `{ownerRef,components,idempotencyKey,composition}`. The reviewed `composition`
   contains mode, original operation key and recipient reference or listing terms.
   Digital retains that normalized instruction and its digest in the immutable
   manifest, before any hold, for reload-safe continuation. No credentials enter it.
2. Validate the returned ACTIVE original manifest, exact selected contents,
   canonical owner, revision, digest and original create key.
3. POST `/nodics/digitalCore/v0/gifts` with
   `{manifestCode,manifestRevision,recipientRef,idempotencyKey,confirmed:true}`,
   or POST `/nodics/digitalCore/v0/bundle-listings` with that manifest reference,
   original operation key, explicit reviewed listing terms and confirmation.

Certificates reference `wasteCore/wasteAsset`, quantity `"1"`.
Carbon references `wasteCarbon/wasteCarbonLot`, exact selected quantity/unit.
Both pin the observed revision. Components may be certificate-only, carbon-only
or mixed. Reward points and purchased coupons cannot become bundle components.

The listing price is an exact decimal string; auction uses the same price as its
minimum bid. Datetime inputs represent local user choices and are converted to
explicit UTC instants. Blank dates are sent as explicit nulls under the existing
Digital contract; no frontend duration is invented. Review shows immediate/no
expiry choices and immediate publication reservation, including future starts.
No internal Product, Pricing, carbon reserve/transfer, checkout or payment route
is called. Product's actual source/Online publication remains Digital's owner
integration. The inspected contracts are
[Digital holdings/gifts](../../../../../nodics.ai/nodics.commerce/modules/digitalCommerce/modules/digitalCore/llm/contracts/bundle-holdings-and-gifts.md)
and [Digital publication](../../../../../nodics.ai/nodics.commerce/modules/digitalCommerce/modules/digitalCore/llm/contracts/bundle-publication.md).

## Recovery And Isolation

An in-flight guard prevents duplicate confirmation. Review freezes complete
intent, recipient and both keys before any write. Uncertainty locks editing and
new commands; only an explicit Resume original command can replay the identical
owner operation. A lost manifest reply repeats the original create key before
progressing. After a confirmed manifest, operation recovery never recreates it.
Malformed/acknowledgement-only or foreign evidence cannot be displayed as success.

Before the first dispatch, `pendingReferences.ts` must successfully retain only
`{manifestKey}` in tab-scoped sessionStorage. The key includes current actor,
canonical owner and capability, not bearer, context revision or destination.
Token refresh, remount and same-tab reload restore the hint without restoring
credentials, selections, amounts or receipts. Storage failure stops dispatch;
corrupt hints fail closed. Another actor/owner does not inherit them.

`POST /bundles/commands/query {ownerRef,manifestKey}` reads exact current owner
records, with full count and scope checks, not a recent-history page. It never
mutates. `UNCONFIRMED` is not absence or replacement permission. PREPARED or an
original resumable hold can expose explicit Continue original bundle, calling
`POST /bundles/commands/resume {ownerRef,manifestKey,confirmed:true}`. The backend
loads the immutable reviewed instruction and uses existing Gift/Publication
commands with fresh authority; storage cannot choose new terms, keys or owners.
No background mutation retry or new manifest is issued by restored recovery.

Owner-confirmed PENDING gift, COMPLETED gift, PUBLISHED listing or RELEASED
operation clears only the matching hint and enables Create another bundle.
Late replies cannot clear newer references or populate a different session.
Current configuration/authority or revised listing contexts can still prevent
continuation; operators must reconcile the original owner records, never invent
a replacement. Session storage does not promise another-device, cleared-storage
or closed-tab discovery. No complete owner command-history endpoint is claimed.

## Verification

Run:

```sh
npx vitest run src/features/bundles src/AccountSections.test.tsx src/EnterpriseAccount.test.tsx
npm run typecheck
```

Isolated tests exercise real shared certificate/recipient pickers with mocked
owner transport, reviewed exact commands, mixed and carbon-only contents,
pagination, decimal precision, bad evidence, lost acknowledgements, duplicate
confirmation and session retirement. Fixtures are not installed business records.
No server, browser/E2E, database, provider, import, publication, grant, funding or
release action is part of this source increment. Visual/mobile/Telegram and
installed multi-owner acceptance remain deferred to the final joint stage.

## Configuration Ownership

This renderer declares no backend property definitions or policy defaults.
Digital owns component/record bounds, gift expiry and listing admission; Carbon
owns holding precision and availability; Loyalty owns effective reward precision,
while governed records select program/type only. Page limits come from owner responses. Missing precision
or context rejects rather than selecting a local default.

The client checks structural wire types, known owner/status identities, exact
receipt matches, decimal representation and user-selected date consistency.
It does not duplicate backend name/identifier-length, quantity-length, price-length
or precision ceilings. Owner services still enforce those rules; passing client
checks is not an admission or publication guarantee. Decimal comparison uses only
actual supplied digits and never allocates an array/string sized by projected scale.
Protocol hashes, canonical owner fields, one-certificate quantity, null optional
dates, empty drafts and initial page one are structural/UI states, not policy
defaults or hidden selections. Fixture values are isolated test data.
