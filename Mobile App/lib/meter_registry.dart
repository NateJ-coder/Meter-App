import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

/// One canonical meter entry for a building, as recorded in Fuzio's
/// building registry (Buildings/app-database/*.app-database.json on the
/// admin side, bundled here as assets/meter_registry.json).
class MeterOption {
  final String number; // canonical label, e.g. "GEN 47", "Bulk 1"
  final String type; // 'Electricity' | 'Water'
  final String role; // 'unit' | 'bulk' | 'common'

  const MeterOption({required this.number, required this.type, required this.role});

  factory MeterOption.fromJson(Map<String, dynamic> json) => MeterOption(
        number: json['number'] as String? ?? '',
        type: json['type'] as String? ?? 'Electricity',
        role: json['role'] as String? ?? 'unit',
      );
}

/// Loads and caches the bundled canonical meter list so field staff can
/// pick a meter's real registered label instead of free-typing it, which
/// is what causes the same physical meter to end up recorded as
/// "GEN 47" / "GEN47" / "GEN UNIT 47" across different capture sessions.
///
/// This is intentionally a bundled asset rather than a live Firestore
/// read - see scripts/generate-mobile-meter-registry.mjs for why.
class MeterRegistry {
  static Map<String, List<MeterOption>>? _cache;

  static Future<Map<String, List<MeterOption>>> _load() async {
    if (_cache != null) return _cache!;
    try {
      final raw = await rootBundle.loadString('assets/meter_registry.json');
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      _cache = decoded.map((building, meters) => MapEntry(
            building,
            (meters as List<dynamic>)
                .map((m) => MeterOption.fromJson(m as Map<String, dynamic>))
                .toList(),
          ));
    } catch (_) {
      // Missing/unreadable asset (e.g. a building with no registry file
      // yet, like Transvalia) should never block capture - fall back to
      // an empty list so the screen degrades to free-text entry.
      _cache = {};
    }
    return _cache!;
  }

  /// Canonical meters for [building], optionally filtered to [meterType]
  /// ("Electricity"/"Water"). Empty list if the building isn't in the
  /// bundled registry yet.
  static Future<List<MeterOption>> forBuilding(String building, {String? meterType}) async {
    final all = await _load();
    final meters = all[building] ?? const [];
    if (meterType == null) return meters;
    return meters.where((m) => m.type == meterType).toList();
  }
}
