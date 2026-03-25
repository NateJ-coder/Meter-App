# Firebase Storage DevOps Notes

## Current assessment

- The `Buildings` archive is approximately 8,201 files and about 1.2 GB.
- The `ud` workbook footprint is about 7.4 MB.
- Utility Dash structured master data is small enough for Firestore: 23 schemes and 1,123 meter history documents.
- New reading photos are now configured to upload to Firebase Storage when the bucket is available, with local fallback if the upload fails.

## Recommended data placement

- Firestore:
  - schemes
  - buildings
  - units
  - meters
  - cycles
  - readings
  - cycle schedules
  - meter history documents
  - import audit records
- Firebase Storage:
  - meter photo evidence captured from the app
  - future scanned sheets, dispute evidence, and bulk archive uploads

## Capacity view

- The currently measured archive size is below a 5 GB storage ceiling.
- That means the present archive plus ongoing uploads can start on a no-cost footprint if the bucket is available under your Firebase setup.
- Operationally, production usage should assume growth beyond the free tier once more schemes, more years, or higher-resolution images are uploaded.

## When to move to Blaze

Move to Blaze immediately if any of the following are true:

- You intend to upload the full historical image archive and continue adding monthly evidence.
- You need predictable production headroom instead of operating near the free tier.
- You expect sustained staff usage across multiple schemes and devices.
- You want to avoid interruption when storage, bandwidth, or operation quotas are exceeded.

## Bucket structure

Use this logical prefix structure:

- `reading-evidence/{cycleId}/{meterId}/{readingId}-{filename}`
- `archive/{schemeSlug}/{year}/{month}/{filename}`
- `imports/utility-dash/{timestamp}/{filename}`

## Rules guidance

- Require authenticated users for writes.
- Separate read access for office/admin users versus reader-only roles if public photo access is not acceptable.
- Keep Firestore rules aligned with Storage rules so evidence cannot be orphaned from the reading metadata.

## Operational checks

- Monitor stored bytes, download bandwidth, and object count monthly.
- Track failed uploads in browser console and application telemetry if added later.
- Keep local fallback behavior enabled until Firebase Storage reliability is proven in field conditions.
- Do not bulk-upload the full `Buildings` archive without enabling lifecycle monitoring and quota alerts.

## Immediate recommendation

- Use Firestore for imported Utility Dash master data and historical meter timelines.
- Use Firebase Storage for all new photo evidence from the app.
- Plan a Blaze-tier upgrade before bulk-loading the full long-term evidence archive or before rolling this out across the full portfolio.