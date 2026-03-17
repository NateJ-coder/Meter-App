# Firebase Setup

## Status

Firebase foundation has been added to the app in [assets/firebase.js](assets/firebase.js).

This is a bootstrap step only. The app still uses localStorage for live data until the storage and auth layers are migrated.

## Project Configuration

The configured Firebase project is:

- Project ID: `meter-app-36307`
- Auth Domain: `meter-app-36307.firebaseapp.com`
- Storage Bucket: `meter-app-36307.firebasestorage.app`

## Why The SDK Snippet Was Adapted

The standard snippet you provided uses imports like:

```javascript
import { initializeApp } from "firebase/app";
```

That works in bundler-based apps such as Vite, Webpack, or Next.js.

This project is a static HTML + browser ES module app, so Firebase is bootstrapped from browser-native ESM URLs in [assets/firebase.js](assets/firebase.js).

## Services To Enable In Firebase Console

### 1. Authentication

Enable:

- Email/Password

Later, if desired:

- Password reset
- Invite links
- Custom claims for admin / field worker roles

### 2. Firestore Database

This must be enabled before Firebase-backed user profiles, roles, and admin-managed user creation will work correctly.

Recommended database ID:

- `(default)`

Recommended collections for this app:

- `schemes`
- `buildings`
- `units`
- `meters`
- `cycles`
- `readings`
- `users`
- `activities`

### Recommended Firestore Rules

Replace the current deny-all rules with the following baseline ruleset:

```javascript
rules_version = '2';

service cloud.firestore {
	match /databases/{database}/documents {
		function isSignedIn() {
			return request.auth != null;
		}

		function userDocPath() {
			return /databases/$(database)/documents/users/$(request.auth.uid);
		}

		function userDoc() {
			return get(userDocPath());
		}

		function userProfileExists() {
			return isSignedIn() && exists(userDocPath());
		}

		function isActiveUser() {
			return userProfileExists() && userDoc().data.status == 'active';
		}

		function isAdmin() {
			return isActiveUser() && userDoc().data.role == 'admin';
		}

		function isFieldWorker() {
			return isActiveUser() && (
				userDoc().data.role == 'field_worker' ||
				userDoc().data.role == 'admin'
			);
		}

		function isViewerOrBetter() {
			return isActiveUser() && (
				userDoc().data.role == 'viewer' ||
				userDoc().data.role == 'field_worker' ||
				userDoc().data.role == 'admin'
			);
		}

		function isOwnUserDoc(userId) {
			return isSignedIn() && request.auth.uid == userId;
		}

		function createsOwnViewerProfile(userId) {
			return isOwnUserDoc(userId)
				&& request.resource.data.email == request.auth.token.email
				&& request.resource.data.role == 'viewer'
				&& request.resource.data.status == 'active';
		}

		match /schemes/{schemeId} {
			allow read: if isViewerOrBetter();
			allow write: if isAdmin();
		}

		match /buildings/{buildingId} {
			allow read: if isViewerOrBetter();
			allow write: if isAdmin();
		}

		match /units/{unitId} {
			allow read: if isViewerOrBetter();
			allow write: if isAdmin();
		}

		match /meters/{meterId} {
			allow read: if isViewerOrBetter();
			allow write: if isAdmin();
		}

		match /cycles/{cycleId} {
			allow read: if isViewerOrBetter();
			allow write: if isAdmin();
		}

		match /readings/{readingId} {
			allow read: if isViewerOrBetter();
			allow create, update: if isFieldWorker();
			allow delete: if isAdmin();
		}

		match /users/{userId} {
			allow read: if isAdmin() || isOwnUserDoc(userId);

			allow create: if isAdmin() || createsOwnViewerProfile(userId);

			allow update: if isAdmin() || (
				isOwnUserDoc(userId)
				&& isActiveUser()
				&& request.resource.data.role == resource.data.role
				&& request.resource.data.status == resource.data.status
			);

			allow delete: if false;
		}

		match /activities/{activityId} {
			allow read: if isAdmin();
			allow create: if isActiveUser()
				&& request.resource.data.userId == request.auth.uid;
			allow update, delete: if isAdmin();
		}

		match /{document=**} {
			allow read, write: if false;
		}
	}
}
```

### What These Rules Assume

These rules assume each authenticated registered user has a Firestore profile document in:

```text
users/{firebaseAuthUid}
```

And that the profile document contains at least:

```javascript
{
	email: "user@example.com",
	name: "User Name",
	role: "viewer" | "field_worker" | "admin",
	status: "active"
}
```

### Important Notes

1. The first admin profile may need to be created manually if no admin user document exists yet.
2. These rules do not yet support guest readers writing directly to Firestore.
3. If you want guest readers to submit directly into Firestore later, use Firebase Anonymous Auth or a Cloud Function / callable endpoint.
4. These are baseline rules for the current app shape, not the final least-privilege model.

### 3. Firebase Storage

Recommended usage:

- meter photos
- dispute evidence images
- imported historical source documents
- generated export packs if cloud export history is later required

## Planned Migration Order

### Phase 1. Firebase bootstrap

Completed:

- Firebase app config added
- Auth, Firestore, and Storage service exports added

### Phase 2. Auth migration

Next implementation target:

- replace localStorage session handling in [assets/auth.js](assets/auth.js)
- move registered users into Firebase Auth + Firestore user profiles
- keep guest-reader flow but store guest submissions against Firestore readings

### Phase 3. Shared data migration

Next after auth:

- replace localStorage reads/writes in [assets/storage.js](assets/storage.js)
- move schemes, buildings, units, meters, cycles, and readings into Firestore
- preserve current entity shape as closely as possible to reduce UI churn

### Phase 4. Photo migration

- move meter photos from inline local data URLs to Firebase Storage object paths
- store only file metadata and download URLs in Firestore readings

## Suggested Firestore Structure

Use top-level collections first to keep the migration simple:

```text
schemes/{schemeId}
buildings/{buildingId}
units/{unitId}
meters/{meterId}
cycles/{cycleId}
readings/{readingId}
users/{userId}
activities/{activityId}
```

Key linking fields remain the same as the current app model:

- `scheme_id`
- `building_id`
- `unit_id`
- `meter_id`
- `cycle_id`

## Suggested Storage Paths

```text
meter-photos/{schemeId}/{cycleId}/{meterId}/{timestamp}.jpg
dispute-evidence/{schemeId}/{cycleId}/{meterId}/{timestamp}.jpg
source-documents/{schemeId-or-upload-batch}/{filename}
exports/{schemeId}/{cycleId}/{filename}
```

## Practical Next Step

The clean next implementation step is:

1. Create a Firebase-backed auth layer.
2. Add a dual-mode storage adapter that can read/write localStorage or Firestore.
3. Migrate QR reader capture to save readings directly into Firestore.

## Important Constraint

Firebase Storage alone will not solve multiplatform capture.

You need:

- Firebase Auth for user identity
- Firestore for shared app records
- Firebase Storage for photos and files

Without Firestore, the phone and dashboard would still not share the same reading records.