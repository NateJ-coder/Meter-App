import 'capture.dart';
import 'meter_registry.dart';

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

  /// Registered meters that a free-typed [label] probably meant, so a reader
  /// who types "5", "unit 05" or "qg5" is offered "QG 05" instead of the
  /// office later finding two captures for one meter under different names.
  /// An exact match ignores case, spacing, punctuation and leading zeros
  /// ("qg5" is "QG 05"); a unit meter also matches on its unit number alone
  /// ("5", "UNIT 05", "No 5") when nothing matches exactly. Bulk and common
  /// meters never match on a bare number, so "1" does not suggest "Bulk 1".
  static List<MeterOption> suggestions(String label, Iterable<MeterOption> options, {int limit = 3}) {
    final identity = _identityKey(label);
    if (identity.isEmpty) return const [];
    final unit = _unitKey(label);
    final exact = <MeterOption>[];
    final loose = <MeterOption>[];
    for (final option in options) {
      if (_identityKey(option.number) == identity) {
        exact.add(option);
      } else if (unit.isNotEmpty && option.role == 'unit' && _unitKey(option.number) == unit) {
        loose.add(option);
      }
    }
    return (exact.isNotEmpty ? exact : loose).take(limit).toList();
  }

  /// "QG 05" -> "QG5", "GEN UNIT 030" -> "GENUNIT30", "Bulk 1" -> "BULK1".
  static String _identityKey(String label) => labelKey(label)
      .replaceAll(RegExp(r'[^A-Z0-9]'), '')
      .replaceAllMapped(RegExp(r'(^|[A-Z])0+(?=\d)'), (m) => m.group(1)!);

  /// Unit number and suffix of a unit-style label: "QG 05" -> "5",
  /// "HM 28 A" -> "28A", "unit 7" -> "7", "5" -> "5"; empty for anything
  /// else ("Bulk 1", "Com Store 1", "G3 Garage").
  static String _unitKey(String label) {
    final match = RegExp(r'^(?:[A-Z]{1,4}\s*)?(?:(?:UNIT|NO|FLAT)\s*)?0*(\d+)\s*([A-Z]?)$')
        .firstMatch(labelKey(label));
    return match == null ? '' : '${match.group(1)}${match.group(2)}';
  }

  /// Whether a capture can be saved as it stands. A reading needs a photo
  /// unless the reader has recorded why none could be taken; an "unable to
  /// read" meter may be saved without one (there is often nothing to
  /// photograph behind a locked gate), the reason for no access doubles
  /// as the reason for no photo.
  static String? photoProblem({
    required bool hasPhoto,
    required bool noPhoto,
    required String noPhotoReason,
    required String noPhotoNote,
    required bool isUnreadable,
  }) {
    if (hasPhoto) return null;
    if (isUnreadable) return null;
    if (!noPhoto) return 'Please take a photo of the meter, or tick "No photo possible" and say why.';
    if (noPhotoReason.trim().isEmpty) return 'Please choose why no photo could be taken.';
    if (noPhotoReason == 'Other' && noPhotoNote.trim().isEmpty) {
      return 'Please add a note explaining why no photo could be taken.';
    }
    return null;
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
