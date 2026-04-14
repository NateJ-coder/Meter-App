# Current App State

## Runtime baseline

The app has been returned to a local-only runtime baseline.

- The active app pages do not automatically load cleaned migration bundles.
- The normal app flow does not automatically sync schemes, buildings, units, or meters from Firebase.
- Core app behavior remains intact for manual/local use.

## What is active right now

The app still supports the existing core workflow:

- Meter register management for schemes, buildings, units, and meters
- Reading cycle creation and closure
- Reading capture and review flows
- Export flows
- Onboarding and setup-health flows
- Local browser persistence through the storage layer

In practical terms, current operational data is stored in browser localStorage through [assets/storage.js](../assets/storage.js).

## What was removed from runtime use

The following recent clean-data runtime additions were removed:

- automatic bundled master-data loading
- generated clean master-data runtime module
- clean bundle generator script used only for the recent migration pass
- clean bundle payload files under `DataMigration/outputs/app-payloads/`

This means the app is no longer trying to populate the register from the recent cleaned migration artifacts.

## What remains in the repository as reference material

These files still exist as source/reference assets, but they are not loaded by the app runtime:

- normalized workbook outputs under `DataMigration/outputs/sheet-normalized/`
- review artifacts under `DataMigration/outputs/reviews/`
- building image extraction outputs under `Buildings/buildings/*/cleaned images/`
- legacy workbook extraction utilities and historical migration scripts

Those files are useful for future cleanup, mapping, and importer work, but they are not part of the current UI state.

## Firebase status

Firebase-related code still exists in the repository as foundation code, but the app has been reverted so the normal runtime is not depending on a cleaned-data database import path.

That gives us two advantages:

- the current app can still be used in a simple local/manual mode
- a future structured import can be designed properly instead of being tied to the temporary cleaned bundle format

## What the next overhaul should do

Once the specialist delivers structured JSON, the next implementation phase should:

1. Validate the JSON files against a strict schema.
2. Build a deterministic importer that maps those JSON files into app entities.
3. Load those entities into the app register.
4. Optionally push the same validated entities into Firebase collections.
5. Keep historical readings and evidence import as a separate phase unless the delivered data is fully reliable.

## Important constraint for the next phase

The next importer should be built around specialist-delivered clean JSON as the source of truth.

It should not depend directly on:

- raw Utility Dash workbook structures
- OCR output as final truth
- ad hoc folder parsing at runtime

Those sources can still be used for verification, but not as the final operational import format.