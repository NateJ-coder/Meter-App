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
  String _selectedBuilding = 'Genesis';
  static const buildings = [
    'Genesis', 'Phanda Lodge', 'Akasia', 'Azores', 'Bonifay', 'Carissa Lane',
    'Colnbrook', 'Dolphine Cove', 'Gosforth Park', 'Granistar Heights',
    'Haven Court', 'Hazelmere', "L'Montagne", 'Magnolia Gardens', 'Mang Court',
    'New Poort', 'Palm View Estate', 'Panarama View', 'Queensgate',
    'River View', 'Riviera Villas', 'Rivonia Gate', 'Stonecrest',
    'Summers Ridge', 'Suncrest', 'Sundene', 'Taragona', 'Transvalia',
    'Villino Glen', 'Vista Del Monte', 'Wesley Heights',
  ];

  @override
  void initState() {
    super.initState();
    _checkForUpdates();
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
    Navigator.of(context).push(
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
              items: buildings.map((building) {
                return DropdownMenuItem<String>(
                  value: building,
                  child: Text(building, overflow: TextOverflow.ellipsis),
                );
              }).toList(),
              onChanged: (value) {
                if (value != null) {
                  setState(() => _selectedBuilding = value);
                }
              },
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
