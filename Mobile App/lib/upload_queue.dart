import 'package:flutter/foundation.dart';

import 'capture.dart';
import 'capture_store.dart';
import 'firebase_upload_service.dart';

/// What is still waiting to reach the server, across every building.
class PendingSummary {
  final int readings; // reading value not on the server yet
  final int photos; // reading on the server, photo still to upload
  final int failed; // last attempt failed (will be retried)

  const PendingSummary({required this.readings, required this.photos, required this.failed});

  bool get isEmpty => readings == 0 && photos == 0;

  String describe() {
    final parts = <String>[];
    if (readings > 0) parts.add('$readings reading${readings == 1 ? '' : 's'}');
    if (photos > 0) parts.add('$photos photo${photos == 1 ? '' : 's'}');
    return parts.join(' and ');
  }
}

/// One upload queue shared by every screen.
///
/// Until v1.0.6 pending uploads were only retried while the reader had a
/// building's capture list open; closing it (to pick the next building, or
/// to put the phone away) silently stopped the retries, and the office saw
/// readings with no photo days later. The queue now runs from the home
/// screen too and tells the reader what is still waiting.
class UploadQueue {
  static final Set<String> _active = {};
  static bool _retrying = false;

  /// Bumps after every status change so screens can refresh their lists.
  static final ValueNotifier<int> version = ValueNotifier<int>(0);

  static bool isUploading(String id) => _active.contains(id);

  static PendingSummary summarize(Iterable<Capture> all) {
    var readings = 0, photos = 0, failed = 0;
    for (final c in all) {
      if (c.status == CaptureStatus.done) continue;
      if (!c.readingSynced) {
        readings++;
      } else if (c.photoPending) {
        photos++;
      } else {
        continue;
      }
      if (c.status == CaptureStatus.failed) failed++;
    }
    return PendingSummary(readings: readings, photos: photos, failed: failed);
  }

  static Future<PendingSummary> pending() async => summarize(await CaptureStore.loadAll());

  /// Uploads one capture (reading first, then photo). Safe to call again
  /// while an upload is running: the second call is ignored.
  static Future<void> upload(Capture capture) async {
    if (!_active.add(capture.id)) return;
    try {
      final saved = await CaptureStore.loadAll();
      capture = saved.firstWhere((item) => item.id == capture.id, orElse: () => capture);
      if (capture.status == CaptureStatus.done) return;
      capture.status = CaptureStatus.uploading;
      version.value++;
      await CaptureStore.saveCapture(capture);
      try {
        await FirebaseUploadService.uploadCapture(capture);
        capture.status = CaptureStatus.done;
        capture.error = null;
      } catch (error) {
        capture.status = CaptureStatus.failed;
        capture.error = error.toString();
      }
      await CaptureStore.saveCapture(capture);
    } catch (error) {
      capture.status = CaptureStatus.failed;
      capture.error = 'Local save failed: $error';
    } finally {
      _active.remove(capture.id);
      version.value++;
    }
  }

  /// Retries everything not yet done, oldest first. Returns false when a
  /// retry pass was already running.
  static Future<bool> retryPending() async {
    if (_retrying) return false;
    _retrying = true;
    try {
      final items = await CaptureStore.loadAll()
        ..sort((a, b) => a.capturedAt.compareTo(b.capturedAt));
      for (final capture in items) {
        if (capture.status != CaptureStatus.done) await upload(capture);
      }
      return true;
    } finally {
      _retrying = false;
    }
  }

  /// An "uploading" status left over from a previous run of the app (the
  /// process was killed mid-upload) is really pending.
  static void repairInterrupted(Iterable<Capture> items) {
    for (final capture in items) {
      if (capture.status == CaptureStatus.uploading && !_active.contains(capture.id)) {
        capture.status = CaptureStatus.pending;
      }
    }
  }
}
