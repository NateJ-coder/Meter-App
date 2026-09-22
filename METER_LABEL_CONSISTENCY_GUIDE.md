# Meter Label Consistency Check

## What This Solves

On-site staff sometimes file a meter-reading photo under the wrong meter label - a typo, or the wrong item picked from a list. The existing filename/OCR pipeline in `scripts/extract-building-image-data.py` can catch some of this (see `ISSUE_DETECTION_GUIDE.md`'s "Building Image Validation" section), but it depends on Tesseract OCR reading a serial number plate that, in practice, it almost never manages to read (0 of 30 serial numbers OCR'd successfully for Azores).

The physical fact that makes this fixable: most of these meters (Itron ACE6000 3-phase units, in the buildings reviewed) have a serial number plate that is clearly legible to the human eye in a normal photo, even though Tesseract cannot read it reliably. A meter's serial number is a far more trustworthy identifier than whatever label a rushed on-site capture assigned it. If a photo's true serial number matches a *different* meter's own well-established historical serial number, that photo is almost certainly mislabeled (or, for an unlabeled "stray" photo, it tells you exactly which meter it actually belongs to).

`scripts/check-meter-label-consistency.mjs` automates that check using Gemini vision (already wired into this repo via `scripts/gemini-clean-workbook.mjs` and `GEMINI_API_KEY`) instead of Tesseract, and instead of a human manually eyeballing serial plates across dozens of photos.

## How It Works

For each building that already has a `Buildings/buildings/<Building>/cleaned images/meter-image-extractions.json` (produced by `extract-building-image-data.py`):

1. **Read a meter identity from every photo.** For each image, Gemini vision is asked to read the serial number plate (character-for-character, with a confidence score), the meter brand/model, and any other visible distinguishing detail. Results are cached in `cleaned images/meter-identity-fingerprints.json`, keyed by image path and a content hash (SHA-1) of the file - so re-running the script after adding a few new photos does not re-bill Gemini for photos it already read successfully. Failed reads are never cached and are always retried.

2. **Build a per-meter fingerprint from history.** For every canonical meter number that the extraction pipeline already resolved photos to (`reference_meter_number`), the script looks at every *other* photo on file for that meter (leave-one-out - a photo is never used to confirm itself) and takes the most common serial number read across them as that meter's "consensus" identity. If a meter's own historical photos disagree on the serial number, that inconsistency is flagged too (`historical-serial-inconsistent-for-labeled-meter`) - it's evidence something upstream is already wrong for that meter.

3. **Compare each photo's true identity against its label**, and reach one of these outcomes:

   | Outcome | Meaning |
   |---|---|
   | `pass` | The photo's read identity matches its own meter's history. No action. |
   | `insufficient-history-for-labeled-meter` | No independent history exists yet for this meter (e.g. it only has this one photo on file). Nothing to confirm or contradict - not flagged as a problem. |
   | `propose-correction` | The photo disagrees with its own meter's history **and** its identity confidently and unambiguously matches a *different* meter's own well-established history. A specific relabel is proposed. |
   | `label-suggested-for-orphan-image` | Same as above, but for a photo the base pipeline could not resolve to any meter at all (`missing`/`unmatched`/`ambiguous`) - i.e. exactly the "stray photo" case. |
   | `possible-match-needs-review` | A candidate match exists but the read confidence was too low to trust automatically. |
   | `identity-conflict-unresolved` / `possible-identity-conflict-needs-review` | The photo confidently disagrees with its own meter's history, but no other meter's history explains what it actually is. |
   | `ambiguous-identity-match` | The read identity matches more than one meter's history - cannot pick one automatically. |
   | `not-legible` | The serial plate could not be read with reasonable confidence. |
   | `needs-review` (`gemini-call-failed`) | The vision call itself failed (network, quota, etc.) - never silently treated as a pass. |

   **Confidence gating is deliberate and asymmetric.** A low-confidence read is *always* allowed to confirm an existing label (a `pass`), because that carries no risk. A low-confidence read is *never* allowed to trigger `propose-correction` - it only ever produces a "needs review" outcome. Only an exact, normalized serial-number match, read with confidence ≥ 0.6 on both the checked photo and the meter it's being matched against, becomes a proposed correction. This mirrors how a human would (and should) handle it: confident enough to act on, gated well short of "guess and move on."

4. **Report, never silently rename.** Every run writes `cleaned images/meter-label-consistency-report.json` (summary + per-image results + per-meter fingerprints, following the same `flags`-array convention as `meter-image-extractions.json`). Nothing on disk is touched unless `--apply` is passed. `--apply` renames only the images with a `propose-correction` / `label-suggested-for-orphan-image` outcome *and* a filename the tool could confidently derive (it substitutes the old label token for the new one inside the existing filename - it does not invent a new naming scheme). Every apply run is also logged to `cleaned images/meter-label-consistency-applied-actions.json` for an audit trail. **`extract-building-image-data.py` should be re-run afterward** to refresh `meter-image-extractions.json` against the renamed files.

## How to Run It

```bash
# Dry run (report only) across every building that already has an extraction file:
node scripts/check-meter-label-consistency.mjs
# or: npm run ai:check-meter-labels

# Just one building:
node scripts/check-meter-label-consistency.mjs --building "Azores - Completed"

# Just one photo (cheap way to sanity-check a single suspicious image):
node scripts/check-meter-label-consistency.mjs --building "Azores - Completed" --image "April/Images/2_2026-04/AZ 01 - Electricity Reading  2026.04.02.jpeg"

# Force re-reading photos even if the fingerprint cache already has them
# (use after you suspect a bad prior read, not as a routine flag - see Costs below):
node scripts/check-meter-label-consistency.mjs --refresh-fingerprints

# Only after reviewing a dry-run report and being comfortable with its proposals:
node scripts/check-meter-label-consistency.mjs --building "Azores - Completed" --apply
# or: npm run ai:check-meter-labels:apply -- --building "Azores - Completed"

# Validate the decision logic offline, with no API key and no network call at all:
node scripts/check-meter-label-consistency.mjs --self-test
# or: npm run ai:check-meter-labels:self-test
```

Other flags mirror `gemini-clean-workbook.mjs`: `--model`, `--fallback-models`, `--max-retries`, `--retry-base-ms`, `--request-timeout-ms`, `--limit-images` (process only the first N images of each building - useful for a cheap trial run).

Requires `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `.env.local`, same as the workbook-cleaning script.

## What Was Verified, and What Was Not

This was built and tested from an automated session with **no direct network egress** to `generativelanguage.googleapis.com` (confirmed - even a plain fetch to `google.com` failed from that session), despite `.env.local` already containing a real `GEMINI_API_KEY`. That means the actual vision call was **not exercised live** from this session. What was verified instead:

- **Decision logic**: `node scripts/check-meter-label-consistency.mjs --self-test` runs 6 synthetic (non-real) scenarios through the full comparison/decision code with no I/O at all - consistent label, confident mislabel → correction, orphan photo matched to a known meter, illegible serial, low-confidence mismatch (must *not* auto-correct), and single-photo-with-no-history. All 6 pass.
- **Real-data plumbing, end to end, against Azores' actual 30-photo corpus**: extraction-file parsing, per-image and per-meter data structures, the fingerprint cache, retry/fallback handling, graceful per-image failure handling (a failed vision call never crashes the run or gets treated as a pass - it becomes `needs-review`), report generation, and `--apply`'s no-op safety when nothing is actionable. This ran cleanly across all 30 real Azores photos.
- **The HTTP call itself was not reachable to test**, but it is the same request shape (Gemini `generateContent`, API-key query param, `responseMimeType: "application/json"`, retry/fallback across `gemini-2.5-flash-lite` → `gemini-1.5-flash` → `gemini-2.5-flash`) as `gemini-clean-workbook.mjs`, which has real successful output on file in this repo (`source-documents/03-extracted-outputs/gemini-cleaning/ud-extraction-and-data-check-summary-latest.json` - 694/757 rows accepted, 0 rejected, generated 2026-05-27) using the same API key. The only addition is one `inlineData` image part in the request payload, which is standard Gemini vision usage.
- **What genuinely still needs a real run**: whether the vision prompt actually gets clean, well-formed serial-number reads off real meter photos at the confidence levels assumed here, and whether `--apply`'s filename-rename mechanics behave correctly on an actual `propose-correction` (none occurred in testing, since no live vision data was available to trigger one).

**Recommended first real run**: `node scripts/check-meter-label-consistency.mjs --building "Azores - Completed" --limit-images 5` from a normal terminal on your machine, and read the resulting report before trusting a full run or ever using `--apply`.

## Limitations

- **Azores currently has only one photo per meter** (one reading cycle on file). The tool can still catch a *cross-meter* mismatch (photo A's identity matches meter B's own photo) even with one photo each, which is exactly the real case this was built for - but it cannot yet detect a meter's *own* history being self-inconsistent over time, since there's no second data point per meter yet. That gets stronger automatically as more reading cycles accumulate.
- Only `.jpg`/`.jpeg`/`.png`/`.webp` are sent to Gemini vision; `.bmp`/`.tif`/`.tiff` and PDFs are skipped with an `unsupported-image-format-for-vision` flag rather than guessed at.
- Matching is exact-normalized-string only (case/punctuation-insensitive, no fuzzy/edit-distance matching). A serial number misread by one character in a way that happens to still be wrong will not be caught as a "close" match - it will fall through to a "needs review" outcome instead of a wrong auto-correction, which is the safer failure mode, but means genuinely close calls still need a human to close them out.
- The renamer only knows how to substitute the existing label token inside the existing filename - it does not invent filenames for images that never had a recognizable label token in the first place (some orphan images will get `proposed_meter_number` but no `proposed_file_name`, and are left for manual handling).

## Cost and Scale

Azores' 30 photos are a trivial Gemini bill either way (small JPEGs, `gemini-2.5-flash-lite`). Before pointing this at the full ~13-building, multi-cycle photo archive (potentially thousands of images), be aware:

- The fingerprint cache means **steady-state re-runs only pay for new/changed photos**, not the whole archive every time - but the **first full run over the whole archive will call Gemini vision once per photo**.
- `--limit-images` and `--building` let you scope a first full-archive run building-by-building rather than all at once.
- Consider whether every historical photo needs an identity fingerprint, or only: (a) newly captured photos each cycle, and (b) any photo the base pipeline already flags as `missing`/`unmatched`/`ambiguous`/`reading-below-last-known`. The script as written processes every image in the extraction file by default; scoping it down further (e.g. a `--only-flagged` mode) would be a small follow-up if full-archive cost turns out to matter.

## Future Work: Hooking This Into the Live App

Today this runs offline, after the fact, against the migration/cleanup corpus. The live capture flow (`assets/firebase-media.js`) is where a mislabel actually first happens: `buildReadablePhotoName()` and `buildEvidencePath()` build the stored filename and Storage path directly from whatever `meterLabel`/`meterNumber`/`meterId` the capture UI passed in as context, with no independent check against the photo's contents.

This repo currently has **no Cloud Functions backend** - it's a static-hosted client talking directly to Firestore/Storage - so there is no natural server-side hook to run this check automatically the moment a photo is uploaded. Two realistic paths, in increasing order of effort:

1. **Client-side check at capture time (interim step, no new infrastructure).** Before/while a photo is queued for upload in `firebase-media.js`, call Gemini vision client-side (or an equivalent endpoint) with the just-captured photo and the meter the user selected, and warn the user in the capture UI itself ("this doesn't look like meter AZ 01 - are you sure?") before the reading is ever submitted. This requires exposing (or proxying) a Gemini call from the client, which has its own key-exposure considerations worth thinking through before shipping.
2. **Server-side check via Cloud Functions (the durable fix).** Add a Cloud Function triggered on Storage upload (or on the Firestore reading-document write) that runs this same identity-vs-history comparison and writes the result back onto the reading record as a review flag, using the same historical corpus this script builds from `app-database`/`ai-knowledgebase`/the accumulated photo history. This is the version that can't be skipped by a user dismissing a client-side warning, and is the natural next step once this offline tool has proven itself against real historical data.

## Open Questions for Nate

- **Should `--apply` ever run unattended?** As built, it never runs by default and only acts on high-confidence exact matches - but it's still worth deciding explicitly whether renames should always go through a human review step first, or whether a sufficiently confident match can eventually auto-apply.
- **Cost/rate tolerance** for a first full-archive backfill run across all ~13 buildings and every historical cycle - worth doing all at once, or building-by-building?
- **Which corpus is authoritative** for the meter fingerprint once `app-database`/`ai-knowledgebase` eventually carry serial numbers directly (they currently don't) - should this script prefer that, once populated, over vision-reading photos every time?
- Whether the client-side or server-side (Cloud Functions) path above is the one worth investing in next, given there's no backend today.

## 2026-09 Changelog: Phanda Lodge Cycle Lessons

A real reading cycle for Phanda Lodge (48 units + 5 bulk-meter photos, processed 2026-09-06) surfaced five concrete data-quality issues in how staff self-report labels and how readings get captured. This section documents what changed in response, why, and what is still open. The confidence gates (`MIN_LEGIBLE_CONFIDENCE = 0.30`, `MIN_MATCH_CONFIDENCE = 0.60`) and the dry-run-by-default / explicit `--apply` pattern are unchanged and still govern every new behavior below - nothing here weakens them, and nothing here auto-renames anything without `--apply`. No new unconditional Gemini call was added anywhere; item 3 reads more out of the SAME vision call the tool already makes per photo.

### Item 1 - Duplicate self-reported labels within one batch

**The case:** two Phanda Lodge photos were both typed in by staff as unit "#3" this cycle. Cross-checking each photo's serial number against history showed one was genuinely unit 3, and the other was actually unit 2 (confirmed by both its own serial-number history and a physical "2" sticker visible in the photo) - a plain typo.

**What changed:** `detectDuplicateLabelsInBatch()` groups every image by `(containing_folder, date)` - the same per-cycle grouping the extraction pipeline already produces - and its normalized self-reported label (`meter_number`/`unit_label`, see item 2). Any label shared by 2+ photos in the same batch is tagged `duplicate-label-in-batch` on every one of them (not just one arbitrarily), and a confirmed self-match no longer short-circuits straight to `pass` for a duplicate-flagged photo - it is forced through the full candidate-match search against every other meter's own history, same as a normal mismatch would be. Three outcomes follow from that search, all using the existing decision vocabulary plus one new one:
- If the search confirms the photo really is its own labeled meter, decision is `pass` (with the informational flag `duplicate-label-confirmed-correct`) - it is not treated as "correcting" a label to itself.
- If the search confidently and unambiguously points at a *different* meter (the real Phanda Lodge case: the mistyped "#3" photo's serial/history matches unit 2), decision is `propose-correction`, same as any other confident mislabel - the duplicate flag does not stop at "needs review", it drives the same reassignment logic every other mislabel gets.
- If neither resolves (e.g. a duplicate on a meter's very first-ever cycle, with no independent history yet to check against), decision is the new `duplicate-label-needs-review`, instead of the previous, misleadingly-reassuring `insufficient-history-for-labeled-meter`.

Generic "bulk" labels are explicitly excluded from this path (see item 3 - a batch of bulk-meter photos sharing a generic label is a different problem, not a unit mix-up).

### Item 2 - Inconsistent label formatting ("21" vs "#21")

**The case:** one Phanda Lodge photo this cycle was self-reported as plain "21" while every other unit that cycle was reported with a leading "#" ("#1", "#3", "#21", ...).

**What changed:** a new `normalizeLabel()` helper (trim, strip a leading `#`, and also strip a trailing app-auto-appended `" (2)"`/`" (3)"` dedupe suffix - see item 3) is now used everywhere a self-reported label is compared for grouping/duplicate-detection purposes (item 1's `detectDuplicateLabelsInBatch()` and item 3's `labelWordBag()`). "21" and "#21" now normalize to the same comparison key. This is deliberately comparison-only: display fields and the file-renaming logic (`proposeCorrectedFileName()`) still use the original, unnormalized label token, so an applied rename never invents formatting a human didn't type.

### Item 3 - Bulk multi-register meters (kWh / kvarh / kVA)

**The case:** Phanda Lodge's bulk electricity meter is a 3-phase Itron ACE6000 that cycles through multiple OBIS registers on its LCD (`1.8.x` = kWh import, `3.8.x`/`4.8.x` = kvarh reactive, `6.x.x` = kVA demand). This cycle, staff self-reported 4 different bulk-electricity photos with inconsistent generic labels - three as "BULK ELECTRICITY READING" (which the live capture app auto-dedupes by appending " (2)", " (3)", etc. to the filename when the identical label is typed twice in one batch) and a fourth, for the kVA register specifically, as the differently-worded "ELECTRICITY BULK READING". The app has no way today to tell these four photos apart except by whatever generic text staff happened to type.

**What changed:**
- `buildIdentityPrompt()` (the SAME Gemini vision call the tool already makes per photo - no new API calls) now also asks for the on-screen unit-of-measure text (kWh / kvarh / kVA) and an OBIS-style register code, each with its own confidence score. New response fields: `on_screen_unit_text`, `on_screen_unit_text_confidence`, `on_screen_register_code`, `on_screen_register_code_confidence`. These are sanitized/cached exactly like the existing serial-number fields (`sanitizeIdentityRecord`, the SHA-1 fingerprint cache) - a re-run does not re-bill Gemini for a photo it already read successfully.
- `classifyBulkRegister()` derives `kWh-import` / `kvarh-reactive` / `kVA-demand` from those fields, gated behind a new `MIN_REGISTER_TEXT_CONFIDENCE = 0.30` (mirrors `MIN_LEGIBLE_CONFIDENCE`'s philosophy - below this, the read isn't trusted to distinguish one register from another).
- `looksLikeBulkLabel()` / `labelWordBag()` recognize a photo as a generic "bulk" photo (word "BULK" present, case-insensitive) and reduce its label to an order/case-insensitive bag of words, so "BULK ELECTRICITY READING" and "ELECTRICITY BULK READING" - and an app-auto-appended " (2)" suffix - compare equal. Photos sharing a batch and a word-bag get `bulk_generic_label_bag`, and when a register type is confidently identified, `detected_bulk_register_type`, `detected_on_screen_unit_text`/`_register_code`, and a human-readable `suggested_register_label` (e.g. `BULK ELECTRICITY READING (kVA demand)`) are attached to the report.
- A post-pass across each such group flags `bulk-label-group-registers-distinct-as-expected` when the identified registers genuinely differ (the normal, fine case - four photos of one physical meter's four different registers) or `bulk-label-group-registers-collide-needs-review` when two photos in the same "bulk" group resolve to the SAME register (a real problem - either a genuine duplicate photo, or one still needs a clean register read).

**Deliberately NOT done:** this is report-only/advisory for now. It is not wired into the `--apply` auto-rename mechanism, because `proposeCorrectedFileName()`'s substitute-the-existing-token mechanism isn't the right shape for "append a register suffix", and a bespoke renamer for this case felt like more risk than the Phanda Lodge evidence justified in one pass. A human reviewing the report can rename these by hand today; wiring up a safe auto-rename for this specific case is a reasonable, scoped follow-up.

### Item 4 - Decimal-precision data loss (found and fixed)

**The case:** the kVA-demand bulk photo's typed reading was recorded as "105" in the exported readings, but the meter's on-screen display clearly showed "105.80". A separate building's plain electricity meter has also shown a legitimate decimal reading ("9460.5"). kVA/kvarh readings routinely carry meaningful decimals.

**Root cause, found:** `Mobile App/lib/reading_cleaner.dart`'s `ReadingCleaner._cleanPhandaLodge()`. This function runs on every Phanda Lodge reading before it is uploaded (`Mobile App/lib/firebase_upload_service.dart` calls `ReadingCleaner.clean()` and stores the result as the Firestore `readingValue` field - the value everything downstream, including `capture-dashboard.js`'s spreadsheet export, actually reads). It was **unconditionally dropping the decimal point and everything after it** from every Phanda Lodge reading, based on the (previously true, but incomplete) observation that the 48 per-unit electricity sub-meters ("PH 01".."PH 48") are always whole numbers in the historical record. That rule was never scoped to just those unit meters - it silently applied to the bulk meter too, which is why "105.80" became "105". (The raw, unrounded value was still preserved separately in the `rawReadingValue` field for audit, but nothing downstream - including the export - reads that field.)

**Fix applied:** `_cleanPhandaLodge()` now only strips the decimal for labels matching the confirmed-whole-number per-unit pattern (`^PH\s*0*\d{1,3}$`, i.e. "PH 01".."PH 48"). Any other label - "Bulk 1", "WATER", "BULK ELECTRICITY READING", "ELECTRICITY BULK READING", or anything else - now has its decimal point preserved instead of dropped. This errs toward keeping a real decimal a reader typed, which is the safe direction given the confirmed bug was decimals being destroyed, not invented.

**This requires an app rebuild to take effect on staff phones.** `Mobile App` is a Flutter app (see `Mobile App/APP_UPDATE_GUIDE.md` / `READING_CLEANER_GUIDE.md`) - editing `reading_cleaner.dart` in this repo does not change what is already installed on-site. Nate needs to `flutter build apk --release` and push the update through the app's existing update mechanism before this fix reaches field devices.

**What was NOT found/changed:** `assets/app.js`'s `parseDecimalInput()` (used by the web dashboard/on-site-mode capture flow, `on-site-mode.js`/`reading-cycle.js`/`reader.html`) already parses via `Number()`, never `parseInt`/truncation, and was not the source of this bug - it is a separate, already-correct capture path. The bug was isolated to the Phanda-Lodge-specific cleaning rule in the mobile app, not a generic parsing issue across the codebase.

### Item 5 - Zero-consumption deltas need history, not a blanket flag

**The case:** an identical reading to last cycle is not automatically a mistake - a vacant or very-low-usage unit can legitimately repeat the same reading for several consecutive cycles.

**What changed:** neither `check-meter-label-consistency.mjs` nor `extract-building-image-data.py` had ANY zero-delta detection before this change (`extract-building-image-data.py`'s `validate_reference_reading()` only ever flagged a *decrease* below the last known reading, via `reading-below-last-known`). Rather than leave this ungated for whenever zero-delta checking is eventually added, `check-meter-label-consistency.mjs` now includes a history-aware version directly: `buildReadingHistoryByMeter()` reconstructs each meter's own chronological reading history from every cycle already present in the extraction file (using the same decimal-safe `parseReadingNumber()` - see item 4's lesson, applied here too), and `assessZeroDelta()` only flags a zero-delta (`zero-delta-first-time-needs-review`) when it is a *sudden, first-time* occurrence after the meter showed normal (non-zero) movement in its recent prior cycles. A zero-delta that continues an already-flat run of 2-3 prior cycles is tagged `zero-delta-consistent-with-recent-history` and is not treated as suspicious.

### Bonus, documented only: mirroring a bulk water reading across units with no submeters

Confirmed today: Phanda Lodge (and any other building without individual water submeters) has a single bulk water reading, and the master billing spreadsheet's established convention is to mirror that one bulk value into every per-unit "water reading" slot - there is no real per-unit water metering to try to extract. No code in this repo currently generates per-unit water readings from a bulk reading, so there was nothing to change today. If/when such export logic is added (see `EXCEL_EXPORT_GUIDE.md`), it should follow this same mirror-the-bulk-value convention for buildings lacking individual water meters, rather than treating a missing per-unit water photo as an error.

### Self-test coverage added

`node scripts/check-meter-label-consistency.mjs --self-test` (`npm run ai:check-meter-labels:self-test`) grew from 6 to 12 synthetic scenarios (all still pass, all still purely synthetic/offline, no API key or network needed) covering: a duplicate label with no history to check against, a duplicate label resolved to a neighboring meter's established history (the real Phanda Lodge shape), the leading-`#` normalization, four bulk photos distinguished by on-screen register text (including one with an app-auto-appended `" (2)"` dedupe suffix), a sudden first-time zero-delta, and a zero-delta continuing an already-flat history. The self-test runner itself was extended to also assert on expected `flags`, not just `decision`, so these additions could be verified precisely.
