/// Building-specific data cleaning rules for meter readings.
///
/// Configure how readings should be normalized before upload to ensure
/// consistency across different capture sessions and buildings.
class ReadingCleaner {
  /// Clean and normalize a meter reading value before upload.
  ///
  /// Apply building-specific transformations to handle:
  /// - Missing decimal places
  /// - Extra whitespace
  /// - Inconsistent formatting
  /// - Leading zeros
  ///
  /// [building] - The building name (e.g., "Genesis", "Phanda Lodge")
  /// [label] - The meter label (e.g., "Unit 1", "Bulk Meter")
  /// [meterType] - The meter type ("Electricity" or "Water")
  /// [rawValue] - The raw reading value captured from the photo
  ///
  /// Returns the cleaned reading value ready for storage.
  static String clean({
    required String building,
    required String label,
    required String meterType,
    required String rawValue,
  }) {
    final buildingKey = building.trim().toLowerCase();

    // Apply building-specific rules
    switch (buildingKey) {
      case 'genesis':
        return _cleanGenesis(label, meterType, rawValue);
      case 'phanda lodge':
      case 'phanda':
        return _cleanPhandaLodge(label, meterType, rawValue);
      default:
        return _cleanDefault(rawValue);
    }
  }

  /// Default cleaning: trim whitespace and normalize format
  static String _cleanDefault(String value) {
    return value.trim();
  }

  /// Genesis building-specific cleaning rules
  static String _cleanGenesis(String label, String meterType, String value) {
    // Example: Genesis meters always use 5 decimal places
    // Uncomment and modify as needed:
    //
    // String cleaned = value.trim().replaceAll(RegExp(r'\s+'), '');
    //
    // // If no decimal point, assume it's missing the decimal places
    // if (!cleaned.contains('.')) {
    //   // e.g., "12345" -> "123.45" (last 2 digits are decimal)
    //   if (cleaned.length >= 2) {
    //     final intPart = cleaned.substring(0, cleaned.length - 2);
    //     final decPart = cleaned.substring(cleaned.length - 2);
    //     cleaned = '$intPart.$decPart';
    //   }
    // }
    //
    // return cleaned;

    // For now, just trim
    return value.trim();
  }

  /// Phanda Lodge-specific cleaning rules.
  ///
  /// Layout confirmed against "Phanda readings - data descriptin.xlsx"
  /// (two months of historical readings, Jun/Jul 2026):
  ///   - Electricity sub-meters are labelled "PH 01" .. "PH 48"
  ///     (literal "PH" + space + 2-digit, zero-padded unit number).
  ///   - The electricity bulk/check meter is labelled "Bulk 1".
  ///   - Water is a single bulk meter labelled "WATER" - there are no
  ///     individually sub-metered water readings for this building.
  ///
  /// Reading format (both Electricity and Water, every meter including
  /// the bulk meters): plain whole-number readings, stored as a
  /// straight integer with NO decimal/tenths digit. Confirmed across the
  /// full historical set, values ranged from 2-digit (e.g. 78) up to
  /// 7-digit (Bulk 1: 3,048,046) - all whole numbers, no fractional part
  /// anywhere. This differs from buildings like Genesis, where a raw
  /// capture is missing an implied decimal point that has to be
  /// reinserted - Phanda Lodge readings are never decimal, so no decimal
  /// point should ever be inserted here. If a reader's raw entry does
  /// contain a decimal (e.g. they typed the meter's red "tenths" digit
  /// by habit), that fractional part is dropped rather than kept, to
  /// stay consistent with how every prior reading for this building has
  /// been recorded.
  static String _cleanPhandaLodge(String label, String meterType, String value) {
    String cleaned = value.trim();

    // Strip whitespace and thousands separators a reader might type
    // (e.g. "2,739" or "2 739").
    cleaned = cleaned.replaceAll(RegExp(r'[\s,]'), '');

    // Drop any decimal point and whatever follows it - Phanda Lodge
    // readings (electricity and water, unit and bulk meters alike) are
    // always whole numbers; see class doc above.
    final dotIndex = cleaned.indexOf('.');
    if (dotIndex != -1) {
      cleaned = cleaned.substring(0, dotIndex);
    }

    // Keep digits only, guarding against any other stray character.
    cleaned = cleaned.replaceAll(RegExp(r'[^0-9]'), '');

    if (cleaned.isEmpty) {
      // Nothing usable left to clean - fall back to the trimmed raw
      // value so the bad entry is still visible for review rather than
      // silently disappearing.
      return value.trim();
    }

    // Strip leading zeros (mechanical dials are often keyed in with
    // leading zeros, e.g. "00078"), but always keep at least one digit
    // so a genuine "0" reading survives.
    cleaned = cleaned.replaceFirst(RegExp(r'^0+(?=\d)'), '');

    return cleaned;
  }
}
