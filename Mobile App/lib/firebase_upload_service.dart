import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

import 'capture.dart';
import 'firebase_config.dart';
import 'reading_cleaner.dart';

/// Handles pushing a capture's photo + reading data to Firebase
/// (Storage for the photo, Firestore for the reading record) using
/// plain REST calls against the open project rules.
class FirebaseUploadService {
  /// Reading data is always synced first (and independently of the
  /// photo) so a Storage outage never blocks the meter reading itself
  /// from reaching the server.
  static Future<void> uploadCapture(Capture capture, {http.Client? client}) async {
    final connection = client ?? http.Client();
    try {
      if (!capture.readingSynced) {
        await _writeReadingDoc(capture, connection);
        capture.readingSynced = true;
      }
      if (capture.noPhoto) return; // the reason is already on the reading doc
      if (capture.photoUrl == null) {
        final file = capture.hasPhotoFile ? File(capture.photoPath) : null;
        if (file == null || !await file.exists()) {
          // The photo cannot be recovered on this device (the file was
          // removed before it uploaded). Record that on the server instead
          // of retrying every 20 seconds forever and leaving the office to
          // guess; it shows under "Missing photos" on the dashboard.
          capture.noPhoto = true;
          capture.noPhotoReason = 'Photo lost on the phone before upload';
          await _patchFields(capture.id, _noPhotoFields(capture), connection);
          return;
        }
        capture.photoUrl = await _uploadPhoto(capture, file, connection);
      }
      await _patchFields(capture.id, {
        'photoUrl': {'stringValue': capture.photoUrl!},
      }, connection);
    } finally {
      if (client == null) connection.close();
    }
  }

  static Future<String> _uploadPhoto(Capture capture, File file, http.Client client) async {
    final bytes = await file.readAsBytes();

    final objectPath =
        '${_sanitize(capture.building)}/${_sanitize(capture.label)}_${capture.id}.jpg';
    final encodedPath = Uri.encodeComponent(objectPath);

    final uploadUri = Uri.parse(
        '${FirebaseConfig.storageBaseUrl}?uploadType=media&name=$encodedPath&key=${FirebaseConfig.apiKey}');

    final uploadResponse = await client
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
  static Future<void> _writeReadingDoc(Capture capture, http.Client client) async {
    // Clean the reading value using building-specific (or, for the other
    // 10 buildings, meter-role-aware generic) rules. Skipped entirely for
    // an "unable to read" capture - there's no numeric value to clean.
    final cleanedValue = capture.isUnreadable
        ? ''
        : ReadingCleaner.clean(
            building: capture.building,
            label: capture.label,
            meterType: capture.meterType,
            rawValue: capture.readingValue,
            meterRole: capture.meterRole,
          );

    // A capture is "flagged" for office attention if it has any silent
    // review warnings, couldn't be read at all, or its label wasn't
    // matched to the building's canonical meter list. The dashboard uses
    // this single field to show a flag icon and sort flagged rows to the
    // top, rather than the reader ever seeing a blocking prompt on-device.
    final flagged = capture.reviewWarnings.isNotEmpty ||
        capture.isUnreadable ||
        !capture.labelConfirmed ||
        capture.noPhoto;

    final fields = {
      'building': {'stringValue': capture.building},
      'label': {'stringValue': capture.label},
      'meterType': {'stringValue': capture.meterType},
      'readingValue': {'stringValue': cleanedValue},
      'rawReadingValue': {'stringValue': capture.readingValue}, // Keep original for audit
      'photoPath': {'stringValue': capture.photoPath},
      'capturedAt': {
        'timestampValue': capture.capturedAt.toUtc().toIso8601String()
      },
      'readerNote': {'stringValue': capture.reviewNote},
      'readerWarnings': {'arrayValue': {'values': capture.reviewWarnings
          .map((warning) => {'stringValue': warning}).toList()}},
      'readerAcknowledged': {'booleanValue': capture.reviewAcknowledged},
      'labelConfirmed': {'booleanValue': capture.labelConfirmed},
      'meterRole': {'stringValue': capture.meterRole},
      'isUnreadable': {'booleanValue': capture.isUnreadable},
      'unreadableReason': {'stringValue': capture.unreadableReason},
      'unreadableNote': {'stringValue': capture.unreadableNote},
      'flagged': {'booleanValue': flagged},
      ..._noPhotoFields(capture),
    };

    await _patchFields(capture.id, fields, client);
  }

  /// Why there is no photo for this reading, as the dashboard reads it.
  /// Written with the reading so the office sees the reason as soon as the
  /// value arrives, and again if the photo file is later found missing.
  static Map<String, dynamic> _noPhotoFields(Capture capture) => {
        'noPhoto': {'booleanValue': capture.noPhoto},
        'noPhotoReason': {'stringValue': capture.noPhotoReason},
        'noPhotoNote': {'stringValue': capture.noPhotoNote},
      };

  static Future<void> _patchFields(String id, Map<String, dynamic> fields, http.Client client) async {
    final docUri = Uri.parse(
        '${FirebaseConfig.firestoreBaseUrl}/${FirebaseConfig.capturesCollection}/$id').replace(
      queryParameters: {
        'key': FirebaseConfig.apiKey,
        'updateMask.fieldPaths': fields.keys.toList(),
      },
    );
    final docResponse = await client
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

