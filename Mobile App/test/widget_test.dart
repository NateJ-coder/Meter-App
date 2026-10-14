// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fuzio_meter_reader/capture.dart';
import 'package:fuzio_meter_reader/capture_store.dart';
import 'package:fuzio_meter_reader/add_capture_screen.dart';
import 'package:fuzio_meter_reader/meter_registry.dart';
import 'package:fuzio_meter_reader/cycle_rules.dart';

import 'package:fuzio_meter_reader/main.dart';

// The registry is a real asset read, which never completes under the fake
// test clock; load it for real once so the screen's loading bar goes away.
Future<void> _primeMeterRegistry(WidgetTester tester) =>
    tester.runAsync(() => MeterRegistry.forBuilding('Genesis'));

/// A snackbar only starts its 4 s timer once it has fully slid in, and a
/// second toast queues behind it; make sure the first is gone before the
/// test expects the next one.
Future<void> _expireToast(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Capture is saved only after the reader confirms the summary', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _primeMeterRegistry(tester);
    final directory = Directory.systemTemp.createTempSync('capture-save-test');
    final photo = File('${directory.path}/photo.png');
    photo.writeAsBytesSync(base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='));
    const picker = MethodChannel('plugins.flutter.io/image_picker');
    const paths = MethodChannel('plugins.flutter.io/path_provider');
    final messenger = tester.binding.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(picker, (_) async => photo.path);
    messenger.setMockMethodCallHandler(paths, (_) async => directory.path);
    addTearDown(() {
      messenger.setMockMethodCallHandler(picker, null);
      messenger.setMockMethodCallHandler(paths, null);
      directory.deleteSync(recursive: true);
    });
    Capture? saved;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
      body: TextButton(onPressed: () async {
        saved = await Navigator.of(context).push<Capture>(MaterialPageRoute(
            builder: (_) => const AddCaptureScreen(building: 'Hazelmere')));
      }, child: const Text('Capture')),
    ))));
    await tester.tap(find.text('Capture'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, '# 44');
    await tester.pump();
    // Not on the Hazelmere list: a reason is required before the summary.
    expect(find.text('Why is this meter not on the list?'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).last, '123');
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pump();
    expect(find.text('Confirm meter and reading'), findsNothing);
    await tester.enterText(find.byType(TextFormField).at(1), 'Sticker on the meter says 44');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Take Photo'));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('Take Photo'));
      for (var attempt = 0; attempt < 100; attempt++) {
        if ((await directory.list().toList()).length > 1) break;
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pumpAndSettle();
    expect(find.text('Retake Photo'), findsOneWidget);
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm meter and reading'), findsOneWidget);
    expect(find.textContaining('Not on the registered meter list (Sticker on the meter says 44)'), findsOneWidget);
    expect(saved, isNull);
    await tester.tap(find.text('Change'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect((await CaptureStore.loadAll()), isEmpty);
    await tester.enterText(find.byType(TextFormField).last, '124');
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pumpAndSettle();
    expect(find.text('Reading: 124'), findsOneWidget);
    await tester.tap(find.text('Confirm and save'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(saved?.label, '# 44');
    expect(saved?.readingValue, '124');
    expect(saved?.reviewAcknowledged, isFalse);
    expect(saved?.reviewNote, 'Label not on list: Sticker on the meter says 44');
    expect(saved?.noPhoto, isFalse);
    expect((await CaptureStore.loadAll()).single.id, saved?.id);
  });

  testWidgets('A reading without a photo needs a reason, which is saved for the office', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _primeMeterRegistry(tester);
    Capture? saved;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
      body: TextButton(onPressed: () async {
        saved = await Navigator.of(context).push<Capture>(MaterialPageRoute(
            builder: (_) => const AddCaptureScreen(building: 'Queensgate')));
      }, child: const Text('Capture')),
    ))));
    await tester.tap(find.text('Capture'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'QG 05');
    await tester.pump();
    expect(find.text('Why is this meter not on the list?'), findsNothing);
    await tester.enterText(find.byType(TextFormField).last, '4410');
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pump();
    expect(find.textContaining('Please take a photo of the meter, or tick "No photo possible"'), findsOneWidget);
    await _expireToast(tester);
    await tester.ensureVisible(find.text('No photo possible'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('No photo possible'));
    await tester.pumpAndSettle();
    expect(find.text('Why could no photo be taken?'), findsOneWidget);
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pump();
    expect(find.text('Please choose why no photo could be taken.'), findsOneWidget);
    await _expireToast(tester);
    await tester.ensureVisible(find.text('Why could no photo be taken?'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Why could no photo be taken?'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Other').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pump();
    expect(find.text('Please add a note explaining why no photo could be taken.'), findsOneWidget);
    await _expireToast(tester);
    await tester.enterText(find.byType(TextFormField).last, 'Meter is inside the ceiling');
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm meter and reading'), findsOneWidget);
    expect(find.text('No photo: Other (Meter is inside the ceiling)'), findsOneWidget);
    await tester.tap(find.text('Confirm and save'));
    await tester.pumpAndSettle();
    expect(saved?.noPhoto, isTrue);
    expect(saved?.noPhotoReason, 'Other');
    expect(saved?.noPhotoNote, 'Meter is inside the ceiling');
    expect(saved?.photoPath, '');
    expect(saved?.labelConfirmed, isTrue);
  });

  testWidgets('Typing a unit number offers the registered meter as a chip', (tester) async {
    await _primeMeterRegistry(tester);
    await tester.pumpWidget(const MaterialApp(home: AddCaptureScreen(building: 'Queensgate')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'unit 5');
    await tester.pump();
    expect(find.text('Did you mean:'), findsOneWidget);
    await tester.tap(find.widgetWithText(ActionChip, 'QG 05'));
    await tester.pump();
    expect(find.text('Matched to the registered meter list'), findsOneWidget);
    expect(find.text('Did you mean:'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Malformed readings are rejected before saving', (tester) async {
    await _primeMeterRegistry(tester);
    await tester.pumpWidget(const MaterialApp(
      home: AddCaptureScreen(building: 'Genesis'),
    ));
    await tester.enterText(find.byType(TextFormField).first, 'GEN 01');
    await tester.enterText(find.byType(TextFormField).last, '123.4.5');
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pump();
    expect(find.text('Enter digits and one decimal point (or comma) only.'), findsOneWidget);
    expect(find.text('Confirm meter and reading'), findsNothing);
  });

  testWidgets('A meter captured this month cannot be captured again for the same type', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _primeMeterRegistry(tester);
    final earlier = Capture(id: 'earlier', building: 'Queensgate', label: 'QG 05',
        meterType: 'Electricity', readingValue: '49921.1', photoPath: '/earlier.jpg',
        capturedAt: DateTime.now());
    await tester.pumpWidget(MaterialApp(
      home: AddCaptureScreen(building: 'Queensgate', cycleCaptures: [earlier]),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('meters still to capture'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'qg 05');
    await tester.enterText(find.byType(TextFormField).last, '49950');
    await tester.ensureVisible(find.text('Review and Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review and Save'));
    await tester.pump();
    // No photo yet, so the photo prompt comes first; the duplicate guard
    // runs before the confirmation summary is shown.
    expect(find.textContaining('Please take a photo of the meter'), findsOneWidget);
    expect(find.text('Confirm meter and reading'), findsNothing);
    final earlierWater = Capture(id: 'w', building: 'Queensgate', label: 'QG 05',
        meterType: 'Water', readingValue: '153', photoPath: '/w.jpg', capturedAt: DateTime.now());
    final registry = await tester.runAsync(() => MeterRegistry.forBuilding('Queensgate'));
    expect(CycleRules.availableMeters(registry!, 'Electricity', [earlier]).any((m) => m.number == 'QG 05'), isFalse);
    expect(CycleRules.availableMeters(registry, 'Water', [earlier]).any((m) => m.number == 'QG 05'), isTrue);
    expect(CycleRules.availableMeters(registry, 'Water', [earlier, earlierWater]).any((m) => m.number == 'QG 05'), isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Bulk electricity label does not select water', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: AddCaptureScreen(building: 'Phanda Lodge'),
    ));
    await tester.enterText(find.byType(TextFormField).first, 'BULK ELECTRICITY');
    await tester.pump();
    final field = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>),
    );
    expect(field.initialValue, 'Electricity');
  });

  testWidgets('App shows building selection screen', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({}); // nothing queued, so no upload attempt
    await tester.pumpWidget(const FuzioMeterReaderApp());

    expect(find.text('Fuzio Meter Reader'), findsOneWidget);
    expect(find.text('Start Capture'), findsOneWidget);
    final buildings = tester.widget<DropdownButtonFormField<String>>(find.byType(DropdownButtonFormField<String>));
    expect(buildings.initialValue, 'Genesis');
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    final options = tester.widget<DropdownButton<String>>(find.byType(DropdownButton<String>)).items!;
    expect((options.last.child as Text).data, 'Bonifay Court');
    expect(options.map((item) => item.value).toList(), [
      'Azores', 'Carissa Lane', 'Genesis', 'Hazelmere', "L'Montagne",
      'Queensgate', 'Rivonia Gate', 'Taragona', 'Transvalia', 'Villino Glen',
      'Phanda Lodge', 'Vista Del Monte', 'Bonifay',
    ]);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
  });
}
