# Seasonal registration 2026–27 export analysis

## Production import contract

`CustomerProductListing.csv` is the required, authoritative enrollment
ledger. `CustomerProductListingByOrderCustomer.csv` and
`ProductSalesDetailWithPrompts-WithCustomerandChildRegByProductDate.csv` are
independent optional enrichments. A listing-only batch is valid; missing
optional data never creates, cancels, or clears registrations.

`CustomerDetailFromProductWithDOB.csv` is intentionally unsupported. It is a
broad customer-history extract rather than a seasonal enrollment contract and
must not be supplied to the import workflow. Carve does not infer a date of
birth from export age; imported students without a DOB remain incomplete for
manual review.

The production workflow accepts individual CSVs or a ZIP at `/admin/imports`,
validates source roles from CSV headers, persists a private upload manifest,
then starts Vercel Workflow reconciliation asynchronously. An explicit paired
return changes an imported registration to `returned`; a row missing from a
later file does not change enrollment. The workflow passes batch identifiers
only—never CSV content or PII—to durable execution.

The current Apply control is an authorized idempotent database operation after
the reconciliation is ready. Before production use, move it behind the
workflow’s durable approval step and replace the current server-function
transfer path with authenticated direct browser-to-private-Blob uploads.

The supplied Aspenware/SSRS reports are an analysis source, not an import
contract. Run `bun run analyze:imports` to generate privacy-safe aggregate
outputs in `out/import-analysis/`. The command reads local exports only; it
does not connect to the database or write any Carve records.

The report contains aggregates only. A separate local review file,
`out/import-analysis/restricted/missing_prompt_registrations.csv`, lists the
students with an active listing registration but no matching prompt record. It
contains names and must not be shared or committed.

## Source files and record grain

| File                                                                     | Grain                                         | Use                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------- |
| `CustomerProductListing.csv`                                             | One signed participant sale/return fact       | Primary enrollment metrics, product dimensions, return reconciliation |
| `CustomerProductListingByOrderCustomer.csv`                              | Same sale/return facts with purchaser context | Completeness and guardian/contact-source analysis only                |
| `ProductSalesDetailWithPrompts-WithCustomerandChildRegByProductDate.csv` | Two prompt rows per registration              | Ability-level and prompt coverage analysis                            |

The first CSV row in each report is a technical SSRS field-name row. The next
row repeats human-readable labels before the actual data-bearing columns.
Fields such as `HeaderRowA0`, `DetailRowC*`, and repeated report totals are
report-layout artifacts, not target-domain attributes.

## Validated totals

For the supplied extracts:

- 476 signed listing facts: 465 sales and 11 returns.
- Every return pairs exactly once to a positive sale using participant ID,
  normalized product, product date, and absolute price.
- Net active registrations: **454**.
- 756 prompt rows collapse to 378 registration keys using transaction ID,
  child IP, normalized product, product date, and normalized price. The
  shorter `(TransactionID, TransactionLineIPCode)` key can merge distinct
  products for the same child/order.
- The prompt cohort contains 342 known ability levels and 36 unknown levels.
  It is a partial cohort and must not be used as the denominator for overall
  session counts.

## Product normalization

The product value is a pipe-delimited source string. The analysis parser
extracts:

- `26/27` as the season;
- `Ski` and `SB` as Ski and Snowboard;
- weekday, age band, and session/time by token pattern, not fixed position;
- `9am`, `10am`, `1pm`, `Full Day`, `Session 1`, and `Session 2` as
  session labels.

`PM` is retained as a source prefix. It is not treated as Carve's configured
afternoon time slot. Weekday products place the age band before the weekday;
weekend products reverse those tokens.

## Proposed source ownership for a future adapter

| Target concern                                                | Preferred source               | Import behavior                                                                        |
| ------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| Active registration totals and cancellation/return state      | Customer product listing       | Sum signed quantities; preserve source details for reconciliation                      |
| Product, season, discipline, day, age-band, and time evidence | Parsed listing product         | Treat as external registration evidence, not an automatic published-group update       |
| Purchaser context                                             | By-order customer listing      | Reconcile separately; persist as purchaser, not an assumed guardian                    |
| Ability level and lesson-comment prompt                       | Prompt detail report           | Pivot prompts only after composite-key deduplication                                   |
| Pricing                                                       | Listing/detail source snapshot | Do not turn Carve into a billing system                                                |
| Medical/support and emergency fields                          | Prompt detail report           | Future restricted categories only; never emit free text to analysis output or grouping |

The present Carve schema stores a date of birth and computes age at the relevant
program date. These reports provide age only, so imported age remains source
provenance rather than an authoritative `people.dateOfBirth` value.

## Import validation and retention

- The upload accepts at most one required listing, one optional by-order file,
  and one optional prompt file, individually or in one ZIP.
- Roles are detected from required technical field names; filenames are not
  trusted. ZIPs reject encrypted archives, unsafe paths, duplicate roles, and
  files over the configured 10 MB per-file limit.
- Uploads are stored in private Vercel Blob storage when deployed and a private
  local storage directory during development. Database records retain hashes,
  filenames, role/count metadata, normalized staging facts, and safe status
  summaries—not raw CSV bodies.
- The user interface polls the organization-scoped batch state and does not
  expose Blob URLs, raw support text, or internal workflow failures.

## Open adapter decisions

- Confirm whether report age is calculated at product date while the listing
  age is calculated at export date; the two exports differ by one year for a
  substantial subset.
- Define the operational schedule represented by `Session 1`, `Session 2`,
  and `Full Day` before mapping them to configured `time_slots`.
- Confirm that `SB` is the intended Snowboard mapping.
- Define a human-review path for existing people without an Aspenware identity;
  name-only matching must remain non-automatic.
- Define whether a newly supplied prompt export can be trusted to cover all
  active sales. The current prompt cohort is smaller than the active listing
  cohort.

## Boundaries

This analysis intentionally does not replace the exact-header
2025–26 adapter in `src/domain/imports/seasonal-registration-2025-26.ts`.
The versioned 2026–27 adapter now has upload staging, source-header validation,
private storage, and workflow-triggered reconciliation. It still needs durable
approval/cancellation, manual ambiguity review, direct Blob uploads, retention
cleanup, and live integration/E2E validation before real-data production use.
