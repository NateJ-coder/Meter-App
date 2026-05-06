# Fuzio Meter Reader — Native Android App Proposal

## Background & Problem Statement

The current meter reading workflow runs entirely in a mobile web browser. Field staff scan a QR code, which opens the web app in their browser, and they capture readings meter by meter. Data is written to the browser's `localStorage` cache and then pushed to Firebase Firestore in the background.

This approach has a fundamental reliability problem: **browser localStorage is temporary and unpredictable on mobile devices.**

- Some Android browsers auto-clear site data after a period of inactivity or low storage
- If the Firestore background write did not complete before the user navigated away or the browser was closed, the reading was silently dropped
- There is no way to confirm to the field reader that their data was safely persisted — the browser gives no feedback
- Incognito sessions (common on shared phones) wipe all data on close
- A May 2026 field session at Genisis resulted in 61 of 63 readings being permanently lost due to this exact failure mode

The consequence is that readings must be physically re-captured, which is costly, disruptive, and undermines trust in the system.

---

## Proposed Solution: Native Android App — Direct APK Distribution (Sideloading)

We build a purpose-built native Android app and distribute it **directly to field staff as an APK file** — no Google Play account, no app store review, no $25 fee. Staff install it once via WhatsApp, email, or a download link, and it becomes their permanent reading capture tool.

This is the recommended approach for a closed, known user group (Fuzio field readers). Google Play makes sense when distributing to the general public — for internal staff, direct APK distribution is faster, cheaper, and gives full control over releases.

### Why native and not a browser improvement?

| | Browser Web App | Native Android App (APK) |
|---|---|---|
| Local storage | `localStorage` — limited (~5 MB), clearable by OS, unreliable | SQLite / Room — persistent, large, managed by the app |
| Background sync | Abandoned when browser tab navigates or closes | Persistent WorkManager job — retries until confirmed |
| Offline support | Partial — depends on service worker | Full — reads queue locally, sync when online |
| Camera / QR | Permission-dependent, varies by browser | First-class hardware access, instant open |
| Distribution | URL in browser | Send APK via WhatsApp/email — install once |
| Updates | Instant (web deploy) | Resend APK — user reinstalls (takes ~30 seconds) |
| Cost | Free | Free (no Play Store needed) |

### How APK distribution works

1. Developer builds a signed release APK: `flutter build apk --release`
2. APK file is uploaded to a private link (Google Drive, WhatsApp, or a URL on the admin site)
3. Each field reader receives the link, downloads it on their phone
4. Android shows a prompt: **"Install unknown apps"** — user taps Allow once (one-time per device)
5. App installs in ~10 seconds — icon appears on home screen
6. For updates: send the new APK the same way — Android replaces the old version automatically (same signing key = seamless update, no data loss)

### "Unknown sources" — is this safe?

Yes. Android's "unknown sources" warning is designed to protect users from downloading random APKs off the internet. For your use case — staff receiving an APK directly from their employer — this is standard practice. The APK is signed with your private key, so Android can verify it hasn't been tampered with. Staff only need to enable "Install unknown apps" for the specific app they use to receive the file (e.g. WhatsApp or Chrome), not system-wide.

---

## User Experience Flow

1. **Field reader opens the app** — camera opens immediately, no navigation required
2. **Point at scheme QR code** — app detects and decodes in real time
3. **Scheme overview loads** — shows scheme name, cycle status, meter list and reading order
4. **Tap "Begin Reading"** — navigates to first meter in sequence
5. **For each meter:**
   - App shows previous reading, meter number, unit/location
   - Reader enters the new reading value
   - Optional: photograph the meter display
   - Tap **Submit** — reading is written to local SQLite database *and* immediately pushed to Firestore
   - App waits for Firestore confirmation before advancing — reader sees a ✓ confirmation
   - If offline, the reading is queued locally and synced automatically when connectivity returns
6. **Session complete screen** — shows count of readings captured, confirmed cloud sync count, and any queued-but-unsynced readings
7. On the admin web dashboard, readings appear in real time as they are captured

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│              Field Reader's Android Phone            │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           Fuzio Meter Reader App             │    │
│  │  (Flutter — see Technology section below)   │    │
│  │                                              │    │
│  │  ┌─────────────┐    ┌─────────────────────┐ │    │
│  │  │ QR Scanner  │    │  SQLite / Room DB   │ │    │
│  │  │ (camera)    │    │  (persistent local) │ │    │
│  │  └─────────────┘    └──────────┬──────────┘ │    │
│  │                                │             │    │
│  │                    ┌───────────▼───────────┐ │    │
│  │                    │   WorkManager Sync    │ │    │
│  │                    │  (background, retry)  │ │    │
│  └────────────────────┴───────────┬───────────┘ │    │
│                                   │              │    │
└───────────────────────────────────┼─────────────┘
                                    │ HTTPS
                                    ▼
                    ┌───────────────────────────────┐
                    │     Firebase Firestore         │
                    │  (project: meter-app-36307)    │
                    │  Collection: readings          │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Fuzio Admin Web Dashboard    │
                    │  (existing — no changes)       │
                    │  reading-cycle.html, review    │
                    └───────────────────────────────┘
```

The Firestore data model, collection names, and document structure remain identical. The app writes to `readings/{id}` exactly as the web app does. The admin dashboard requires zero changes.

---

## Recommended Technology: Flutter

**Flutter** (by Google) is the recommended framework for the following reasons:

- **Cross-platform from day one** — a single codebase produces both Android (Play Store) and iOS (App Store) builds. We are not locked to Android only.
- **Firebase first-class support** — the `cloud_firestore`, `firebase_auth`, and `firebase_storage` Flutter packages are officially maintained by Google (the FlutterFire suite). The same Firebase project is used with no backend changes.
- **Reliable local storage** — Flutter apps use `sqflite` (SQLite) or `isar` for local persistence. This is a proper database on the device filesystem, not a browser cache. It persists across app restarts, OS updates, and low-storage conditions.
- **QR scanning** — `mobile_scanner` package provides real-time camera QR decoding, opens instantly on app launch.
- **Background sync** — `workmanager` package integrates with Android WorkManager for guaranteed background sync with retry logic. If the phone goes offline mid-session, every captured reading is queued and pushed when connectivity returns — with confirmation.
- **Offline-first** — the Firebase Flutter SDK includes built-in offline persistence. Reads and writes work without connectivity and auto-sync when online.
- **Familiar language** — Dart (Flutter's language) is similar in structure to JavaScript/TypeScript, keeping the learning curve manageable.

---

## Data Pipeline (Detail)

### On the phone (Flutter app)
1. Reader submits a reading
2. App writes to local SQLite immediately — this is synchronous and cannot be lost
3. App calls `FirebaseFirestore.instance.collection('readings').doc(id).set(data)` — the Firebase Flutter SDK queues this write internally
4. If online, Firestore confirms within ~200ms and the app shows ✓
5. If offline, the write is persisted in Firebase's local cache and automatically pushed when the device comes online — **no user action required**
6. A background WorkManager job checks for any unsynced local records every 15 minutes as a secondary safety net

### On the admin web dashboard
- No changes needed
- Readings appear in Firestore in real time as each meter is submitted
- `reading-cycle.html` can use the existing ⟳ Re-sync button to pull latest readings at any time

---

## What Stays the Same

- Firebase project (`meter-app-36307`) — unchanged
- Firestore collection names and document structure — unchanged
- Admin web dashboard (all HTML/JS pages) — unchanged
- QR codes already printed — unchanged (the app reads the same `scheme_id` / `meter_id` URL parameters from the QR payload)
- Reading cycle management, review, export — unchanged

---

## What is New / Changed

- A new Flutter project (separate repository or subfolder)
- Google Play Developer account required (~$25 USD one-time registration fee)
- App signing key management (standard Play Store requirement)
- Firestore security rules may need tightening — currently fully open (`allow read, write: if true`). For a published app, rule-based auth per device/user is recommended.
- Optional: Firebase App Check to prevent abuse from non-app clients

---

## Open Questions for Team Discussion

1. **iOS?** Flutter supports iOS. If any field readers use iPhones, we build once and publish to both stores. Adds Apple Developer account ($99/year).
2. **Authentication on the phone?** Currently field readers are unauthenticated (open access). Should the app require a PIN, phone number, or Google sign-in? This would tie each reading to a specific person.
3. **Photo capture?** The existing web app supports meter photos. The Flutter app can use the device camera natively — much more reliable than the browser file input.
4. **Offline map / building floor plan?** Out of scope for V1 but possible with Flutter.
5. **Who owns the Play Store account?** Fuzio Properties or the development team?
6. **Timeline?** A functional V1 (QR scan → sequential reading capture → Firestore sync) can be built in approximately 4–6 weeks.

---

## V1 Feature Scope (Recommended)

| Feature | Priority |
|---|---|
| QR code scan on launch | Must have |
| Scheme overview (cycle status, meter count) | Must have |
| Sequential meter reading capture | Must have |
| Local SQLite persistence (no data loss) | Must have |
| Firestore sync with confirmation per reading | Must have |
| Offline queue with auto-retry | Must have |
| Previous reading display + consumption estimate | Must have |
| Meter photo capture | Should have |
| Flag/issue reporting per meter | Should have |
| Session summary screen | Should have |
| Push notifications from admin (e.g. "Cycle opened") | Nice to have |
| Multi-language support | Nice to have |

---

---

## APK Launch Pipeline

### Step 1 — App Identity Decisions (must be decided before any build)

These values are permanent and cannot be changed once any version of the APK is installed on a device (changing the package name = the app is treated as a completely different app and all local data is lost):

| Decision | Recommended Value | Notes |
|---|---|---|
| **Application ID (package name)** | `com.fuzio.meterreader` | Reverse-domain format. Does not need to match a real domain. |
| **App name** | `Fuzio Meter Reader` | Shown on the home screen icon |
| **Firebase project** | `meter-app-36307` (existing) | No new project needed |

### Step 2 — App Signing Key

All APKs must be signed. The signing key is what allows Android to recognise that a new APK is an **update** to the existing app rather than a different app. If the key is lost, users must uninstall and reinstall — they lose their local data.

**Generate a signing key (one-time, store permanently):**
```bash
keytool -genkey -v -keystore fuzio-meter-reader.jks \
  -alias fuzio-meter-reader \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Store `fuzio-meter-reader.jks` and its password in a secure location — a password manager, an encrypted drive, or a private secrets manager. **Never commit this file to the git repository.**

Back it up in at least two separate locations immediately.

### Step 3 — Firebase Configuration for Flutter

Firebase must be registered for the Android app so it issues a `google-services.json` config file:

1. Go to [Firebase Console](https://console.firebase.google.com) → Project `meter-app-36307`
2. Add App → Android
3. Enter the **Application ID** (e.g. `com.fuzio.meterreader`)
4. Enter the **SHA-1 and SHA-256 certificate fingerprints** from the signing key:
   ```bash
   keytool -list -v -keystore fuzio-meter-reader.jks -alias fuzio-meter-reader
   ```
5. Download `google-services.json` — place it at `android/app/google-services.json` in the Flutter project
6. This file is not secret but should not be in a public repository

The SHA-256 fingerprint is also required for Android App Links (see Step 5).

### Step 4 — Building the APK

```bash
# Debug build (for testing only — not for distribution)
flutter build apk --debug

# Release build (signed, optimised — this is what you send to staff)
flutter build apk --release \
  --dart-define=APP_ENV=production
```

The release APK is output to:
```
build/app/outputs/flutter-apk/app-release.apk
```

This file is typically 15–30 MB.

### Step 5 — Android App Links (Critical — QR Code Integration)

This is the key backend congruency requirement. Currently QR codes contain URLs like:
```
https://natej-coder.github.io/Meter-App/reader.html?scheme_id=abc123
```

When a user scans that QR code with their phone camera, Android currently opens it in the browser. For the phone camera to **automatically open the Fuzio Meter Reader app instead**, we must configure **Android App Links**.

#### What needs to happen:

**1. Claim a custom domain (required for App Links)**

`natej-coder.github.io` is a third-party domain — we cannot host the required verification file there. A custom domain is needed, e.g. `meter.fuzio.co.za`.

This is also the right time to give the admin dashboard a professional URL — staff and clients should not see a GitHub URL.

**2. Wire the custom domain to GitHub Pages**

Add two DNS records at your domain registrar:

| Type | Name | Value |
|---|---|---|
| `CNAME` | `meter` | `natej-coder.github.io` |
| `TXT` | `_github-pages-challenge-...` | *(value provided by GitHub during setup)* |

In GitHub repository Settings → Pages → Custom domain → enter `meter.fuzio.co.za`. GitHub provisions HTTPS automatically via Let's Encrypt.

**3. Host the Digital Asset Links file**

Create this file and commit it to the repository at `.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.fuzio.meterreader",
    "sha256_cert_fingerprints": [
      "AA:BB:CC:DD:EE:..."
    ]
  }
}]
```

Replace the fingerprint with the actual SHA-256 from Step 3. GitHub Pages will then serve it at:
```
https://meter.fuzio.co.za/.well-known/assetlinks.json
```

**This works with sideloaded APKs** — App Links verification is based on the signing key fingerprint, not the Play Store. As long as the APK is signed with the matching key, Android verifies it and opens the app automatically when the QR code is scanned.

**4. Update QR codes to use the custom domain**

Once the domain is live, regenerate QR codes using the new base URL:
```
https://meter.fuzio.co.za/reader.html?scheme_id=abc123
```

The admin dashboard continues to work at the same domain. The app intercepts the URL when scanned on Android.

**5. Declare intent filters in the Flutter app**

In `android/app/src/main/AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="meter.fuzio.co.za" />
</intent-filter>
```

### Step 6 — APK Distribution Methods

**Option A: WhatsApp (simplest)**
- Upload APK to a WhatsApp group for field staff
- Staff download and install directly
- Suitable for small teams (up to ~20 people)
- No infrastructure needed

**Option B: Download link on the admin site**
- Host the APK at a URL, e.g. `https://meter.fuzio.co.za/download/fuzio-meter-reader.apk`
- Commit the APK file to the repository (or serve from Firebase Storage)
- Admin sends staff the download link when a new version is available
- Slightly more professional than WhatsApp

**Option C: Self-hosted update server (future)**
- Tools like `Shorebird` or a simple JSON manifest can enable in-app update prompts
- App checks for a new version on launch and prompts the user to download
- Out of scope for V1 but worth knowing about

For V1, **Option A** is recommended — get it working first, refine distribution later.

### Step 7 — CI/CD Build Pipeline (Optional but recommended)

Automate APK builds via GitHub Actions so any tagged release produces a downloadable APK:

```yaml
# .github/workflows/build-apk.yml
name: Build Release APK

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.x'
      - name: Decode keystore
        run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/app/fuzio-meter-reader.jks
      - name: Build release APK
        run: flutter build apk --release
        env:
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
          STORE_PASSWORD: ${{ secrets.STORE_PASSWORD }}
      - name: Upload APK as release asset
        uses: softprops/action-gh-release@v2
        with:
          files: build/app/outputs/flutter-apk/app-release.apk
```

This produces a signed APK attached to every GitHub release. The download URL is permanent and can be sent to staff.

**GitHub Secrets required:**
- `KEYSTORE_BASE64` — base64-encoded `.jks` file (`base64 -w 0 fuzio-meter-reader.jks`)
- `KEY_ALIAS`, `KEY_PASSWORD`, `STORE_PASSWORD` — keystore credentials

---

## Firestore Security Rules Update

The current rules are fully open (`allow read, write: if true`). Once a native app is published, this must be tightened. Recommended approach:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Admin web dashboard — authenticated users only
    match /{document=**} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role 
        in ['admin', 'developer'];
    }

    // Field reader app — can only write to readings collection
    match /readings/{readingId} {
      allow create, update: if request.auth != null;
      allow read: if request.auth != null;
    }

    // Reference data — read by app, write by admin only
    match /schemes/{id} { allow read: if request.auth != null; }
    match /buildings/{id} { allow read: if request.auth != null; }
    match /units/{id} { allow read: if request.auth != null; }
    match /meters/{id} { allow read, update: if request.auth != null; }
    match /cycles/{id} { allow read: if request.auth != null; }
  }
}
```

This requires **Firebase Authentication** to be used in the Flutter app. Options:
- **Anonymous auth** — simplest, no user account needed, each install gets a persistent anonymous UID
- **Phone number auth** — ties each device to a phone number, strongest audit trail
- **Email/password** — field reader accounts managed by admin

---

## Domain Setup Summary

The following DNS records are needed for a custom domain (e.g. `meter.fuzio.co.za`):

| Type | Name | Value | Purpose |
|---|---|---|---|
| `CNAME` | `meter` | `natej-coder.github.io` | Points custom domain to GitHub Pages |
| `TXT` | `_github-pages-challenge-...` | *(provided by GitHub)* | Domain ownership verification |

In GitHub repository settings → Pages → Custom domain → enter `meter.fuzio.co.za`.

GitHub will automatically provision an HTTPS certificate via Let's Encrypt.

The `.well-known/assetlinks.json` file for App Links must be committed to the repository root so it is served at `https://meter.fuzio.co.za/.well-known/assetlinks.json`.

---

## Summary Checklist

### One-time setup (before development starts)
- [ ] Decide on custom domain (e.g. `meter.fuzio.co.za`) and register it
- [ ] Decide on Application ID (e.g. `com.fuzio.meterreader`)
- [ ] Generate signing key (`fuzio-meter-reader.jks`) and store securely in 2+ locations
- [ ] Add Android app to Firebase project, register SHA fingerprints, download `google-services.json`
- [ ] Wire custom domain to GitHub Pages
- [ ] Commit `.well-known/assetlinks.json` to the repository

### During development
- [ ] Set up Flutter project with FlutterFire (`firebase_core`, `cloud_firestore`, `firebase_auth`)
- [ ] Implement QR scanner → deep link handler (parse `scheme_id` / `meter_id` from URL)
- [ ] Implement SQLite local cache with sync queue
- [ ] Implement Firestore write with ✓ confirmation per reading (wait for ack before advancing)
- [ ] Implement WorkManager background sync job (retry on failure / offline)
- [ ] Implement offline queue with automatic retry when connectivity returns
- [ ] Set up CI/CD GitHub Actions workflow for automated APK builds

### Before first distribution to staff
- [ ] Build signed release APK: `flutter build apk --release`
- [ ] Test on at least one Android device — complete a full mock reading session
- [ ] Update Firestore security rules (tighten from fully open)
- [ ] Regenerate QR codes with custom domain
- [ ] Send APK to pilot group of 2–3 field readers for real-world test
- [ ] Confirm readings appear in admin dashboard in real time

### For each subsequent release
- [ ] Tag the release in git: `git tag v1.x.x && git push --tags`
- [ ] CI/CD builds and attaches APK to GitHub release automatically
- [ ] Notify staff via WhatsApp with the download link
- [ ] Staff download and install (Android replaces existing app seamlessly)

---

*Prepared: May 2026*  
*Context: Following data loss incident during Genisis cycle field session where 61 of 63 readings were not persisted to Firestore due to browser localStorage limitations.*
