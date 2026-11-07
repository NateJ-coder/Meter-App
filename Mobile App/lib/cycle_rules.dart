import 'capture.dart';
import 'meter_registry.dart';

/// Why a meter has no reading. Used for a single "unable to read" capture
/// and for recording every outstanding meter at once before leaving a
/// building, so a missed meter always reaches the office with a reason.
const List<String> notReadReasons = [
  'Locked / no access',
  'Meter faulty or damaged',
  'Meter obscured or hidden',
  'Meter removed or replaced',
  'Could not find the meter',
  'Ran out of time - will return',
  'Other',
];

/// Reasons that need a note before they are accepted.
bool reasonNeedsNote(String? reason) => reason == 'Other' || reason == 'Could not find the meter';

/// Rules for one reading cycle (a calendar month) of one building:
/// which registered meters are still outstanding, and whether a label has
/// already been captured. Pure functions so they can be unit-tested.
///
/// Why: in the October 2026 cycle whole meters were missed (Hazelmere G3,
/// L'Montagne 50) and others were captured twice under different labels
/// ("QG 41" for unit 25's water meter), which the office only discovered
/// while reconciling the workbook. The app now refuses to leave a building
/// until every registered meter has a reading (or an "unable to read"), and
/// never offers a meter that was already captured this month.
class CycleRules {
  /// The cycle a capture belongs to: its calendar month, e.g. "2026-10".
  static String cycleKey(DateTime at) =>
      '${at.year}-${at.month.toString().padLeft(2, '0')}';

  /// Matching key for a meter label: case- and whitespace-insensitive, so
  /// "QG  38A", "qg 38a" and "QG 38A" are the same meter.
  static String labelKey(String label) =>
      label.trim().toUpperCase().replaceAll(RegExp(r'\s+'), ' ');

  /// Captures of [building] that fall in the same cycle as [now].
  static List<Capture> cycleCaptures(List<Capture> all, String building, DateTime now) {
    final cycle = cycleKey(now);
    final wanted = building.trim().toLowerCase();
    return all
        .where((c) =>
            c.building.trim().toLowerCase() == wanted && cycleKey(c.capturedAt) == cycle)
        .toList();
  }

  /// A meter is done once any capture this cycle matches its label and type;
  /// an "unable to read" capture counts, so a locked meter does not block the
  /// reader forever.
  static bool isCaptured(MeterOption meter, Iterable<Capture> cycle, {String? excludeId}) {
    final key = labelKey(meter.number);
    return cycle.any((c) =>
        c.id != excludeId && c.meterType == meter.type && labelKey(c.label) == key);
  }

  /// Registered meters of [meterType] that have not been captured yet this
  /// cycle. The same label can still be offered under the other type: a
  /// unit with both an electricity and a water meter is captured once per
  /// type, never twice for one type.
  static List<MeterOption> availableMeters(
    List<MeterOption> registry,
    String meterType,
    Iterable<Capture> cycle, {
    String? excludeId,
  }) {
    return registry
        .where((m) => m.type == meterType && !isCaptured(m, cycle, excludeId: excludeId))
        .toList();
  }

  /// The earlier capture this cycle with the same label and type, if any.
  /// Applies to free-typed labels too, so "G3" twice is caught even for a
  /// meter that is not on the registry.
  static Capture? duplicateOf(
    String label,
    String meterType,
    Iterable<Capture> cycle, {
    String? excludeId,
  }) {
    final key = labelKey(label);
    if (key.isEmpty) return null;
    for (final c in cycle) {
      if (c.id != excludeId && c.meterType == meterType && labelKey(c.label) == key) {
        return c;
      }
    }
    return null;
  }

  /// Another meter of the same type already captured this cycle with exactly
  /// the same reading. Two different meters almost never read the same, so
  /// this usually means the same meter was photographed twice under two
  /// labels (Phanda Nov 2026: "PHA 40" was a second shot of meter 42).
  /// Stored as a silent review warning, never a blocking prompt.
  static Capture? sameReadingElsewhere(
    String label,
    String meterType,
    String reading,
    Iterable<Capture> cycle, {
    String? excludeId,
  }) {
    final value = double.tryParse(reading.trim().replaceAll(',', '.'));
    if (value == null || value == 0) return null;
    final key = labelKey(label);
    for (final c in cycle) {
      if (c.id == excludeId || c.isUnreadable || c.meterType != meterType || labelKey(c.label) == key) continue;
      if (double.tryParse(c.readingValue.trim().replaceAll(',', '.')) == value) return c;
    }
    return null;
  }

  /// "Not read" records for [meters]: one unreadable capture per meter, with
  /// the reason and note and no photo, so the office sees why each one is
  /// missing instead of a silent gap.
  static List<Capture> notReadRecords({
    required List<MeterOption> meters,
    required String building,
    required String reason,
    String note = '',
    required DateTime at,
    required String Function() newId,
  }) {
    return meters
        .map((m) => Capture(
              id: newId(),
              building: building,
              label: m.number,
              meterType: m.type,
              readingValue: '',
              photoPath: '',
              capturedAt: at,
              labelConfirmed: true,
              meterRole: m.role,
              isUnreadable: true,
              unreadableReason: reason,
              unreadableNote: note.trim(),
            ))
        .toList();
  }

  /// Progress of [building] for the cycle containing [now].
  static CycleProgress progress({
    required List<MeterOption> registry,
    required List<Capture> all,
    required String building,
    required DateTime now,
  }) {
    final cycle = cycleCaptures(all, building, now);
    final missing = registry.where((m) => !isCaptured(m, cycle)).toList();
    return CycleProgress(
      building: building,
      registered: registry.length,
      captured: cycle.length,
      missing: missing,
    );
  }

  /// Buildings with captures this cycle that are not finished, other than
  /// [except]. Used to stop a reader starting a second building while the
  /// first still has outstanding meters.
  static Future<List<CycleProgress>> unfinishedBuildings({
    required Map<String, List<MeterOption>> registries,
    required List<Capture> all,
    required DateTime now,
    String? except,
  }) async {
    final cycle = cycleKey(now);
    final started = all
        .where((c) => cycleKey(c.capturedAt) == cycle)
        .map((c) => c.building)
        .toSet();
    final result = <CycleProgress>[];
    for (final building in started) {
      if (except != null && building.trim().toLowerCase() == except.trim().toLowerCase()) continue;
      final registry = registries[building] ?? const [];
      if (registry.isEmpty) continue; // nothing to check against (no registry yet)
      final p = progress(registry: registry, all: all, building: building, now: now);
      if (!p.complete) result.add(p);
    }
    result.sort((a, b) => a.building.compareTo(b.building));
    return result;
  }
}

class CycleProgress {
  final String building;
  final int registered;
  final int captured;
  final List<MeterOption> missing;

  const CycleProgress({
    required this.building,
    required this.registered,
    required this.captured,
    required this.missing,
  });

  /// True when the building has no registry to check against, or every
  /// registered meter has a capture (or an "unable to read") this cycle.
  bool get complete => registered == 0 || missing.isEmpty;

  int get done => registered - missing.length;

  /// Short human list of what is outstanding, e.g. "QG 05 (Water), G3 (Electricity) and 12 more".
  String describeMissing({int limit = 6}) {
    final names = missing.map((m) => '${m.number} (${m.type})').toList();
    if (names.length <= limit) return names.join(', ');
    return '${names.take(limit).join(', ')} and ${names.length - limit} more';
  }
}
