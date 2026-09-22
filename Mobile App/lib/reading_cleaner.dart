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
      case 'hazelmere':
      case 'hzm':
        return _cleanHazelmere(label, meterType, rawValue);
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

  /// Regex for Phanda Lodge's confirmed-whole-number per-unit electricity
  /// sub-meters: literal "PH" + optional space + a 1-3 digit unit number
  /// (e.g. "PH 01", "PH48", "PH 3"). See _cleanPhandaLodge doc below for why
  /// this pattern - and only this pattern - is still safe to decimal-strip.
  static final RegExp _phandaPerUnitSubmeterLabel =
      RegExp(r'^PH\s*0*\d{1,3}$', caseSensitive: false);

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
  /// Reading format for the 48 per-unit electricity sub-meters ("PH 01"
  /// .. "PH 48"): plain whole-number readings, stored as a straight
  /// integer with NO decimal/tenths digit. Confirmed across the full
  /// historical set, values ranged from 2-digit (e.g. 78) up to 7-digit
  /// - all whole numbers, no fractional part anywhere for those meters.
  /// If a reader's raw entry for one of these unit meters does contain a
  /// decimal (e.g. they typed the meter's red "tenths" digit by habit),
  /// that fractional part is dropped rather than kept, to stay consistent
  /// with how every prior reading for these specific meters has been
  /// recorded.
  ///
  /// *** DECIMAL-LOSS BUG FIXED 2026-09 (Phanda Lodge cycle, see
  /// METER_LABEL_CONSISTENCY_GUIDE.md changelog) ***
  /// This rule used to strip the decimal part from EVERY Phanda Lodge
  /// reading, bulk meters included, on the assumption (based only on the
  /// per-unit sub-meter history above) that no Phanda Lodge reading is
  /// ever fractional. That assumption is false for the bulk electricity
  /// meter: it is a multi-register Itron ACE6000 whose kVA-demand and
  /// kvarh-reactive-energy registers routinely display a meaningful
  /// decimal (e.g. "105.80"), and a bulk kWh reading elsewhere has also
  /// been seen with a decimal (e.g. "9460.5"). Under the old rule, a
  /// staff-typed "105.80" for the kVA register was silently stored as
  /// bare "105" - a real data-quality bug, not a formatting nicety - and
  /// would have gone uncaught since the export only ever showed the
  /// cleaned `readingValue`, not `rawReadingValue`.
  ///
  /// Fix: decimal-stripping is now scoped to ONLY the confirmed-whole-
  /// number per-unit electricity sub-meters (label matching "PH" + a
  /// short unit number, e.g. "PH 01".."PH 48" - see
  /// [_phandaPerUnitSubmeterLabel]). Any other label - "Bulk 1", "WATER",
  /// "BULK ELECTRICITY READING", "ELECTRICITY BULK READING", or anything
  /// that doesn't match the confirmed per-unit pattern - now has its
  /// decimal point (if any) preserved rather than dropped. This errs on
  /// the side of keeping a real decimal a reader typed, which is the
  /// safe direction: the confirmed bug was decimals being destroyed, not
  /// decimals being wrongly invented.
  static String _cleanPhandaLodge(String label, String meterType, String value) {
    String cleaned = value.trim();

    // Strip whitespace and thousands separators a reader might type
    // (e.g. "2,739" or "2 739").
    cleaned = cleaned.replaceAll(RegExp(r'[\s,]'), '');

    final isPerUnitSubmeter =
        _phandaPerUnitSubmeterLabel.hasMatch(label.trim());

    if (isPerUnitSubmeter) {
      // Confirmed whole-number-only meter: drop any decimal point and
      // whatever follows it (see class doc above).
      final dotIndex = cleaned.indexOf('.');
      if (dotIndex != -1) {
        cleaned = cleaned.substring(0, dotIndex);
      }
      // Keep digits only, guarding against any other stray character.
      cleaned = cleaned.replaceAll(RegExp(r'[^0-9]'), '');
    } else {
      // Bulk meter (or any label we don't recognize as a confirmed
      // whole-number unit sub-meter): keep a decimal point if present -
      // do NOT assume whole numbers here (see 2026-09 bug fix note
      // above). Keep digits and at most one decimal point.
      final firstDot = cleaned.indexOf('.');
      if (firstDot != -1) {
        final intPart = cleaned.substring(0, firstDot).replaceAll(RegExp(r'[^0-9]'), '');
        final fracPart = cleaned.substring(firstDot + 1).replaceAll(RegExp(r'[^0-9]'), '');
        cleaned = fracPart.isNotEmpty ? '$intPart.$fracPart' : intPart;
      } else {
        cleaned = cleaned.replaceAll(RegExp(r'[^0-9]'), '');
      }
    }

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

  /// Matches Hazelmere's secondary "staff" sub-meters tied to units 17, 39
  /// and 51 - on-site physical labels read "METER STAFF 1,1" / "ROOM 1 IS
  /// UNIT 17" etc (CBi/Schenker meters), and they show up in the Utility
  /// Dash as separate "** HM 17" / "** HM 39" / "** HM 51" rows alongside
  /// each unit's normal "HM 17" / "HM 39" / "HM 51" row. As of the 2026-09
  /// cycle these three meters aren't yet their own entries in this app's
  /// meter database, so field capture is expected to key them with "STAFF"
  /// somewhere in the label (e.g. "STAFF 1,1", "HM 17 STAFF") until they
  /// are formally added - match on that rather than an exact label.
  static final RegExp _hazelmereStaffSubmeterLabel =
      RegExp(r'staff', caseSensitive: false);

  /// Hazelmere-specific cleaning rules.
  ///
  /// Confirmed against two full cycles of Utility Dash history (every
  /// "HM NN" unit row, the "Com Store"/"Bulk"/"SQ Geyser"/"Com07 - Public"
  /// rows, and every "G##"/"ST##" small pulse-counter sub-meter row) plus
  /// direct photo inspection during the 2026-09 cycle: EVERY reading ever
  /// recorded for this building, across every meter family, is a plain
  /// whole number - no decimal has ever been stored.
  ///
  /// That's true even though several physical meter types display what
  /// looks like a fractional digit:
  ///   - The Mitsubishi BF-32/BF-34 mechanical meters (most "HM NN" unit
  ///     meters) have a genuine analog red "1/10" pointer, printed as such
  ///     on the meter face. Tradition has always DROPPED this tenths
  ///     digit - only the 5 main black digits are kept.
  ///   - Voltex/MBI digital-odometer replacement meters (seen this cycle
  ///     on several units after a mid-life meter swap) have no decimal at
  ///     all - the face is printed with plain place-value labels
  ///     ("10000"/"1000"/"100"/"10"/"1"), confirming every digit shown is
  ///     a whole-number place, not a fraction.
  ///   - The small "G##"/"ST##" ACDC pulse-counter sub-meters likewise
  ///     have no decimal; a highlighted/colored digit there is just an
  ///     ordinary digit position (occasionally it's a fixed direction
  ///     arrow icon rather than a digit at all, but that's a capture-time
  ///     judgment call, not something string-cleaning can fix).
  ///
  /// The one confirmed exception, found this cycle: the three CBi/Schenker
  /// "staff" secondary sub-meters tied to units 17, 39 and 51 (see
  /// [_hazelmereStaffSubmeterLabel]). For those specific three meters the
  /// final colored digit IS a genuine ones-place digit, not a dropped
  /// tenths pointer - cross-checked against 8 cycles of "** HM 17" /
  /// "** HM 39" / "** HM 51" history, keeping that digit (rather than
  /// dropping it) was the only reading that matched each row's established
  /// consumption trend. So for a label that looks like one of these staff
  /// meters, a captured decimal digit is APPENDED onto the whole number
  /// instead of being dropped.
  static String _cleanHazelmere(String label, String meterType, String value) {
    String cleaned = value.trim();

    // Strip whitespace and thousands separators a reader might type
    // (e.g. "2,739" or "2 739").
    cleaned = cleaned.replaceAll(RegExp(r'[\s,]'), '');

    final isStaffSubmeter = _hazelmereStaffSubmeterLabel.hasMatch(label.trim());

    final dotIndex = cleaned.indexOf('.');
    if (dotIndex != -1) {
      if (isStaffSubmeter) {
        // Keep the digit(s) after the point, just without the point
        // itself - e.g. "3371" (whole) + a captured ".1" -> "33711" is
        // wrong; what we want is the decimal DIGIT folded in as the new
        // final integer digit, e.g. "337" + ".1" -> "3371".
        final intPart = cleaned.substring(0, dotIndex).replaceAll(RegExp(r'[^0-9]'), '');
        final fracPart = cleaned.substring(dotIndex + 1).replaceAll(RegExp(r'[^0-9]'), '');
        cleaned = intPart + fracPart;
      } else {
        // Confirmed whole-number-only meter: drop the decimal point and
        // whatever follows it (the analog tenths pointer, if any).
        cleaned = cleaned.substring(0, dotIndex);
      }
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
