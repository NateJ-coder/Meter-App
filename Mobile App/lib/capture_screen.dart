import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'add_capture_screen.dart';
import 'capture.dart';
import 'capture_store.dart';
import 'firebase_upload_service.dart';

class CaptureScreen extends StatefulWidget {
  final String building;
  const CaptureScreen({super.key, required this.building});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  List<Capture> _all = [];
  Timer? _retryTimer;
  bool _loading = true;

  List<Capture> get _mine => _all
      .where((c) =>
          c.building.trim().toLowerCase() == widget.building.trim().toLowerCase())
      .toList()
    ..sort((a, b) => a.capturedAt.compareTo(b.capturedAt));

  @override
  void initState() {
    super.initState();
    _load();
    _retryTimer = Timer.periodic(const Duration(seconds: 20), (_) => _retryPending());
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final items = await CaptureStore.loadAll();
    setState(() {
      _all = items;
      _loading = false;
    });
    _retryPending();
  }

  Future<void> _persist() => CaptureStore.saveAll(_all);

  Future<void> _upload(Capture capture) async {
    setState(() => capture.status = CaptureStatus.uploading);
    await _persist();
    try {
      await FirebaseUploadService.uploadCapture(capture);
      capture.status = CaptureStatus.done;
      capture.error = null;
    } catch (e) {
      capture.status = CaptureStatus.failed;
      capture.error = e.toString();
    }
    if (mounted) setState(() {});
    await _persist();
  }

  Future<void> _retryPending() async {
    final pending = _mine.where((c) =>
        c.status == CaptureStatus.pending || c.status == CaptureStatus.failed);
    for (final capture in pending.toList()) {
      await _upload(capture);
    }
  }

  Future<void> _addMeter() async {
    final capture = await Navigator.of(context).push<Capture>(
      MaterialPageRoute(
        builder: (_) => AddCaptureScreen(building: widget.building),
      ),
    );
    if (capture == null) return;
    setState(() => _all.add(capture));
    await _persist();
    unawaited(_upload(capture));
  }

  @override
  Widget build(BuildContext context) {
    final items = _mine;
    final synced = items.where((c) => c.status == CaptureStatus.done).length;
    final photosPending = items
        .where((c) => c.readingSynced && c.photoUrl == null)
        .length;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.building),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Retry pending uploads',
            onPressed: _retryPending,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Container(
                  width: double.infinity,
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                  child: Text(
                    photosPending > 0
                        ? '$synced of ${items.length} meters synced to server '
                            '($photosPending photo${photosPending == 1 ? '' : 's'} pending — reading value already saved)'
                        : '$synced of ${items.length} meters synced to server',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                Expanded(
                  child: items.isEmpty
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'No meters captured yet.\nTap + to capture your first reading.',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        )
                      : ListView.builder(
                          itemCount: items.length,
                          itemBuilder: (context, index) {
                            final c = items[index];
                            return ListTile(
                              leading: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: Image.file(
                                  File(c.photoPath),
                                  width: 48,
                                  height: 48,
                                  fit: BoxFit.cover,
                                  errorBuilder: (context, error, stackTrace) =>
                                      const Icon(Icons.image_not_supported),
                                ),
                              ),
                              title: Text('${c.label} · ${c.meterType}'),
                              subtitle: Text('Reading: ${c.readingValue}'
                                  '${c.error != null ? '\n${c.error}' : ''}'),
                              isThreeLine: c.error != null,
                              trailing: _statusChip(c),
                              onTap: c.status == CaptureStatus.failed
                                  ? () => _upload(c)
                                  : null,
                            );
                          },
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addMeter,
        icon: const Icon(Icons.add_a_photo),
        label: const Text('Add Meter'),
      ),
    );
  }

  Widget _statusChip(Capture c) {
    switch (c.status) {
      case CaptureStatus.done:
        return const Icon(Icons.cloud_done, color: Colors.green);
      case CaptureStatus.uploading:
        return const SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        );
      case CaptureStatus.failed:
        return Icon(
          c.readingSynced ? Icons.cloud_upload_outlined : Icons.error,
          color: c.readingSynced ? Colors.orange : Colors.red,
        );
      case CaptureStatus.pending:
        return const Icon(Icons.cloud_upload_outlined, color: Colors.grey);
    }
  }
}
