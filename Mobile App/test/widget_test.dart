// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:fuzio_meter_reader/add_capture_screen.dart';

import 'package:fuzio_meter_reader/main.dart';

void main() {
  testWidgets('Next returns the review note on a small phone', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    String? savedNote;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
      body: TextButton(onPressed: () async {
        savedNote = await showDialog<String>(context: context, builder: (_) => const ReadingReviewDialog(
          photo: SizedBox(height: 200), meter: 'Bonifay Flat 1 Electricity', rawValue: '123',
          cleanedValue: '123', warnings: ['No decimal entered. Check the display.']));
      }, child: const Text('Review')),
    ))));
    await tester.tap(find.text('Review'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(TextField));
    await tester.enterText(find.byType(TextField), 'Meter replaced today');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();
    expect(savedNote, 'Meter replaced today');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Warning can be accepted with a note or a checkbox', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ReadingReviewDialog(
      photo: SizedBox(height: 20), meter: 'Genesis GEN 01', rawValue: '123',
      cleanedValue: '123', warnings: ['Check the decimal position.'],
    ))));
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Next')).onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'Display has no fractional digit');
    await tester.pump();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Next')).onPressed, isNotNull);
    await tester.enterText(find.byType(TextField), '');
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Next')).onPressed, isNotNull);
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
    expect(find.text('Bonifay'), findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
  });
}
