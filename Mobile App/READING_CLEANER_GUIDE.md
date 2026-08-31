# Reading Cleaner - How to Add Rules

The `reading_cleaner.dart` file handles building-specific data cleaning for meter readings before they're uploaded to Firebase.

## How It Works

1. When a reading is uploaded, `ReadingCleaner.clean()` is called
2. The cleaner detects which building it is
3. It applies building-specific transformation rules
4. The cleaned value is saved as `readingValue`
5. The original is preserved as `rawReadingValue` for audit

## Adding Phanda Lodge Rules

Open `lib/reading_cleaner.dart` and edit the `_cleanPhandaLodge()` function.

### Example 1: Missing 10th Place Digit

If Phanda Lodge readings are captured as `1234` but should be `12340`:

```dart
static String _cleanPhandaLodge(String label, String meterType, String value) {
  String cleaned = value.trim().replaceAll(RegExp(r'\s+'), '');
  
  // Remove any existing decimals
  cleaned = cleaned.replaceAll('.', '');
  
  // Add the missing 10th place digit
  if (!cleaned.endsWith('0')) {
    cleaned = '${cleaned}0';
  }
  
  return cleaned;
}
```

### Example 2: Standardize Decimal Position

If readings need a decimal with 1 digit after (e.g., `12345` → `1234.5`):

```dart
static String _cleanPhandaLodge(String label, String meterType, String value) {
  String cleaned = value.trim().replaceAll(RegExp(r'\s+'), '');
  cleaned = cleaned.replaceAll('.', ''); // Remove existing decimals
  
  // Add decimal point (last digit is tenths place)
  if (cleaned.length >= 2) {
    final intPart = cleaned.substring(0, cleaned.length - 1);
    final decPart = cleaned.substring(cleaned.length - 1);
    cleaned = '$intPart.$decPart';
  }
  
  return cleaned;
}
```

### Example 3: Meter-Specific Rules

If certain meters need different handling:

```dart
static String _cleanPhandaLodge(String label, String meterType, String value) {
  String cleaned = value.trim();
  
  // Bulk meter uses 2 decimal places
  if (label.toLowerCase().contains('bulk')) {
    cleaned = cleaned.replaceAll('.', '');
    if (cleaned.length >= 3) {
      final intPart = cleaned.substring(0, cleaned.length - 2);
      final decPart = cleaned.substring(cleaned.length - 2);
      cleaned = '$intPart.$decPart';
    }
  }
  // Unit meters use 1 decimal place
  else {
    cleaned = cleaned.replaceAll('.', '');
    if (cleaned.length >= 2) {
      final intPart = cleaned.substring(0, cleaned.length - 1);
      final decPart = cleaned.substring(cleaned.length - 1);
      cleaned = '$intPart.$decPart';
    }
  }
  
  return cleaned;
}
```

## Testing Your Rules

Before deploying to the field:

1. Add your rules to `_cleanPhandaLodge()`
2. Rebuild the app: `flutter build apk --release`
3. Test with sample readings:
   - Capture a few test readings with intentionally "wrong" formats
   - Check Firebase to verify the `readingValue` is cleaned correctly
   - Compare with `rawReadingValue` to see the transformation

## Common Cleaning Operations

```dart
// Remove all whitespace
cleaned = cleaned.replaceAll(RegExp(r'\s+'), '');

// Remove all decimals
cleaned = cleaned.replaceAll('.', '');

// Pad with leading zeros (minimum 5 digits)
cleaned = cleaned.padLeft(5, '0');

// Add decimal point before last N digits
final intPart = cleaned.substring(0, cleaned.length - N);
final decPart = cleaned.substring(cleaned.length - N);
cleaned = '$intPart.$decPart';
```
