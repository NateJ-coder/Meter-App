import 'package:flutter_test/flutter_test.dart';
import 'package:fuzio_meter_reader/capture.dart';
import 'package:fuzio_meter_reader/cycle_rules.dart';
import 'package:fuzio_meter_reader/meter_registry.dart';

Capture cap(String id, String building, String label, String type,
        {DateTime? at, bool unreadable = false}) =>
    Capture(
      id: id,
      building: building,
      label: label,
      meterType: type,
      readingValue: unreadable ? '' : '100',
      photoPath: '/$id.jpg',
      capturedAt: at ?? DateTime(2026, 10, 8, 9),
      isUnreadable: unreadable,
      unreadableReason: unreadable ? 'Locked / no access' : '',
    );

void main() {
  const registry = [
    MeterOption(number: 'QG 01', type: 'Electricity', role: 'unit'),
    MeterOption(number: 'QG 01', type: 'Water', role: 'unit'),
    MeterOption(number: 'QG 02A', type: 'Electricity', role: 'unit'),
    MeterOption(number: 'QG 02', type: 'Water', role: 'unit'),
    MeterOption(number: 'Bulk 1', type: 'Electricity', role: 'bulk'),
  ];
  final now = DateTime(2026, 10, 13, 15);

  test('labels match regardless of case and spacing', () {
    expect(CycleRules.labelKey('qg  38a'), 'QG 38A');
    expect(CycleRules.labelKey(' QG 38A '), 'QG 38A');
    expect(CycleRules.cycleKey(DateTime(2026, 10, 1)), '2026-10');
  });

  test('a meter captured this month is no longer offered for that type only', () {
    final cycle = [cap('a', 'Queensgate', 'qg 01', 'Electricity')];
    final electricity = CycleRules.availableMeters(registry, 'Electricity', cycle);
    final water = CycleRules.availableMeters(registry, 'Water', cycle);
    expect(electricity.map((m) => m.number), ['QG 02A', 'Bulk 1']);
    expect(water.map((m) => m.number), ['QG 01', 'QG 02']);
  });

  test('duplicate detection ignores the capture being edited and other months', () {
    final cycle = [
      cap('a', 'Queensgate', 'QG 01', 'Electricity'),
      cap('old', 'Queensgate', 'QG 02A', 'Electricity', at: DateTime(2026, 9, 3)),
    ];
    expect(CycleRules.duplicateOf('QG 01', 'Electricity', cycle)?.id, 'a');
    expect(CycleRules.duplicateOf('QG 01', 'Water', cycle), isNull);
    expect(CycleRules.duplicateOf('QG 01', 'Electricity', cycle, excludeId: 'a'), isNull);
    expect(CycleRules.duplicateOf('G3', 'Electricity', [cap('g', 'Hazelmere', 'g3', 'Electricity')])?.id, 'g');
    final thisMonth = CycleRules.cycleCaptures(cycle, 'Queensgate', now);
    expect(thisMonth.map((c) => c.id), ['a']);
  });

  test('progress counts unreadable captures as done and lists what is missing', () {
    final all = [
      cap('a', 'Queensgate', 'QG 01', 'Electricity'),
      cap('b', 'Queensgate', 'QG 01', 'Water', unreadable: true),
      cap('c', 'Queensgate', 'Bulk 1', 'Electricity', at: DateTime(2026, 9, 3)), // last month
      cap('d', 'Hazelmere', 'QG 02A', 'Electricity'), // other building
    ];
    final progress = CycleRules.progress(registry: registry, all: all, building: 'Queensgate', now: now);
    expect(progress.registered, 5);
    expect(progress.done, 2);
    expect(progress.complete, isFalse);
    expect(progress.missing.map((m) => '${m.number}|${m.type}'),
        ['QG 02A|Electricity', 'QG 02|Water', 'Bulk 1|Electricity']);
    expect(progress.describeMissing(limit: 2), 'QG 02A (Electricity), QG 02 (Water) and 1 more');
  });

  test('a building without a registry is never blocked', () {
    final progress = CycleRules.progress(
        registry: const [], all: [cap('a', 'Transvalia', 'X 1', 'Electricity')], building: 'Transvalia', now: now);
    expect(progress.complete, isTrue);
  });

  test('unfinished buildings exclude the one being opened and complete ones', () async {
    final all = [
      cap('a', 'Queensgate', 'QG 01', 'Electricity'),
      cap('b', 'Phanda Lodge', 'PH 01', 'Electricity'),
      cap('c', 'Transvalia', 'X 1', 'Electricity'),
    ];
    final registries = {
      'Queensgate': registry,
      'Phanda Lodge': const [MeterOption(number: 'PH 01', type: 'Electricity', role: 'unit')],
      'Transvalia': const <MeterOption>[],
    };
    final unfinished = await CycleRules.unfinishedBuildings(registries: registries, all: all, now: now);
    expect(unfinished.map((p) => p.building), ['Queensgate']);
    final opening = await CycleRules.unfinishedBuildings(
        registries: registries, all: all, now: now, except: 'queensgate');
    expect(opening, isEmpty);
  });
}
