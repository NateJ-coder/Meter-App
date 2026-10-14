import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'add_capture_screen.dart';
import 'capture.dart';
import 'capture_store.dart';
import 'cycle_rules.dart';
import 'meter_registry.dart';
import 'upload_queue.dart';

class CaptureScreen extends StatefulWidget {
  final String building;
  const CaptureScreen({super.key, required this.building});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  List<Capture> _all = [];
  List<MeterOption> _registry = const [];
  Timer? _retryTimer;
  bool _loading = true;
  String? _loadError;
  bool _retrying = false;
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

  /// This month's captures for the building (the current reading cycle).
  List<Capture> get _cycleCaptures =>
      CycleRules.cycleCaptures(_all, widget.building, DateTime.now());

  CycleProgress get _progress => CycleRules.progress(
        registry: _registry,
        all: _all,
        building: widget.building,
        now: DateTime.now(),
      );

  String _formatMonth(DateTime dt) => CycleRules.cycleKey(dt);

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
    UploadQueue.version.addListener(_onQueueChanged);
    _retryTimer = Timer.periodic(const Duration(seconds: 20), (_) => _retryPending());
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    UploadQueue.version.removeListener(_onQueueChanged);
    super.dispose();
  }

  Future<void> _onQueueChanged() async {
    if (!mounted || _loading || _loadError != null) return;
    try {
      final items = await CaptureStore.loadAll();
      if (mounted) setState(() => _all = items);
    } catch (_) {
      // The periodic retry reports load problems; a refresh miss is harmless.
    }
  }

  Future<void> _load() async {
    try {
      final registry = await MeterRegistry.forBuilding(widget.building);
      final items = await CaptureStore.loadAll();
      UploadQueue.repairInterrupted(items);
      if (!mounted) return;
      setState(() { _all = items; _registry = registry; _loading = false; _loadError = null; });
      unawaited(_retryPending());
    } catch (error) {
      if (!mounted) return;
      setState(() { _loading = false; _loadError = 'Saved readings could not be loaded. Nothing has been overwritten. $error'; });
    }
  }

  Future<void> _upload(Capture capture) => UploadQueue.upload(capture);

  Future<void> _retryPending() async {
    if (_retrying || _loading || _loadError != null || !mounted) return;
    _retrying = true;
    try {
      await UploadQueue.retryPending();
      final items = await CaptureStore.loadAll();
      if (mounted) setState(() => _all = items);
    } catch (error) {
      if (mounted) setState(() => _loadError = 'Could not reload saved readings. Nothing has been overwritten. $error');
    } finally {
      _retrying = false;
    }
  }

  Future<void> _addMeter() async {
    final capture = await Navigator.of(context).push<Capture>(
      MaterialPageRoute(
        builder: (_) => AddCaptureScreen(
          building: widget.building,
          cycleCaptures: _cycleCaptures,
        ),
      ),
    );
    if (capture == null || !mounted) return;
    await _load();
  }

  /// A reading can be changed until it has been submitted to the server.
  /// After that the office corrects it on the dashboard, so the audit
  /// trail (original value, who changed it, why) is kept.
  Future<void> _editCapture(Capture capture) async {
    if (capture.readingSynced || capture.status == CaptureStatus.done) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('This reading has already been submitted. Ask the office to correct it on the dashboard.'),
      ));
      return;
    }
    if (UploadQueue.isUploading(capture.id)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('This reading is being submitted right now. Try again in a moment.'),
      ));
      return;
    }
    final changed = await Navigator.of(context).push<Capture>(
      MaterialPageRoute(
        builder: (_) => AddCaptureScreen(
          building: widget.building,
          cycleCaptures: _cycleCaptures,
          existing: capture,
        ),
      ),
    );
    if (changed == null || !mounted) return;
    await _load();
  }

  void _showOutstanding(CycleProgress progress) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Text(
                '${progress.missing.length} meter${progress.missing.length == 1 ? '' : 's'} still outstanding for ${widget.building} this month',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: progress.missing
                    .map((m) => ListTile(
                          dense: true,
                          leading: Icon(m.type == 'Water' ? Icons.water_drop : Icons.bolt),
                          title: Text(m.number),
                          subtitle: Text(m.type),
                        ))
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Leaving is only allowed once every registered meter has a reading or
  /// an "unable to read" this month.
  Future<void> _onLeaveBlocked(CycleProgress progress) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${widget.building} is not finished'),
        content: Text(
          '${progress.missing.length} of ${progress.registered} registered meters still have no reading this month: '
          '${progress.describeMissing()}.\n\n'
          'Capture each one, or record it as "Unable to read" with the reason, before leaving this building.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _showOutstanding(progress);
            },
            child: const Text('Show outstanding'),
          ),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Keep capturing')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = _mine;
    final synced = items.where((c) => c.status == CaptureStatus.done).length;
    final photosPending = items
        .where((c) => c.readingSynced && c.photoPending)
        .length;
    final noPhoto = items.where((c) => c.noPhoto).length;
    final months = _availableMonths;
    final progress = _loading || _loadError != null ? null : _progress;
    final canLeave = progress == null || progress.complete;

    return PopScope(
      canPop: canLeave,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && progress != null) _onLeaveBlocked(progress);
      },
      child: Scaffold(
      appBar: AppBar(
        title: Text(widget.building),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Retry pending uploads',
            onPressed: _loadError != null ? _load : _retryPending,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
            : _loadError != null ? Center(child: Padding(
              padding: const EdgeInsets.all(24), child: Text(_loadError!))) : Column(
              children: [
                // Cycle progress: how much of this building is still to do
                if (progress != null && progress.registered > 0)
                  Material(
                    color: progress.complete
                        ? Colors.green.shade50
                        : Theme.of(context).colorScheme.tertiaryContainer,
                    child: InkWell(
                      onTap: progress.complete ? null : () => _showOutstanding(progress),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                        child: Row(
                          children: [
                            Icon(progress.complete ? Icons.check_circle : Icons.pending_actions,
                                color: progress.complete ? Colors.green : null),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                progress.complete
                                    ? 'All ${progress.registered} registered meters captured this month. You can leave this building.'
                                    : '${progress.done} of ${progress.registered} registered meters captured this month. '
                                        '${progress.missing.length} outstanding - tap to see which.',
                                style: const TextStyle(fontWeight: FontWeight.w500),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
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
                    '$synced of ${items.length} meters synced to server'
                    '${photosPending > 0 ? ' ($photosPending photo${photosPending == 1 ? '' : 's'} still uploading - keep the app open with signal)' : ''}'
                    '${noPhoto > 0 ? ' - $noPhoto without a photo' : ''}',
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
                            final editable = !c.readingSynced && c.status != CaptureStatus.done;
                            return ListTile(
                              leading: c.hasPhotoFile
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(6),
                                      child: Image.file(
                                        File(c.photoPath),
                                        width: 48,
                                        height: 48,
                                        fit: BoxFit.cover,
                                        errorBuilder: (context, error, stackTrace) =>
                                            const Icon(Icons.image_not_supported),
                                      ),
                                    )
                                  : const Icon(Icons.no_photography, color: Color(0xFFB45309)),
                              title: Text('${c.label} · ${c.meterType}'),
                              subtitle: Text(
                                  '${c.isUnreadable ? 'Unable to read: ${c.unreadableReason}' : 'Reading: ${c.readingValue}'}\n$dateStr'
                                  '${!c.labelConfirmed ? '\nLabel not matched to registry' : ''}'
                                  '${c.unreadableNote.isNotEmpty ? '\nNote: ${c.unreadableNote}' : ''}'
                                  '${c.noPhoto ? '\nNo photo: ${c.noPhotoReason}${c.noPhotoNote.isNotEmpty ? ' - ${c.noPhotoNote}' : ''}' : ''}'
                                  '${c.reviewNote.isNotEmpty ? '\n${c.reviewNote}' : ''}'
                                  '${editable ? '\nTap to change before it is submitted' : ''}'
                                  '${c.error != null ? '\n${c.error}' : ''}'),
                              isThreeLine: true,
                              trailing: _statusChip(c),
                              onTap: c.status == CaptureStatus.failed && c.readingSynced
                                  ? () => _upload(c)
                                  : editable
                                      ? () => _editCapture(c)
                                      : null,
                            );
                          },
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading || _loadError != null ? null : _addMeter,
        icon: const Icon(Icons.add_a_photo),
        label: const Text('Add Meter'),
      ),
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
