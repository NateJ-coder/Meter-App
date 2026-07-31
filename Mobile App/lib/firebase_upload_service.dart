import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

import 'capture.dart';
import 'firebase_config.dart';

/// Handles pushing a capture's photo + reading data to Firebase
/// (Storage for the photo, Firestore for the reading record) using
/// plain REST calls against the open project rules.
class FirebaseUploadService {
  /// Reading data is always synced first (and independently of the
  /// photo) so a Storage outage never blocks the meter reading itself
  /// from reaching the server.
  static Future<void> uploadCapture(Capture capture) async {
    final file = File(capture.photoPath);
    String? photoUrl;
    String? photoError;

    if (await file.exists()) {
      try {
        photoUrl = await _uploadPhoto(capture, file);
      } catch (e) {
        photoError = e.toString();
      }
    } else {
      photoError = 'Photo file missing on device';
    }

    await _writeReadingDoc(capture, photoUrl);
    capture.readingSynced = true;
    capture.photoUrl = photoUrl;

    if (photoUrl == null) {
      throw Exception('Reading synced, photo still pending: $photoError');
    }
  }

  static Future<String> _uploadPhoto(Capture capture, File file) async {
    final bytes = await file.readAsBytes();

    final objectPath =
        '${_sanitize(capture.building)}/${_sanitize(capture.label)}_${capture.id}.jpg';
    final encodedPath = Uri.encodeComponent(objectPath);

    final uploadUri = Uri.parse(
        '${FirebaseConfig.storageBaseUrl}?uploadType=media&name=$encodedPath&key=${FirebaseConfig.apiKey}');

    final uploadResponse = await http
        .post(uploadUri,
            headers: {'Content-Type': 'image/jpeg'}, body: bytes)
        .timeout(const Duration(seconds: 30));

    if (uploadResponse.statusCode != 200) {
      throw Exception(
          'Photo upload failed (${uploadResponse.statusCode}): ${uploadResponse.body}');
    }

    final uploadJson = jsonDecode(uploadResponse.body) as Map<String, dynamic>;
    final token = (uploadJson['downloadTokens'] as String?)?.split(',').first;
    return '${FirebaseConfig.storageBaseUrl}/$encodedPath?alt=media${token != null ? '&token=$token' : ''}';
  }

  /// PATCH upserts the document whether or not it already exists, so
  /// this is safe to call repeatedly (retry-friendly).
  static Future<void> _writeReadingDoc(Capture capture, String? photoUrl) async {
    final docUri = Uri.parse(
        '${FirebaseConfig.firestoreBaseUrl}/${FirebaseConfig.capturesCollection}/${capture.id}?key=${FirebaseConfig.apiKey}');

    final fields = {
      'building': {'stringValue': capture.building},
      'label': {'stringValue': capture.label},
      'meterType': {'stringValue': capture.meterType},
      'readingValue': {'stringValue': capture.readingValue},
      'photoPath': {'stringValue': capture.photoPath},
      'capturedAt': {
        'timestampValue': capture.capturedAt.toUtc().toIso8601String()
      },
      if (photoUrl != null) 'photoUrl': {'stringValue': photoUrl},
    };

    final docResponse = await http
        .patch(docUri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'fields': fields}))
        .timeout(const Duration(seconds: 30));

    if (docResponse.statusCode != 200) {
      throw Exception(
          'Reading save failed (${docResponse.statusCode}): ${docResponse.body}');
    }
  }

  static String _sanitize(String value) =>
      value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9 _-]'), '').replaceAll(' ', '_');
}

