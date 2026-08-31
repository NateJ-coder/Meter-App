# Mobile App Update System Guide

## Overview

The Fuzio Meter Reader app includes an automatic update notification system that alerts users when a new version is available and allows them to download and install it directly from within the app.

## How It Works

1. **On App Launch:** The app checks `https://app.fuzio.co.za/version.json` for the latest version
2. **Version Comparison:** Compares the server's build number with the installed version
3. **Update Prompt:** If a new version is available, shows an update dialog
4. **Download:** User taps "Update Now" and the APK downloads with progress indicator
5. **Installation:** After download, Android prompts the user to install the APK

## Releasing a New Version

### Step 1: Update Version Number

Edit `Mobile App/pubspec.yaml`:

```yaml
version: 1.1.0+2  # Format: {major}.{minor}.{patch}+{buildNumber}
```

**Important:** Always increment the build number (the number after `+`). This is what the update checker uses.

### Step 2: Build the APK

```powershell
cd "c:\Projects\Claude\Projects\Meter App\Mobile App"
flutter build apk --release
```

The APK will be created at:
`Mobile App/build/app/outputs/flutter-apk/app-release.apk`

### Step 3: Rename and Place APK

```powershell
# Copy APK to downloads folder with version number
cp "Mobile App/build/app/outputs/flutter-apk/app-release.apk" `
   "downloads/fuzio-meter-reader-v1.1.0.apk"
```

### Step 4: APK Will Deploy Automatically

The hosting script automatically includes all `.apk` files from the `downloads/` folder. No manual upload needed!

When you run `npm run deploy:hosting` (in Step 6), the APK will be deployed to:
`https://app.fuzio.co.za/downloads/fuzio-meter-reader-v1.1.0.apk`

### Step 5: Update version.json

Edit `version.json`:

```json
{
  "version": "1.1.0",
  "buildNumber": 2,
  "apkUrl": "https://app.fuzio.co.za/downloads/fuzio-meter-reader-v1.1.0.apk",
  "message": "New features:\n• Month-based filtering for readings\n• Improved performance\n• Bug fixes",
  "required": false
}
```

**Fields:**
- `version`: Display version (matches pubspec.yaml)
- `buildNumber`: Build number (must be higher than previous)
- `apkUrl`: Full URL to the APK file
- `message`: What's new (shown to users)
- `required`: If `true`, users cannot skip the update

### Step 6: Deploy Everything (version.json + APK)

```powershell
npm run deploy:hosting
```

This single command deploys:
- The updated `version.json` 
- All APK files from the `downloads/` folder
- Your web dashboard files

The APK will be available at the URL specified in `version.json`.

### Step 7: Test the Update

1. Install the OLD version on a test device
2. Open the app
3. Verify the update dialog appears
4. Test the download and installation process

## Update Dialog Behavior

### Optional Updates (`required: false`)
- User sees "Update Now" and "Later" buttons
- Can dismiss the dialog and continue using the app
- Update check happens each time they open the app

### Required Updates (`required: true`)
- User only sees "Update Now" button
- Cannot dismiss the dialog
- Must update to use the app
- Use this for critical security updates or breaking changes

## Troubleshooting

### Update Dialog Doesn't Appear

1. Check that `version.json` is deployed and accessible:
   ```
   https://app.fuzio.co.za/version.json
   ```
2. Verify the `buildNumber` in version.json is higher than the installed app
3. Check app logs for update check errors

### Download Fails

1. Verify APK URL is correct and accessible
2. Check device storage space
3. Check internet connection
4. Ensure APK file is not corrupted

### Installation Prompt Doesn't Appear

1. Verify device allows "Install from Unknown Sources" for your app
2. Check that `REQUEST_INSTALL_PACKAGES` permission is in AndroidManifest.xml
3. Ensure the downloaded APK is valid

## Version History Template

Keep track of your releases:

```markdown
## Version 1.1.0 (Build 2) - 2026-08-31
- Added month-based filtering for readings
- Display capture date/time on each reading
- Improved sorting (newest first)

## Version 1.0.0 (Build 1) - 2026-07-31
- Initial release
- Genesis and Phanda Lodge support
- Photo capture and Firebase sync
```

## Best Practices

1. **Always increment build numbers** - Never reuse a build number
2. **Test updates thoroughly** - Install old version, then test update flow
3. **Clear release notes** - Tell users what changed in simple terms
4. **Gradual rollouts** - Consider testing with a small group first
5. **Keep old APKs** - Don't delete previous versions in case you need to rollback
6. **Version.json updates are instant** - Users get notified on next app launch
7. **Monitor update adoption** - Check Firebase analytics to see update rates

## Emergency Rollback

If a bad version was released:

1. Edit `version.json` to point back to the previous stable APK:
   ```json
   {
     "version": "1.0.0",
     "buildNumber": 1,
     "apkUrl": "https://app.fuzio.co.za/downloads/fuzio-meter-reader-v1.0.0.apk",
     "message": "Please update to the latest stable version.",
     "required": true
   }
   ```

2. Deploy: `npm run deploy:hosting`

3. Users who installed the bad version will be prompted to downgrade

## File Locations

- **Update checker code:** `Mobile App/lib/app_updater.dart`
- **Version manifest:** `version.json` (root of project)
- **APK storage:** `downloads/` folder
- **Hosting script:** `scripts/prepare-hosting.mjs`
- **Android permissions:** `Mobile App/android/app/src/main/AndroidManifest.xml`
