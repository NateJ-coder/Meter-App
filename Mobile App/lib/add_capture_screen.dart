import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'capture.dart';
import 'capture_store.dart';
import 'reading_cleaner.dart';

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
  bool _takingPhoto = false;

  @override
  void dispose() {
    _labelController.dispose();
    _readingController.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    if (_takingPhoto) return;
    setState(() => _takingPhoto = true);
    try {
      final shot = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
        maxWidth: 1600,
      );
      if (shot == null || !mounted) return;
      final dir = await getApplicationDocumentsDirectory();
      final savedPath = '${dir.path}/capture_${const Uuid().v4()}.jpg';
      await File(shot.path).copy(savedPath);
      if (mounted) setState(() => _photoPath = savedPath);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Photo not saved. Please retry: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _takingPhoto = false);
    }
  }

  Future<void> _save() async {
    if (_saving || _takingPhoto) return;
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

    try {
      await CaptureStore.saveCapture(capture);
      if (!mounted) return;
      Navigator.of(context).pop(capture);
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Not saved. Keep this screen open and retry: $error'),
        ),
      );
    }
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
                    value: 'Electricity',
                    child: Text('Electricity'),
                  ),
                  DropdownMenuItem(value: 'Water', child: Text('Water')),
                ],
                onChanged: (v) =>
                    setState(() => _meterType = v ?? 'Electricity'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _readingController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Reading Value',
                  border: OutlineInputBorder(),
                ),
                validator: (value) => ReadingCleaner.validate(value ?? ''),
              ),
              const SizedBox(height: 20),
              if (_photoPath != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(_photoPath!),
                    height: 220,
                    fit: BoxFit.cover,
                  ),
                ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _saving || _takingPhoto ? null : _takePhoto,
                icon: const Icon(Icons.camera_alt),
                label: Text(_photoPath == null ? 'Take Photo' : 'Retake Photo'),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _saving || _takingPhoto ? null : _save,
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
