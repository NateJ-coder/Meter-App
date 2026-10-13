import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'capture.dart';
import 'capture_store.dart';
import 'cycle_rules.dart';
import 'meter_registry.dart';
import 'reading_cleaner.dart';

const List<String> _unreadableReasons = [
  'Locked / no access',
  'Meter faulty or damaged',
  'Meter obscured or hidden',
  'Other',
];

/// Capture one meter reading, or edit one that has not been submitted yet.
///
/// Guards added in v1.0.6 (Oct 2026 cycle lessons):
///  - the meter list only offers registered meters of the chosen type that
///    have NOT been captured yet this month, so the same meter cannot be
///    captured twice. A unit with an electricity and a water meter is
///    offered once under each type.
///  - a free-typed label that repeats an earlier capture this month (same
///    label and type) is refused with a pointer to the earlier reading.
///  - nothing is saved until the reader confirms a summary of the meter,
///    type, reading and photo, and can go back to change any of them.
class AddCaptureScreen extends StatefulWidget {
  final String building;

  /// Captures already made for [building] this cycle (used for the
  /// duplicate guard and to hide captured meters from the list).
  final List<Capture> cycleCaptures;

  /// When set, the screen edits this capture in place instead of creating
  /// a new one.
  final Capture? existing;

  const AddCaptureScreen({
    super.key,
    required this.building,
    this.cycleCaptures = const [],
    this.existing,
  });

  @override
  State<AddCaptureScreen> createState() => _AddCaptureScreenState();
}

class _AddCaptureScreenState extends State<AddCaptureScreen> {
  final _formKey = GlobalKey<FormState>();
  final _labelController = TextEditingController();
  final _readingController = TextEditingController();
  final _unreadableNoteController = TextEditingController();
  // Autocomplete requires a focus node whenever it is given a controller.
  final _labelFocusNode = FocusNode();
  String _meterType = 'Electricity';
  String? _photoPath;
  bool _saving = false;
  bool _takingPhoto = false;

  // Canonical meter matched from the registry (null = free-typed / not
  // found - still saved, just flagged for office review instead of
  // silently trusted or blocked).
  MeterOption? _matchedMeter;
  List<MeterOption> _registry = const [];
  List<MeterOption> _options = const [];
  bool _loadingOptions = true;

  bool _isUnreadable = false;
  String? _unreadableReason;

  bool get _editing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing != null) {
      _labelController.text = existing.label;
      _readingController.text = existing.readingValue;
      _meterType = existing.meterType;
      _photoPath = existing.photoPath;
      _isUnreadable = existing.isUnreadable;
      _unreadableReason = existing.isUnreadable && existing.unreadableReason.isNotEmpty
          ? existing.unreadableReason
          : null;
      _unreadableNoteController.text = existing.unreadableNote;
    }
    _loadOptions();
  }

  Future<void> _loadOptions() async {
    final registry = await MeterRegistry.forBuilding(widget.building);
    if (!mounted) return;
    setState(() {
      _registry = registry;
      _options = _availableOptions();
      _loadingOptions = false;
      if (_editing && _matchedMeter == null) {
        _matchedMeter = _matchTyped(_labelController.text);
      }
    });
  }

  List<MeterOption> _availableOptions() => CycleRules.availableMeters(
        _registry,
        _meterType,
        widget.cycleCaptures,
        excludeId: widget.existing?.id,
      );

  int get _registeredOfType => _registry.where((m) => m.type == _meterType).length;

  void _onMeterTypeChanged(String? value) {
    setState(() {
      _meterType = value ?? 'Electricity';
      _matchedMeter = null;
      _labelController.clear();
      _options = _availableOptions();
    });
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
    final key = CycleRules.labelKey(typed);
    if (key.isEmpty) return null;
    for (final option in _registry) {
      if (option.type == _meterType && CycleRules.labelKey(option.number) == key) return option;
    }
    return null;
  }

  @override
  void dispose() {
    _labelController.dispose();
    _labelFocusNode.dispose();
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
        c.id != widget.existing?.id &&
        c.building.trim().toLowerCase() == widget.building.trim().toLowerCase() &&
        CycleRules.labelKey(c.label) == CycleRules.labelKey(label) &&
        c.meterType == _meterType &&
        !c.isUnreadable).toList()
      ..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));
    return matches.isEmpty ? null : matches.first.readingValue;
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// Summary the reader must confirm before anything is stored. Returns
  /// true to save, false to go back and change something.
  Future<bool> _confirm(String label, MeterOption? matched) async {
    final reading = _isUnreadable
        ? 'Unable to read: ${_unreadableReason ?? ''}'
            '${_unreadableNoteController.text.trim().isNotEmpty ? ' (${_unreadableNoteController.text.trim()})' : ''}'
        : _readingController.text.trim();
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm meter and reading'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Meter: $label', style: const TextStyle(fontWeight: FontWeight.w600)),
              if (matched == null)
                const Padding(
                  padding: EdgeInsets.only(top: 2, bottom: 6),
                  child: Text('Not on the registered meter list - the office will be asked to check it.',
                      style: TextStyle(color: Color(0xFFB45309), fontSize: 13)),
                ),
              Text('Type: $_meterType'),
              Text('Reading: $reading'),
              const SizedBox(height: 12),
              if (_photoPath != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(File(_photoPath!), height: 160, fit: BoxFit.cover),
                ),
              const SizedBox(height: 8),
              const Text('Check the digits against the photo. You cannot change this reading after it is submitted.',
                  style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Change')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(_editing ? 'Confirm changes' : 'Confirm and save'),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _save() async {
    if (_saving || _takingPhoto) return;
    if (!_formKey.currentState!.validate()) return;
    if (_photoPath == null) {
      _toast('Please take a photo of the meter.');
      return;
    }
    if (_isUnreadable && _unreadableReason == null) {
      _toast('Please choose a reason this meter could not be read.');
      return;
    }

    final label = _labelController.text.trim();
    final matched = _matchedMeter ?? _matchTyped(label);

    // Duplicate guard: one capture per meter per type per month.
    final earlier = CycleRules.duplicateOf(label, _meterType, widget.cycleCaptures,
        excludeId: widget.existing?.id);
    if (earlier != null) {
      final earlierReading = earlier.isUnreadable
          ? 'unable to read (${earlier.unreadableReason})'
          : earlier.readingValue;
      _toast('$label $_meterType was already captured this month ($earlierReading). '
          'Pick a meter that is still outstanding, or open the earlier reading to change it.');
      return;
    }

    if (!await _confirm(label, matched)) return;
    if (!mounted) return;
    setState(() => _saving = true);

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

    final existing = widget.existing;
    final photoChanged = existing != null && existing.photoPath != _photoPath;
    final capture = Capture(
      id: existing?.id ?? const Uuid().v4(),
      building: widget.building,
      label: label,
      meterType: _meterType,
      readingValue: _isUnreadable ? '' : _readingController.text.trim(),
      photoPath: _photoPath!,
      capturedAt: existing?.capturedAt ?? DateTime.now(),
      // An edited capture goes back through upload so the server copy is
      // replaced; the photo is only re-sent when it was retaken.
      status: CaptureStatus.pending,
      photoUrl: photoChanged ? null : existing?.photoUrl,
      readingSynced: false,
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
      _toast('Not saved. Keep this screen open and retry: $error');
    }
  }

  Widget _labelField() {
    if (_loadingOptions) {
      return const LinearProgressIndicator();
    }
    if (_registry.isEmpty) {
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

    final outstanding = _options.length;
    final total = _registeredOfType;
    final helper = _matchedMeter != null
        ? 'Matched to the registered meter list'
        : outstanding == 0 && total > 0
            ? 'Every registered $_meterType meter is captured this month - only type a label for a meter that is not on the list'
            : '$outstanding of $total $_meterType meters still to capture. Pick a suggestion, or this entry will be flagged for office review';

    return Autocomplete<MeterOption>(
      // Supplying our own controller (rather than letting Autocomplete
      // create one internally) means _save()/_findPreviousReading can read
      // _labelController directly, and fieldViewBuilder's `controller`
      // below is guaranteed to be this same instance.
      textEditingController: _labelController,
      focusNode: _labelFocusNode,
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
                CycleRules.labelKey(_matchedMeter!.number) != CycleRules.labelKey(value)) {
              setState(() => _matchedMeter = null);
            }
          },
          decoration: InputDecoration(
            labelText: 'Meter Label',
            hintText: 'Start typing to search the outstanding meters',
            border: const OutlineInputBorder(),
            suffixIcon: _matchedMeter != null
                ? const Icon(Icons.check_circle, color: Colors.green)
                : null,
            helperText: helper,
            helperMaxLines: 3,
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
      appBar: AppBar(title: Text(_editing ? 'Change Reading' : 'Capture Meter')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_editing)
                const Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: Text('This reading has not been submitted yet. Change what is wrong and confirm again.'),
                ),
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
                    errorBuilder: (context, error, stackTrace) => const SizedBox(
                      height: 80,
                      child: Center(child: Icon(Icons.image_not_supported)),
                    ),
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
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Text(_editing ? 'Review Changes' : 'Review and Save'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
