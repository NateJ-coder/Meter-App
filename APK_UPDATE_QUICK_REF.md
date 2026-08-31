# APK Update Quick Reference

## 📱 CURRENT APK FOR DISTRIBUTION

**Location:** `Mobile App\build\app\outputs\flutter-apk\app-release.apk`

**Current Version:** v1.0.0 (Build 1)  
**Size:** ~49 MB  
**Last Built:** 2026-08-31

**Features:**
- ✅ Month-based filtering for readings
- ✅ Data cleaning (ready for Phanda Lodge rules)
- ✅ **Automatic update checker (NEW!)**
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
