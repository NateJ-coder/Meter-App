import 'package:shared_preferences/shared_preferences.dart';

import 'capture.dart';

/// Persists captured readings locally so nothing is lost if the app is
/// closed before every photo/reading has finished uploading.
class CaptureStore {
  static const _key = 'fuzio_captures_v1';

  static Future<List<Capture>> loadAll() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      return Capture.decodeList(raw);
    } catch (_) {
      return [];
    }
  }

  static Future<void> saveAll(List<Capture> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, Capture.encodeList(items));
  }
}
