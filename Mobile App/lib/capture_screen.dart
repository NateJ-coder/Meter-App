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
  String? _selectedMonth; // null = show all

  List<Capture> get _buildingCaptures => _all
      .where((c) =>
          c.building.trim().toLowerCase() == widget.building.trim().toLowerCase())
      .toList()
    ..sort((a, b) => b.capturedAt.compareTo(a.capturedAt)); // newest first

  List<Capture> get _mine {
    if (_selectedMonth == null) return _buildingCaptures;
    return _buildingCaptures
        .where((c) => _formatMonth(c.capturedAt) == _selectedMonth)
        .toList();
  }

  List<String> get _availableMonths {
    final months = _buildingCaptures
        .map((c) => _formatMonth(c.capturedAt))
        .toSet()
        .toList()
      ..sort((a, b) => b.compareTo(a)); // newest first
    return months;
  }

  String _formatMonth(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}';
  }

  String _displayMonth(String monthKey) {
    final parts = monthKey.split('-');
    final year = parts[0];
    final month = int.parse(parts[1]);
    final monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${monthNames[month - 1]} $year';
  }

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
    final months = _availableMonths;

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
                // Month filter bar
                if (months.isNotEmpty)
                  Container(
                    width: double.infinity,
                    color: Theme.of(context).colorScheme.primaryContainer,
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_month, size: 20),
                        const SizedBox(width: 8),
                        const Text('Filter by month:', style: TextStyle(fontWeight: FontWeight.w500)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: DropdownButton<String?>(
                            value: _selectedMonth,
                            isExpanded: true,
                            underline: const SizedBox(),
                            items: [
                              DropdownMenuItem<String?>(
                                value: null,
                                child: Text('All months (${_buildingCaptures.length})'),
                              ),
                              ...months.map((m) => DropdownMenuItem<String?>(
                                    value: m,
                                    child: Text('${_displayMonth(m)} (${_buildingCaptures.where((c) => _formatMonth(c.capturedAt) == m).length})'),
                                  )),
                            ],
                            onChanged: (val) {
                              setState(() => _selectedMonth = val);
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                // Status bar
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
                            final dateStr = '${c.capturedAt.day}/${c.capturedAt.month}/${c.capturedAt.year} ${c.capturedAt.hour.toString().padLeft(2, '0')}:${c.capturedAt.minute.toString().padLeft(2, '0')}';
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
                              subtitle: Text('Reading: ${c.readingValue}\n$dateStr'
                                  '${c.error != null ? '\n${c.error}' : ''}'),
                              isThreeLine: true,
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
