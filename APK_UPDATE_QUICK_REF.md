# APK Update Quick Reference

## Pending Update - 2026-10-14 (source only, APK not yet built)

Version 1.0.7 (build 8) answers the October 2026 reconciliation: readings
arriving without photos and nobody knowing why, plus more duplicate and
mislabelled captures.

- A reading can be saved without a photo only when the reader ticks "No
  photo possible" and picks a reason (behind glass / locked box, too dark,
  out of reach, camera not working, Other with a required note). The
  reason is written to the reading record and shown on the dashboard.
- A photo is optional for an "Unable to read" meter; its no-access reason
  is recorded as the reason for the missing photo.
- A photo file that disappears from the phone before it uploads is reported
  once ("Photo lost on the phone before upload") instead of retrying every
  20 seconds forever with the office none the wiser.
- Pending uploads now retry from the home screen as well, which shows
  "N readings and M photos still to upload" until everything is on the
  server. Until now retries only ran while a building's list was open.
- A label that is not on the building's list shows "Did you mean" chips
  for the registered meter it probably is (typing "5", "unit 05" or "qg5"
  offers "QG 05"; a meter already captured this month is marked as such),
  and otherwise needs a short reason, saved as the reader note.
- Dashboard (deploys with `npm run deploy:hosting`, no APK needed for this
  part): a "Missing photos" panel at sign-in lists every capture since the
  start of last month, in any building, that has no photo, with the
  reader's reason or "waiting for the phone to upload it" (overdue after
  24 hours), a "View" link per reading and an "Export list" button. The
  photo column and the Excel export say why a photo is missing.

Release steps are unchanged (Mobile App/APP_UPDATE_GUIDE.md): build and sign
with the existing key, copy the APK to `downloads/`, then raise
`version.json` to build 8 only once the APK is hosted. 31 Flutter tests and
`npm run test:captures` pass.

## Available Update - 2026-10-13

Version 1.0.6 (build 7) closes the gaps found while reconciling the October
2026 cycle (missed meters, meters captured twice under different labels):

- A building cannot be left, and another building cannot be started, until
  every registered meter for it has a reading or an "Unable to read" this
  month. The capture screen shows "X of N registered meters captured" and
  lists the outstanding ones; the building screen refuses to open a second
  building while the first is unfinished.
- The meter list only offers meters not yet captured this month for the
  chosen type, so a unit with both an electricity and a water meter is
  captured once per type and never twice for one type. A free-typed label
  that repeats an earlier capture is refused with the earlier value shown.
- "Review and Save" shows the meter, type, reading and photo for
  confirmation; "Change" returns to the form. A reading can still be changed
  from the list until it has been submitted to the server (after that the
  office corrects it on the dashboard so the audit trail is kept).

Buildings without a registry (Transvalia) are not gated. Same release key
(SHA-256 `8938876e...`), so 1.0.3 and later update in place.

## Available Update - 2026-10-01

Version 1.0.5 (build 6) adds meter-label selection from each building's
registered meter list, accepts a comma decimal mark (e.g. `65,70`), and lets
staff record an unreadable meter with a reason. It also fixes a crash in the
meter-label search field. Signed with the same release key (SHA-256
`8938876e...`), so it updates 1.0.3/1.0.4 in place. 15 Flutter tests passed.

The earlier Windows Application Control block on Flutter's tools is resolved.
If a release build fails with "base.jar ... being used by another process",
run `android\gradlew --stop` from `Mobile App` and rebuild.

Node and the Firebase CLI are not on PATH; they live in
`%LOCALAPPDATA%\FuzioTools`. Before `npm run deploy:hosting`, run:

```powershell
$t = "$env:LOCALAPPDATA\FuzioTools"; $env:Path = "$t\node-v22.23.2-win-x64;$t\firebase-cli\node_modules\.bin;$env:Path"
```

## Available Update - 2026-09-23

Version 1.0.4 (build 5) simplifies capture to a direct save with no reading
review prompt. It offers the 13 requested buildings, excluding Akasia and Test.
The dashboard source fixes per-image downloads using fetched image bytes and
the label/type/date filename, and keeps existing Test captures accessible.

This APK uses the same dedicated release key as the newly installed 1.0.3
(build 4), so it can update that installation without uninstalling. The old
1.0.2 key mismatch still applies only to devices on the old signing lineage.
The shared hosted manifest now advertises 1.0.4 (build 5) as an optional update,
with the APK hosted on Firebase. Newly signed 1.0.3 installations can update
in place. Old 1.0.2 installations also see the shared announcement but cannot
install it in place; the update message explicitly warns about this limitation.
Do not uninstall an old installation until its readings and photos are backed up.
Photo download access was verified restored after billing was repaired on
2026-09-23. The dated rollout notes below are historical.

## Release Signing and Rollout Hold (2026-09-22)

The local v1.0.3 (build 4) APK now uses a dedicated release key, not the
computer's debug key. It is NOT approved for distribution yet. The historical
distribution details below are not the current local build status.

- Private keystore: `%USERPROFILE%\.android\fuzio-release\fuzio-release.jks`
- Local configuration: `Mobile App/android/key.properties` (ignored by Git).
- Alias: `fuzio-release`; format: PKCS12; RSA: 3072 bits.
- Certificate SHA-256: `8938876e92f71b3daa466e9f7a21652096dbee6fbcf42072d3eabc5ec9441c7a`.
- Verified local backup: `%USERPROFILE%\Documents\Fuzio Signing Backup\2026-09-22`.

The backup contains both the keystore and its password configuration. Treat
both as secrets. Keep an encrypted copy on separate storage before relying on
this key for production. A second folder on the same PC does not protect
against formatting or disk failure. Never commit, publicly upload, or place
signing material in a Hosting/downloads folder.

On a replacement PC, restore the keystore and `android/key.properties`, then
adjust `storeFile` to its restored absolute path using forward slashes. Keep
the same key and alias for subsequent releases. Missing signing configuration
must be restored; do not substitute a newly generated key or debug signing.

This key cannot sign an in-place update to the existing v1.0.2 installation,
whose original signing key is unavailable. Do not uninstall the old app or
clear its storage until every phone's pending readings and photos are backed
up and reconciled. A side-by-side migration requires a separate package ID
and has not been implemented. Leave the hosted update manifest unchanged.

Cloud photo downloads currently return HTTP 402 because the owning project's
billing account is disabled in a delinquent state. Restore billing and verify
the image backup before rollout; stored photo links alone are not a backup.

### Evening Readiness Review

- Local candidate: v1.0.3, build 4. Live manifest rechecked: v1.0.2, build 3.
- App and admin dashboard offer 31 buildings. Specialized numeric rules exist
  for Genesis, Phanda and Hazelmere; other buildings preserve decimals.
- Advisory review supports a note or acknowledgement followed by Next. Raw
  entries, cleaned values, reader notes and warning flags are retained.
- Previous-reading checks use exact-label/type local history only. No OCR,
  image identity correction, complete meter checklist or automatic OneDrive
  filing is claimed.
- Local per-record write serialization, corrupt-queue protection, cross-building
  retries, reading-first uploads and masked photo-only retries are tested.
- Update cancellation and closed-dialog handling were repaired. Opening the
  Android installer is not proof of a successful installation.
- Verification: 15 Flutter tests passed; full-app analyzer clean; isolated
  browser tests checked building choices, escaped review notes and audit export.
  Firebase calls were mocked in dashboard tests. No production test captures
  were created. No physical Android device was available for acceptance tests.
- No new update manifest or APK has been deployed. A Git source push does not
  publish a compatible app update. Do not use the historical rollout commands
  below until signing migration, phone backups and Storage billing are resolved.

## 📱 CURRENT APK FOR DISTRIBUTION

**Location:** `Mobile App\build\app\outputs\flutter-apk\app-release.apk`

**Current Version:** v1.0.1 (Build 2)  
**Size:** ~49 MB  
**Last Built:** 2026-08-31

**Features:**
- ✅ Building dropdown (Genesis / Phanda Lodge)
- ✅ Month-based filtering for readings
- ✅ Data cleaning (ready for Phanda Lodge rules)
- ✅ Automatic update checker
- ✅ Capture date/time display

---

## 🔄 HOW TO PUSH AN UPDATE (Quick Steps)

### 1. Update Version Number

Edit `Mobile App/pubspec.yaml`:
```yaml
version: 1.1.0+2  # Increment the +number each time
```

### 2. Build New APK

```powershell
cd "c:\Projects\Claude\Projects\Meter App\Mobile App"
flutter build apk --release
```

### 3. Copy to Downloads Folder

```powershell
cp build/app/outputs/flutter-apk/app-release.apk ../downloads/fuzio-meter-reader-v1.1.0.apk
```

### 4. Update version.json

Edit `version.json` in project root:
```json
{
  "version": "1.1.0",
  "buildNumber": 2,
  "apkUrl": "https://app.fuzio.co.za/downloads/fuzio-meter-reader-v1.1.0.apk",
  "message": "What's new:\n• Feature description\n• Bug fixes",
  "required": false
}
```

### 5. Deploy to Firebase

```powershell
cd ..
npm run deploy:hosting
```

**Done!** Users will see the update prompt next time they open the app.

---

## 📝 Version History

### v1.0.1 (Build 2) - 2026-08-31
- Building dropdown with Genesis and Phanda Lodge options
- Ensures consistent naming for data cleaning
- Improved UX with building icon

### v1.0.0 (Build 1) - 2026-08-31
- Initial release with update system
- Genesis meter capture
- Month filtering
- Data cleaning infrastructure

---

## 🔍 Troubleshooting

**Users not seeing update prompt?**
- Check they have v1.0.0+ installed (the one with update checker)
- Verify version.json is deployed: https://app.fuzio.co.za/version.json
- Ensure buildNumber in version.json is higher than installed version

**APK download fails?**
- Verify APK is accessible: https://app.fuzio.co.za/downloads/{filename}.apk
- Check Firebase Hosting limits not exceeded

---

## 📚 Full Documentation

See `Mobile App/APP_UPDATE_GUIDE.md` for complete details.
