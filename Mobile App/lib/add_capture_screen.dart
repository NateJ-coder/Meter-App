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
  final List<Capture> previousCaptures;
  const AddCaptureScreen({super.key, required this.building, this.previousCaptures = const []});

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
        source: ImageSource.camera, imageQuality: 80, maxWidth: 1600);
      if (shot == null || !mounted) return;
      final dir = await getApplicationDocumentsDirectory();
      final savedPath = '${dir.path}/capture_${const Uuid().v4()}.jpg';
      await File(shot.path).copy(savedPath);
      if (mounted) setState(() => _photoPath = savedPath);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Photo not saved. Please retry: $error')));
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

    final rawValue = _readingController.text.trim();
    final cleanedValue = ReadingCleaner.clean(
      building: widget.building,
      label: _labelController.text.trim(),
      meterType: _meterType,
      rawValue: rawValue,
    );
    final history = widget.previousCaptures.where((capture) =>
        capture.building == widget.building &&
        capture.meterType == _meterType &&
        capture.label.trim().toUpperCase() == _labelController.text.trim().toUpperCase()).toList()
      ..sort((first, second) => second.capturedAt.compareTo(first.capturedAt));
    final previous = history.isEmpty ? null : history.first;
    final previousReading = previous == null ? null : ReadingCleaner.clean(
      building: previous.building, label: previous.label,
      meterType: previous.meterType, rawValue: previous.readingValue,
    );
    final warnings = ReadingCleaner.reviewWarnings(rawValue, cleanedValue,
        previousReading: previousReading);
    final note = await showDialog<String>(
      context: context,
      builder: (context) => ReadingReviewDialog(
        photo: Image.file(File(_photoPath!), height: 200, fit: BoxFit.contain,
            errorBuilder: (_, error, stack) => const Text('Photo unavailable. Go back and retake it.')),
        meter: '${widget.building}: ${_labelController.text.trim()} ($_meterType)',
        rawValue: rawValue, cleanedValue: cleanedValue, warnings: warnings,
        previousReading: previousReading,
      ),
    );
    if (!mounted) return;
    if (note == null) {
      setState(() => _saving = false);
      return;
    }

    final capture = Capture(
      id: const Uuid().v4(),
      building: widget.building,
      label: _labelController.text.trim(),
      meterType: _meterType,
      readingValue: _readingController.text.trim(),
      photoPath: _photoPath!,
      capturedAt: DateTime.now(),
      reviewNote: note,
      reviewWarnings: warnings,
      reviewAcknowledged: true,
    );

    try {
      await CaptureStore.saveCapture(capture);
      if (!mounted) return;
      Navigator.of(context).pop(capture);
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Not saved. Keep this screen open and retry: $error')));
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
                validator: (value) => ReadingCleaner.validate(value ?? ''),
              ),
              const SizedBox(height: 20),
              if (_photoPath != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(File(_photoPath!), height: 220, fit: BoxFit.cover),
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

class ReadingReviewDialog extends StatefulWidget {
  final Widget photo;
  final String meter;
  final String rawValue;
  final String cleanedValue;
  final List<String> warnings;
  final String? previousReading;

  const ReadingReviewDialog({super.key, required this.photo, required this.meter,
    required this.rawValue, required this.cleanedValue, required this.warnings,
    this.previousReading});

  @override
  State<ReadingReviewDialog> createState() => _ReadingReviewDialogState();
}

class _ReadingReviewDialogState extends State<ReadingReviewDialog> {
  final _note = TextEditingController();
  bool _checked = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canContinue = widget.warnings.isEmpty || _checked || _note.text.trim().isNotEmpty;
    return AlertDialog(
      title: const Text('Review reading'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
              widget.photo,
              Text(widget.meter),
              Text('Entered: ${widget.rawValue}\nAdmin reading: ${widget.cleanedValue}'),
              Text(widget.previousReading == null ? 'No previous local reading available.'
                  : 'Previous local reading: ${widget.previousReading}'),
              const SizedBox(height: 12),
              ...widget.warnings.map((warning) => Padding(
                padding: const EdgeInsets.only(bottom: 8), child: Text(warning))),
              const Text('Check the meter label, serial and register against the photo.'),
              const SizedBox(height: 12),
              TextField(controller: _note, maxLines: 3, maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Note for admin',
                    border: OutlineInputBorder()),
                onChanged: (_) => setState(() {})),
              if (widget.warnings.isNotEmpty)
                CheckboxListTile(contentPadding: EdgeInsets.zero,
                  title: const Text('Checked the photo; keep this reading'),
                  value: _checked,
                  onChanged: (value) => setState(() => _checked = value ?? false)),
            ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Go Back')),
        FilledButton(onPressed: canContinue ? () => Navigator.pop(context, _note.text.trim()) : null,
          child: const Text('Next')),
      ],
    );
  }
}
