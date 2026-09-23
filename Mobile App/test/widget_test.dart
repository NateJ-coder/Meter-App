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

import 'package:fuzio_meter_reader/main.dart';

void main() {
  testWidgets('Capture saves directly without a review prompt', (tester) async {
    SharedPreferences.setMockInitialValues({});
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
    await tester.enterText(find.byType(TextFormField).last, '123');
    await tester.ensureVisible(find.text('Take Photo'));
    await tester.runAsync(() async {
      await tester.tap(find.text('Take Photo'));
      for (var attempt = 0; attempt < 100; attempt++) {
        if ((await directory.list().toList()).length > 1) break;
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pumpAndSettle();
    expect(find.text('Retake Photo'), findsOneWidget);
    await tester.ensureVisible(find.text('Save Reading'));
    await tester.tap(find.text('Save Reading'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(saved?.label, '# 44');
    expect(saved?.readingValue, '123');
    expect(saved?.reviewAcknowledged, isFalse);
    expect((await CaptureStore.loadAll()).single.id, saved?.id);
  });

  testWidgets('Malformed readings are rejected before saving', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: AddCaptureScreen(building: 'Genesis'),
    ));
    await tester.enterText(find.byType(TextFormField).first, 'GEN 01');
    await tester.enterText(find.byType(TextFormField).last, '123.4.5');
    await tester.ensureVisible(find.text('Save Reading'));
    await tester.tap(find.text('Save Reading'));
    await tester.pump();
    expect(find.text('Enter digits and one decimal point only (no commas or signs).'), findsOneWidget);
    expect(find.text('Confirm meter and reading'), findsNothing);
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
