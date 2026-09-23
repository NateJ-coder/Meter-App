# APK Update Quick Reference

## Current Local Build - 2026-09-23

Version 1.0.4 (build 5) simplifies capture to a direct save with no reading
review prompt. It offers the 13 requested buildings, excluding Akasia and Test.
The dashboard source fixes per-image downloads using fetched image bytes and
the label/type/date filename, and keeps existing Test captures accessible.

This APK uses the same dedicated release key as the newly installed 1.0.3
(build 4), so it can update that installation without uninstalling. The old
1.0.2 key mismatch still applies only to devices on the old signing lineage.
Do not change the legacy hosted manifest to advertise this APK to old devices.
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
