# Downloads Folder

This folder stores APK files for mobile app distribution and updates.

## Structure

```
downloads/
  └── fuzio-meter-reader-v1.0.0.apk   # Current production APK
  └── fuzio-meter-reader-v1.1.0.apk   # Next version APK
  └── ...
```

## APK Naming Convention

Use semantic versioning in filenames:
- `fuzio-meter-reader-v{MAJOR}.{MINOR}.{PATCH}.apk`
- Example: `fuzio-meter-reader-v1.2.3.apk`

## Hosting

APK files in this folder are deployed to Firebase Hosting at:
- `https://app.fuzio.co.za/downloads/{filename}.apk`

Users can download updates directly from these URLs through the in-app update system.

## File Size Notice

**Important:** APK files are large (typically 40-50 MB) and should **NOT** be committed to Git.

### Add to .gitignore

Make sure `downloads/*.apk` is in your `.gitignore` file to prevent accidentally committing APK files to the repository.

## Deployment Process

1. Build the APK: `flutter build apk --release`
2. Copy APK to this folder with proper naming
3. Upload to Firebase Hosting (or manually upload to server)
4. Update `version.json` to point to the new APK
5. Deploy version.json

Users will automatically be prompted to update when they open the app.
