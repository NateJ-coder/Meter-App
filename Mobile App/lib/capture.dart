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
  final String reviewNote;
  // Warnings computed silently at save time (below-previous, zero, unchanged,
  // 10x-previous, missing decimal). Never shown as a blocking prompt on the
  // reader's device - they're surfaced instead as a flag on the office
  // dashboard, per Nate's steer (2026-09).
  final List<String> reviewWarnings;
  final bool reviewAcknowledged;
  bool readingSynced; // true once the reading value has reached Firestore, independent of the photo

  // Whether [label] was picked from the building's canonical meter list
  // (true) or typed free-hand because it wasn't found there (false). A
  // free-hand label is still saved as-is (never silently rewritten) but
  // gets flagged for office review, since that's the #1 source of the
  // "GEN 47" / "GEN47" / "GEN UNIT 47" style drift found in the field audit.
  final bool labelConfirmed;
  // The canonical meter's role ('unit' | 'bulk' | 'common'), when known -
  // drives which reading-cleaning rules apply. Empty when the label wasn't
  // matched to the registry (free-hand entry).
  final String meterRole;

  // "Unable to read" outcome: an explicit alternative to typing a reading,
  // for locked/no-access/faulty/obscured meters, instead of the meter
  // silently going uncaptured or a fabricated value being typed just to
  // get past validation.
  final bool isUnreadable;
  final String unreadableReason;
  final String unreadableNote;

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
    this.reviewNote = '',
    this.reviewWarnings = const [],
    this.reviewAcknowledged = false,
    this.readingSynced = false,
    this.labelConfirmed = true,
    this.meterRole = '',
    this.isUnreadable = false,
    this.unreadableReason = '',
    this.unreadableNote = '',
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
        'reviewNote': reviewNote,
        'reviewWarnings': reviewWarnings,
        'reviewAcknowledged': reviewAcknowledged,
        'readingSynced': readingSynced,
        'labelConfirmed': labelConfirmed,
        'meterRole': meterRole,
        'isUnreadable': isUnreadable,
        'unreadableReason': unreadableReason,
        'unreadableNote': unreadableNote,
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
        reviewNote: json['reviewNote'] as String? ?? '',
        reviewWarnings: (json['reviewWarnings'] as List<dynamic>?)?.cast<String>() ?? const [],
        reviewAcknowledged: json['reviewAcknowledged'] as bool? ?? false,
        readingSynced: json['readingSynced'] as bool? ?? false,
        labelConfirmed: json['labelConfirmed'] as bool? ?? true,
        meterRole: json['meterRole'] as String? ?? '',
        isUnreadable: json['isUnreadable'] as bool? ?? false,
        unreadableReason: json['unreadableReason'] as String? ?? '',
        unreadableNote: json['unreadableNote'] as String? ?? '',
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
