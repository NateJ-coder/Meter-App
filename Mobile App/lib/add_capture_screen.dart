import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'capture.dart';
import 'capture_store.dart';
import 'meter_registry.dart';
import 'reading_cleaner.dart';

const List<String> _unreadableReasons = [
  'Locked / no access',
  'Meter faulty or damaged',
  'Meter obscured or hidden',
  'Other',
];

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
  final _unreadableNoteController = TextEditingController();
  String _meterType = 'Electricity';
  String? _photoPath;
  bool _saving = false;
  bool _takingPhoto = false;

  // Canonical meter matched from the registry (null = free-typed / not
  // found - still saved, just flagged for office review instead of
  // silently trusted or blocked).
  MeterOption? _matchedMeter;
  List<MeterOption> _options = const [];
  bool _loadingOptions = true;

  bool _isUnreadable = false;
  String? _unreadableReason;

  @override
  void initState() {
    super.initState();
    _loadOptions();
  }

  Future<void> _loadOptions() async {
    final options = await MeterRegistry.forBuilding(widget.building, meterType: _meterType);
    if (!mounted) return;
    setState(() {
      _options = options;
      _loadingOptions = false;
    });
  }

  void _onMeterTypeChanged(String? value) {
    setState(() {
      _meterType = value ?? 'Electricity';
      _matchedMeter = null;
      _labelController.clear();
    });
    _loadOptions();
  }

  void _onLabelSelected(MeterOption option) {
    setState(() {
      _matchedMeter = option;
      _labelController.text = option.number;
    });
  }

  /// A free-typed label still counts as "confirmed" if it happens to
  /// exactly match a canonical number (case/whitespace-insensitive) -
  /// covers picking the suggestion by finishing typing rather than tapping
  /// it in the list.
  MeterOption? _matchTyped(String typed) {
    final normalized = typed.trim().toLowerCase();
    if (normalized.isEmpty) return null;
    for (final option in _options) {
      if (option.number.trim().toLowerCase() == normalized) return option;
    }
    return null;
  }

  @override
  void dispose() {
    _labelController.dispose();
    _readingController.dispose();
    _unreadableNoteController.dispose();
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

  /// Local-history lookup for the "below/unchanged/10x previous reading"
  /// warnings - matches on this device's own previously synced-or-pending
  /// captures for the same building/label/type, most recent first. (The
  /// app has no authenticated read access to the full Firestore history,
  /// only to what's passed through this device - see
  /// Mobile App/lib/firebase_upload_service.dart.)
  Future<String?> _findPreviousReading(String label) async {
    if (label.trim().isEmpty) return null;
    final all = await CaptureStore.loadAll();
    final matches = all.where((c) =>
        c.building.trim().toLowerCase() == widget.building.trim().toLowerCase() &&
        c.label.trim().toLowerCase() == label.trim().toLowerCase() &&
        c.meterType == _meterType &&
        !c.isUnreadable).toList()
      ..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));
    return matches.isEmpty ? null : matches.first.readingValue;
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
    if (_isUnreadable && _unreadableReason == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please choose a reason this meter could not be read.')),
      );
      return;
    }

    setState(() => _saving = true);

    final label = _labelController.text.trim();
    final matched = _matchedMeter ?? _matchTyped(label);

    // Warnings are computed silently here and stored on the capture - they
    // are never shown to the reader as a popup (Nate, 2026-09): the office
    // dashboard surfaces them as a flag icon on flagged rows instead.
    List<String> warnings = const [];
    if (!_isUnreadable) {
      final previous = await _findPreviousReading(label);
      final cleanedPreview = ReadingCleaner.clean(
        building: widget.building,
        label: label,
        meterType: _meterType,
        rawValue: _readingController.text.trim(),
        meterRole: matched?.role ?? '',
      );
      warnings = ReadingCleaner.reviewWarnings(
        _readingController.text.trim(),
        cleanedPreview,
        previousReading: previous,
      );
    }

    final capture = Capture(
      id: const Uuid().v4(),
      building: widget.building,
      label: label,
      meterType: _meterType,
      readingValue: _isUnreadable ? '' : _readingController.text.trim(),
      photoPath: _photoPath!,
      capturedAt: DateTime.now(),
      labelConfirmed: matched != null,
      meterRole: matched?.role ?? '',
      reviewWarnings: warnings,
      isUnreadable: _isUnreadable,
      unreadableReason: _isUnreadable ? (_unreadableReason ?? '') : '',
      unreadableNote: _isUnreadable ? _unreadableNoteController.text.trim() : '',
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

  Widget _labelField() {
    if (_loadingOptions) {
      return const LinearProgressIndicator();
    }
    if (_options.isEmpty) {
      // No registry for this building yet (e.g. Transvalia) - fall back to
      // plain free text rather than blocking capture.
      return TextFormField(
        controller: _labelController,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(
          labelText: 'Meter Label',
          hintText: 'e.g. GEN 01, COM 03, BULK 1',
          border: OutlineInputBorder(),
        ),
        validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
      );
    }

    return Autocomplete<MeterOption>(
      // Supplying our own controller (rather than letting Autocomplete
      // create one internally) means _save()/_findPreviousReading can read
      // _labelController directly, and fieldViewBuilder's `controller`
      // below is guaranteed to be this same instance.
      textEditingController: _labelController,
      displayStringForOption: (option) => option.number,
      optionsBuilder: (textEditingValue) {
        final query = textEditingValue.text.trim().toLowerCase();
        if (query.isEmpty) return _options;
        return _options.where((o) => o.number.toLowerCase().contains(query));
      },
      onSelected: _onLabelSelected,
      fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
        return TextFormField(
          controller: controller,
          focusNode: focusNode,
          textCapitalization: TextCapitalization.characters,
          onChanged: (value) {
            if (_matchedMeter != null &&
                _matchedMeter!.number.trim().toLowerCase() != value.trim().toLowerCase()) {
              setState(() => _matchedMeter = null);
            }
          },
          decoration: InputDecoration(
            labelText: 'Meter Label',
            hintText: 'Start typing to search this building\'s meters',
            border: const OutlineInputBorder(),
            suffixIcon: _matchedMeter != null
                ? const Icon(Icons.check_circle, color: Colors.green)
                : null,
            helperText: _matchedMeter != null
                ? 'Matched to the registered meter list'
                : 'Not matched yet - pick a suggestion, or this entry will be flagged for office review',
            helperMaxLines: 2,
          ),
          validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
        );
      },
    );
  }

  Widget _readingSection() {
    if (_isUnreadable) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            initialValue: _unreadableReason,
            decoration: const InputDecoration(
              labelText: 'Why couldn\'t this meter be read?',
              border: OutlineInputBorder(),
            ),
            items: _unreadableReasons
                .map((r) => DropdownMenuItem(value: r, child: Text(r)))
                .toList(),
            onChanged: (v) => setState(() => _unreadableReason = v),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _unreadableNoteController,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              hintText: 'e.g. gate locked, no one available',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
        ],
      );
    }

    return TextFormField(
      controller: _readingController,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: const InputDecoration(
        labelText: 'Reading Value',
        border: OutlineInputBorder(),
      ),
      validator: (value) => ReadingCleaner.validate(value ?? ''),
    );
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
              _labelField(),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _meterType,
                decoration: const InputDecoration(
                  labelText: 'Type',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'Electricity', child: Text('Electricity')),
                  DropdownMenuItem(value: 'Water', child: Text('Water')),
                ],
                onChanged: _onMeterTypeChanged,
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Unable to read this meter'),
                subtitle: const Text('Locked, faulty, obscured, or otherwise inaccessible'),
                value: _isUnreadable,
                onChanged: (v) => setState(() => _isUnreadable = v),
              ),
              const SizedBox(height: 8),
              _readingSection(),
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
