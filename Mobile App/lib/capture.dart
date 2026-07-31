import 'dart:convert';

enum CaptureStatus { pending, uploading, done, failed }

/// A single meter reading capture: label, type, value and a local photo,
/// tracked through its upload lifecycle to Firebase.
class Capture {
  final String id;
  final String building;
  String label;
  String meterType; // Electricity | Water
  String readingValue;
  String photoPath; // local file path
  DateTime capturedAt;
  CaptureStatus status;
  String? photoUrl; // set once uploaded
  String? error;
  bool readingSynced; // true once the reading value has reached Firestore, independent of the photo

  Capture({
    required this.id,
    required this.building,
    required this.label,
    required this.meterType,
    required this.readingValue,
    required this.photoPath,
    required this.capturedAt,
    this.status = CaptureStatus.pending,
    this.photoUrl,
    this.error,
    this.readingSynced = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'building': building,
        'label': label,
        'meterType': meterType,
        'readingValue': readingValue,
        'photoPath': photoPath,
        'capturedAt': capturedAt.toIso8601String(),
        'status': status.name,
        'photoUrl': photoUrl,
        'error': error,
        'readingSynced': readingSynced,
      };

  factory Capture.fromJson(Map<String, dynamic> json) => Capture(
        id: json['id'] as String,
        building: json['building'] as String,
        label: json['label'] as String,
        meterType: json['meterType'] as String,
        readingValue: json['readingValue'] as String,
        photoPath: json['photoPath'] as String,
        capturedAt: DateTime.parse(json['capturedAt'] as String),
        status: CaptureStatus.values.firstWhere(
          (s) => s.name == json['status'],
          orElse: () => CaptureStatus.pending,
        ),
        photoUrl: json['photoUrl'] as String?,
        error: json['error'] as String?,
        readingSynced: json['readingSynced'] as bool? ?? false,
      );

  static String encodeList(List<Capture> items) =>
      jsonEncode(items.map((c) => c.toJson()).toList());

  static List<Capture> decodeList(String raw) {
    final data = jsonDecode(raw) as List<dynamic>;
    return data
        .map((e) => Capture.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
