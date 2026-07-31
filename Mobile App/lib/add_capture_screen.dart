import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'capture.dart';

class AddCaptureScreen extends StatefulWidget {
  final String building;
  const AddCaptureScreen({super.key, required this.building});

  @override
  State<AddCaptureScreen> createState() => _AddCaptureScreenState();
}

class _AddCaptureScreenState extends State<AddCaptureScreen> {
  final _formKey = GlobalKey<FormState>();
  final _labelController = TextEditingController();
  final _readingController = TextEditingController();
  String _meterType = 'Electricity';
  String? _photoPath;
  bool _saving = false;

  @override
  void dispose() {
    _labelController.dispose();
    _readingController.dispose();
    super.dispose();
  }

  void _onLabelChanged(String value) {
    final upper = value.toUpperCase();
    if (upper.contains('BULK') || upper.contains('WATER')) {
      setState(() => _meterType = 'Water');
    }
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    final shot = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
      maxWidth: 1600,
    );
    if (shot == null) return;

    final dir = await getApplicationDocumentsDirectory();
    final fileName = 'capture_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final savedPath = '${dir.path}/$fileName';
    await File(shot.path).copy(savedPath);

    setState(() => _photoPath = savedPath);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_photoPath == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please take a photo of the meter.')),
      );
      return;
    }

    setState(() => _saving = true);

    final capture = Capture(
      id: const Uuid().v4(),
      building: widget.building,
      label: _labelController.text.trim(),
      meterType: _meterType,
      readingValue: _readingController.text.trim(),
      photoPath: _photoPath!,
      capturedAt: DateTime.now(),
    );

    if (!mounted) return;
    Navigator.of(context).pop(capture);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Capture Meter')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _labelController,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Meter Label',
                  hintText: 'e.g. GEN 01, COM 03, BULK 1',
                  border: OutlineInputBorder(),
                ),
                onChanged: _onLabelChanged,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _meterType,
                decoration: const InputDecoration(
                  labelText: 'Type',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                      value: 'Electricity', child: Text('Electricity')),
                  DropdownMenuItem(value: 'Water', child: Text('Water')),
                ],
                onChanged: (v) => setState(() => _meterType = v ?? 'Electricity'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _readingController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Reading Value',
                  border: OutlineInputBorder(),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 20),
              if (_photoPath != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(File(_photoPath!), height: 220, fit: BoxFit.cover),
                ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _takePhoto,
                icon: const Icon(Icons.camera_alt),
                label: Text(_photoPath == null ? 'Take Photo' : 'Retake Photo'),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('Save Reading'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
