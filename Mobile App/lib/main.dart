import 'dart:async';

import 'package:flutter/material.dart';

import 'app_updater.dart';
import 'capture_screen.dart';
import 'capture_store.dart';
import 'cycle_rules.dart';
import 'meter_registry.dart';
import 'upload_queue.dart';

void main() {
  runApp(const FuzioMeterReaderApp());
}

class FuzioMeterReaderApp extends StatelessWidget {
  const FuzioMeterReaderApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fuzio Meter Reader',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1565C0)),
        useMaterial3: true,
      ),
      home: const BuildingScreen(),
    );
  }
}

class BuildingScreen extends StatefulWidget {
  const BuildingScreen({super.key});

  @override
  State<BuildingScreen> createState() => _BuildingScreenState();
}

class _BuildingScreenState extends State<BuildingScreen> {
  String _selectedBuilding = 'Genesis';
  PendingSummary _pending = const PendingSummary(readings: 0, photos: 0, failed: 0);
  Timer? _retryTimer;
  bool _retrying = false;
  static const buildings = {
    'Azores': 'The Azores',
    'Carissa Lane': 'Carissa Lane',
    'Genesis': 'Genesis',
    'Hazelmere': 'Hazelmere',
    "L'Montagne": "L'Montagne",
    'Queensgate': 'Queensgate',
    'Rivonia Gate': 'Rivonia Gate',
    'Taragona': 'Taragona',
    'Transvalia': 'Transvalia',
    'Villino Glen': 'Vilino Glen',
    'Phanda Lodge': 'Phanda Lodge',
    'Vista Del Monte': 'Vista Del Monte',
    'Bonifay': 'Bonifay Court',
  };

  @override
  void initState() {
    super.initState();
    _checkForUpdates();
    UploadQueue.version.addListener(_refreshPending);
    _refreshPending();
    // Keep pushing whatever is still waiting, whichever screen the reader
    // is on: until v1.0.6 photos only uploaded while a building's list was
    // open, which is how readings reached the office without their photo.
    _retryTimer = Timer.periodic(const Duration(seconds: 20), (_) => _retryPending());
    unawaited(_retryPending());
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    UploadQueue.version.removeListener(_refreshPending);
    super.dispose();
  }

  Future<void> _refreshPending() async {
    try {
      final pending = await UploadQueue.pending();
      if (mounted) setState(() => _pending = pending);
    } catch (error) {
      debugPrint('Pending summary skipped: $error');
    }
  }

  Future<void> _retryPending() async {
    if (_retrying || !mounted) return;
    _retrying = true;
    try {
      await UploadQueue.retryPending();
    } catch (error) {
      debugPrint('Retry skipped: $error');
    } finally {
      _retrying = false;
      if (mounted) unawaited(_refreshPending());
    }
  }

  Future<void> _checkForUpdates() async {
    // Small delay to let the UI settle
    await Future.delayed(const Duration(seconds: 1));
    
    if (!mounted) return;

    try {
      final updateInfo = await AppUpdater.checkForUpdate();
      if (updateInfo != null && mounted) {
        await AppUpdater.showUpdateDialog(context, updateInfo);
      }
    } catch (e) {
      // Silently fail - don't interrupt user if update check fails
      debugPrint('Update check error: $e');
    }
  }

  /// A reader may only move on to another building once the one they
  /// started this month is complete (every registered meter has a reading
  /// or an "unable to read"). Re-opening the unfinished building itself is
  /// always allowed.
  Future<void> _start() async {
    List<CycleProgress> unfinished = const [];
    try {
      final all = await CaptureStore.loadAll();
      final registries = <String, List<MeterOption>>{};
      for (final building in buildings.keys) {
        registries[building] = await MeterRegistry.forBuilding(building);
      }
      unfinished = await CycleRules.unfinishedBuildings(
        registries: registries,
        all: all,
        now: DateTime.now(),
        except: _selectedBuilding,
      );
    } catch (error) {
      // A broken local queue is reported inside CaptureScreen; do not
      // block the reader here on top of that.
      debugPrint('Completeness check skipped: $error');
    }
    if (!mounted) return;
    if (unfinished.isNotEmpty) {
      final first = unfinished.first;
      final goBack = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Finish ${first.building} first'),
          content: Text(
            '${first.building} still has ${first.missing.length} of ${first.registered} registered meters without a reading this month: '
            '${first.describeMissing()}.\n\n'
            'Every meter must have a reading, or be recorded as "Unable to read", before another building can be started.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text('Open ${first.building}'),
            ),
          ],
        ),
      );
      if (goBack == true && mounted) {
        setState(() => _selectedBuilding = first.building);
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CaptureScreen(building: first.building)),
        );
      }
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CaptureScreen(building: _selectedBuilding)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fuzio Meter Reader')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.electric_meter, size: 72, color: Color(0xFF1565C0)),
            const SizedBox(height: 16),
            Text(
              'Select a building to begin capturing meter readings.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 24),
            DropdownButtonFormField<String>(
              initialValue: _selectedBuilding,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Building',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.apartment),
              ),
              items: buildings.entries.map((building) {
                return DropdownMenuItem<String>(
                  value: building.key,
                  child: Text(building.value, overflow: TextOverflow.ellipsis),
                );
              }).toList(),
              onChanged: (value) {
                if (value != null) {
                  setState(() => _selectedBuilding = value);
                }
              },
            ),
            const SizedBox(height: 16),
            if (!_pending.isEmpty)
              Card(
                color: _pending.failed > 0
                    ? Theme.of(context).colorScheme.errorContainer
                    : Theme.of(context).colorScheme.tertiaryContainer,
                child: ListTile(
                  leading: Icon(_retrying ? Icons.cloud_sync : Icons.cloud_upload_outlined),
                  title: Text('${_pending.describe()} still to upload'),
                  subtitle: Text(_pending.failed > 0
                      ? 'The last attempt failed. Keep the app open where there is signal; it retries on its own. Tap to retry now.'
                      : 'Keep the app open where there is signal until this disappears, so the office gets every photo.'),
                  onTap: _retrying ? null : _retryPending,
                ),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _start,
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Text('Start Capture'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
