import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:fuzio_meter_reader/capture.dart';
import 'package:fuzio_meter_reader/cycle_rules.dart';
import 'package:fuzio_meter_reader/firebase_upload_service.dart';
import 'package:fuzio_meter_reader/meter_registry.dart';

/// November 2026 cycle lessons: meters missed with no reason, placeholder
/// photos for meters that are not read, the same meter captured under two
/// labels, and the app's meter list not matching what is read on site.
Capture reading(String id, String label, String value, {String type = 'Electricity'}) => Capture(
      id: id,
      building: 'Phanda Lodge',
      label: label,
      meterType: type,
      readingValue: value,
      photoPath: '/$id.jpg',
      capturedAt: DateTime(2026, 11, 6, 9),
    );

void main() {
  test('the same reading on another meter this month is found, never the meter itself', () {
    final cycle = [reading('a', 'PHA 42', '2976'), reading('b', 'PHA 41', '5027')];
    expect(CycleRules.sameReadingElsewhere('PHA 40', 'Electricity', '2976', cycle)?.label, 'PHA 42');
    expect(CycleRules.sameReadingElsewhere('pha 42', 'Electricity', '2976', cycle), isNull);
    expect(CycleRules.sameReadingElsewhere('PHA 40', 'Water', '2976', cycle), isNull);
    expect(CycleRules.sameReadingElsewhere('PHA 40', 'Electricity', '0', cycle), isNull);
    expect(CycleRules.sameReadingElsewhere('PHA 40', 'Electricity', '2976,0', cycle)?.label, 'PHA 42');
  });

  test('outstanding meters are recorded as not read with the reason and no photo', () {
    const meters = [
      MeterOption(number: 'VG 23', type: 'Water', role: 'unit'),
      MeterOption(number: 'Bulk 1', type: 'Water', role: 'bulk'),
    ];
    var n = 0;
    final records = CycleRules.notReadRecords(
      meters: meters,
      building: 'Villino Glen',
      reason: 'Locked / no access',
      note: ' gate locked ',
      at: DateTime(2026, 10, 31, 10),
      newId: () => 'id${n++}',
    );
    expect(records.map((r) => r.label), ['VG 23', 'Bulk 1']);
    expect(records.every((r) => r.isUnreadable && r.photoPath.isEmpty && r.unreadableReason == 'Locked / no access'), isTrue);
    expect(records.first.unreadableNote, 'gate locked');
    expect(records.last.meterRole, 'bulk');
    // A recorded meter no longer counts as outstanding.
    final progress = CycleRules.progress(registry: meters, all: records, building: 'Villino Glen', now: DateTime(2026, 10, 31, 12));
    expect(progress.complete, isTrue);
  });

  test('free-text reasons need a note', () {
    expect(reasonNeedsNote('Other'), isTrue);
    expect(reasonNeedsNote('Could not find the meter'), isTrue);
    expect(reasonNeedsNote('Locked / no access'), isFalse);
    expect(notReadReasons, contains('Ran out of time - will return'));
  });

  test('a not-read record with no photo syncs its reading and never asks for a photo', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('{}', 200);
    });
    final record = Capture(
      id: 'not-read', building: 'Villino Glen', label: 'VG 23', meterType: 'Water', readingValue: '',
      photoPath: '', capturedAt: DateTime(2026, 10, 31), isUnreadable: true, unreadableReason: 'Locked / no access');
    await FirebaseUploadService.uploadCapture(record, client: client);
    expect(requests.map((r) => r.method), ['PATCH']);
    expect(record.readingSynced, isTrue);
    final fields = (jsonDecode(requests.single.body) as Map<String, dynamic>)['fields'];
    expect(fields['isUnreadable']['booleanValue'], isTrue);
    expect(fields['unreadableReason']['stringValue'], 'Locked / no access');
  });

  test('meters show and search by the name written on them', () {
    const com1 = MeterOption(number: 'Com 1', type: 'Electricity', role: 'common_property', aka: 'E1822');
    const unit = MeterOption(number: 'GEN 01', type: 'Electricity', role: 'unit');
    expect(com1.display, 'Com 1 - E1822');
    expect(unit.display, 'GEN 01');
    expect(com1.matches('e18'), isTrue);
    expect(com1.matches('com'), isTrue);
    expect(unit.matches('e18'), isFalse);
    expect(MeterOption.fromJson({'number': 'Com 1', 'type': 'Electricity', 'role': 'common_property', 'aka': 'E1822'}).aka, 'E1822');
  });

  test('a building only offers the services read there', () {
    const water = [MeterOption(number: 'VG 01', type: 'Water', role: 'unit')];
    const both = [
      MeterOption(number: 'QG 01', type: 'Water', role: 'unit'),
      MeterOption(number: 'QG 01', type: 'Electricity', role: 'unit'),
    ];
    expect(MeterRegistry.typesIn(water), ['Water']);
    expect(MeterRegistry.typesIn(both), ['Electricity', 'Water']);
    expect(MeterRegistry.typesIn(const []), ['Electricity', 'Water']);
  });

  test('the bundled meter list follows the capture profile', () {
    final registry = jsonDecode(File('assets/meter_registry.json').readAsStringSync()) as Map<String, dynamic>;
    List<Map<String, dynamic>> of(String b) => (registry[b] as List).cast<Map<String, dynamic>>();
    bool has(String b, String number, String type) => of(b).any((m) => m['number'] == number && m['type'] == type);

    expect(of('Villino Glen').every((m) => m['type'] == 'Water'), isTrue, reason: 'Villino Glen is water only');
    expect(of('Genesis').where((m) => m['type'] == 'Water').map((m) => m['number']).toSet(),
        {'Bulk 1', 'Bulk 2', 'Borehole Water', 'Mezzanine Water'});
    expect(of('Genesis').where((m) => m['type'] == 'Water').every((m) => m['requiredForCycle'] != false), isTrue);
    expect(of('Genesis').firstWhere((m) => m['number'] == 'Com 1' && m['type'] == 'Electricity')['aka'], 'E1822');
    expect(has('Genesis', 'Com 5', 'Electricity'), isFalse);
    expect(has('Hazelmere', 'G1', 'Electricity'), isFalse, reason: 'retired G/ST meters are not asked for');
    expect(has('Hazelmere', 'ST12', 'Electricity'), isFalse);
    expect(has('Hazelmere', 'G3', 'Electricity'), isTrue);
    expect(has('Hazelmere', '** HM 17', 'Electricity'), isTrue);
    expect(has('Phanda Lodge', 'PH 01', 'Water'), isFalse);
    expect(has('Phanda Lodge', 'Bulk 1', 'Water'), isTrue);
    expect(has('Rivonia Gate', 'RG 05', 'Electricity'), isFalse);
    expect(has('Rivonia Gate', 'RG 01', 'Electricity'), isTrue);
    expect(has('Queensgate', 'kVA', 'Electricity'), isTrue);
    expect(of('Vista Del Monte').length, 44);
    expect(of('Vista Del Monte').every((m) => m['requiredForCycle'] == false), isTrue);
    expect(MeterOption.fromJson(of('Vista Del Monte').first).requiredForCycle, isFalse);
  });

  test('Genesis completion requires only its real water meters', () {
    final registry = (jsonDecode(File('assets/meter_registry.json').readAsStringSync())
        as Map<String, dynamic>)['Genesis'] as List;
    final meters = registry.map((m) => MeterOption.fromJson(m as Map<String, dynamic>)).toList();
    final now = DateTime(2026, 11, 6);
    final electricity = meters.where((m) => m.type == 'Electricity').map((m) => Capture(
      id: m.number, building: 'Genesis', label: m.number, meterType: m.type,
      readingValue: '1', photoPath: '/photo.jpg', capturedAt: now,
    )).toList();
    final progress = CycleRules.progress(registry: meters, all: electricity, building: 'Genesis', now: now);
    expect(progress.missing.map((m) => m.number).toSet(),
        {'Bulk 1', 'Bulk 2', 'Borehole Water', 'Mezzanine Water'});
    final water = CycleRules.notReadRecords(
      meters: progress.missing, building: 'Genesis', reason: 'Locked / no access',
      at: now, newId: () => 'water',
    );
    expect(CycleRules.progress(registry: meters, all: [...electricity, ...water],
        building: 'Genesis', now: now).complete, isTrue);
  });
}
