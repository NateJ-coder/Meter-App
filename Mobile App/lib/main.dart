import 'package:flutter/material.dart';

import 'app_updater.dart';
import 'capture_screen.dart';

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
  final _controller = TextEditingController(text: 'Genesis');

  @override
  void initState() {
    super.initState();
    _checkForUpdates();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
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

  void _start() {
    final building = _controller.text.trim();
    if (building.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CaptureScreen(building: building)),
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
            TextField(
              controller: _controller,
              decoration: const InputDecoration(
                labelText: 'Building',
                border: OutlineInputBorder(),
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _start(),
            ),
            const SizedBox(height: 24),
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
