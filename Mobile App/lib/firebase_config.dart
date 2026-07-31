/// Firebase project connection details, shared with the web dashboard
/// (see assets/firebase.js). Access is via plain REST calls so this app
/// needs no native Firebase SDK / google-services.json setup.
class FirebaseConfig {
  static const apiKey = 'AIzaSyBz89GtOjx7c__t1pu9yD2ata9-4ITZilk';
  static const projectId = 'meter-app-36307';
  static const storageBucket = 'meter-app-36307.firebasestorage.app';

  static const firestoreBaseUrl =
      'https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents';
  static const storageBaseUrl =
      'https://firebasestorage.googleapis.com/v0/b/$storageBucket/o';

  /// Firestore collection that stores mobile capture readings.
  static const capturesCollection = 'mobile_captures';
}
