import 'package:shared_preferences/shared_preferences.dart';

import 'capture.dart';

/// Persists captured readings locally so nothing is lost if the app is
/// closed before every photo/reading has finished uploading.
class CaptureStore {
  static const _key = 'fuzio_captures_v1';
  static Future<void> _writes = Future<void>.value();
  static int _inFlight = 0;

  static Future<List<Capture>> loadAll() async {
    // Only wait when a write is actually running; a completed future from
    // an earlier context (or test) must not be awaited again.
    if (_inFlight > 0) await _writes;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    return Capture.decodeList(raw);
  }

  static Future<void> saveCapture(Capture capture) {
    final snapshot = Capture.fromJson(capture.toJson());
    // Writes run one at a time. Chain onto the running write only; a
    // finished one is never reused (its completion belongs to the context
    // it ran in, which in tests is a zone that no longer runs callbacks).
    final previous = _inFlight > 0 ? _writes : Future<void>.value();
    _inFlight++;
    final operation = previous.then((_) async {
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(_key);
        final items = raw == null || raw.isEmpty ? <Capture>[] : Capture.decodeList(raw);
        final index = items.indexWhere((item) => item.id == snapshot.id);
        if (index < 0) {
          items.add(snapshot);
        } else {
          items[index] = snapshot;
        }
        if (!await prefs.setString(_key, Capture.encodeList(items))) {
          throw StateError('Could not save the reading on this device.');
        }
      } finally {
        _inFlight--;
      }
    });
    _writes = operation.then<void>((_) {}, onError: (Object error, StackTrace stack) {});
    return operation;
  }
}
