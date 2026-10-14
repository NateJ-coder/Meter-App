import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fuzio_meter_reader/capture.dart';
import 'package:fuzio_meter_reader/cycle_rules.dart';
import 'package:fuzio_meter_reader/firebase_upload_service.dart';
import 'package:fuzio_meter_reader/meter_registry.dart';
import 'package:fuzio_meter_reader/upload_queue.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  const registry = [
    MeterOption(number: 'QG 01', type: 'Electricity', role: 'unit'),
    MeterOption(number: 'QG 05', type: 'Electricity', role: 'unit'),
    MeterOption(number: 'QG 15', type: 'Electricity', role: 'unit'),
    MeterOption(number: 'QG 28A', type: 'Electricity', role: 'unit'),
    MeterOption(number: 'Bulk 1', type: 'Electricity', role: 'bulk'),
    MeterOption(number: 'Com Store 1', type: 'Electricity', role: 'common_property'),
    MeterOption(number: 'G3', type: 'Electricity', role: 'unit'),
  ];

  test('a typed label suggests the registered meter it probably means', () {
    List<String> names(String typed) =>
        CycleRules.suggestions(typed, registry).map((m) => m.number).toList();
    expect(names('5'), ['QG 05']);
    expect(names('unit 05'), ['QG 05']);
    expect(names('No 5'), ['QG 05']);
    expect(names('qg5'), ['QG 05']);
    expect(names('QG-05'), ['QG 05']);
    expect(names('28 a'), ['QG 28A']);
    expect(names('QG 28'), isEmpty, reason: '28 is not 28A');
    expect(names('1'), ['QG 01'], reason: 'a bare number never means the bulk meter');
    expect(names('bulk1'), ['Bulk 1']);
    expect(names('com store 01'), ['Com Store 1']);
    expect(names('3'), ['G3']);
    expect(names('XYZ'), isEmpty);
    expect(names('   '), isEmpty);
    expect(CycleRules.suggestions('5', registry, limit: 0), isEmpty);
  });

  test('a reading needs a photo unless the reader says why there is none', () {
    String? problem({bool hasPhoto = false, bool noPhoto = false, String reason = '',
            String note = '', bool unreadable = false}) =>
        CycleRules.photoProblem(hasPhoto: hasPhoto, noPhoto: noPhoto, noPhotoReason: reason,
            noPhotoNote: note, isUnreadable: unreadable);
    expect(problem(hasPhoto: true), isNull);
    expect(problem(), contains('take a photo'));
    expect(problem(noPhoto: true), contains('choose why'));
    expect(problem(noPhoto: true, reason: 'Too dark or no light to photograph'), isNull);
    expect(problem(noPhoto: true, reason: 'Other'), contains('add a note'));
    expect(problem(noPhoto: true, reason: 'Other', note: 'meter in the ceiling'), isNull);
    expect(problem(unreadable: true), isNull, reason: 'nothing to photograph behind a locked gate');
  });

  test('no-photo fields round-trip through local storage and default off for old records', () {
    final capture = Capture(id: 'np', building: 'Queensgate', label: 'QG 05', meterType: 'Water',
        readingValue: '12', photoPath: '', capturedAt: DateTime(2026, 10, 14),
        noPhoto: true, noPhotoReason: 'Other', noPhotoNote: 'box key with caretaker');
    final restored = Capture.decodeList(Capture.encodeList([capture])).single;
    expect(restored.noPhoto, isTrue);
    expect(restored.noPhotoReason, 'Other');
    expect(restored.noPhotoNote, 'box key with caretaker');
    expect(restored.hasPhotoFile, isFalse);
    expect(restored.photoPending, isFalse);
    final old = Capture.fromJson({
      'id': 'old', 'building': 'Genesis', 'label': 'GEN 01', 'meterType': 'Electricity',
      'readingValue': '1', 'photoPath': '/old.jpg', 'capturedAt': '2026-10-01T08:00:00.000',
    });
    expect(old.noPhoto, isFalse);
    expect(old.photoPending, isTrue);
  });

  test('a capture without a photo syncs the reason and is flagged, with no Storage upload', () async {
    final capture = Capture(id: 'no-photo', building: 'Queensgate', label: 'QG 05',
        meterType: 'Electricity', readingValue: '4410', photoPath: '',
        capturedAt: DateTime(2026, 10, 14), noPhoto: true,
        noPhotoReason: 'Meter behind glass / in a locked box', noPhotoNote: 'key with caretaker');
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('{}', 200);
    });
    addTearDown(client.close);
    await FirebaseUploadService.uploadCapture(capture, client: client);
    expect(requests.map((r) => r.method), ['PATCH']);
    final fields = (jsonDecode(requests.single.body) as Map<String, dynamic>)['fields'];
    expect(fields['noPhoto']['booleanValue'], isTrue);
    expect(fields['noPhotoReason']['stringValue'], 'Meter behind glass / in a locked box');
    expect(fields['noPhotoNote']['stringValue'], 'key with caretaker');
    expect(fields['flagged']['booleanValue'], isTrue);
    expect(capture.readingSynced, isTrue);
    expect(capture.photoUrl, isNull);
  });

  test('a photo file lost before upload is reported once instead of retried forever', () async {
    final capture = Capture(id: 'lost', building: 'Queensgate', label: 'QG 01',
        meterType: 'Electricity', readingValue: '10', photoPath: '/nonexistent/photo.jpg',
        capturedAt: DateTime(2026, 10, 14), readingSynced: true);
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('{}', 200);
    });
    addTearDown(client.close);
    await FirebaseUploadService.uploadCapture(capture, client: client);
    expect(requests.map((r) => r.method), ['PATCH']);
    final mask = requests.single.url.queryParametersAll['updateMask.fieldPaths']!;
    expect(mask, ['noPhoto', 'noPhotoReason', 'noPhotoNote']);
    expect(capture.noPhoto, isTrue);
    expect(capture.noPhotoReason, 'Photo lost on the phone before upload');
    expect(capture.photoPending, isFalse);
  });

  test('a photo that exists still uploads after the reading', () async {
    final directory = await Directory.systemTemp.createTemp('photo-rules-test');
    addTearDown(() => directory.delete(recursive: true));
    final file = await File('${directory.path}/photo.jpg').writeAsBytes([1, 2, 3]);
    final capture = Capture(id: 'with-photo', building: 'Queensgate', label: 'QG 01',
        meterType: 'Electricity', readingValue: '10', photoPath: file.path,
        capturedAt: DateTime(2026, 10, 14));
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response(request.method == 'POST' ? '{"downloadTokens":"t"}' : '{}', 200);
    });
    addTearDown(client.close);
    await FirebaseUploadService.uploadCapture(capture, client: client);
    expect(requests.map((r) => r.method), ['PATCH', 'POST', 'PATCH']);
    final fields = (jsonDecode(requests.first.body) as Map<String, dynamic>)['fields'];
    expect(fields['noPhoto']['booleanValue'], isFalse);
    expect(fields['flagged']['booleanValue'], isFalse);
    expect(capture.photoUrl, contains('token=t'));
  });

  test('pending summary separates readings, photos and failures', () {
    Capture c(String id, {bool synced = false, String? url, bool noPhoto = false,
            CaptureStatus status = CaptureStatus.pending}) =>
        Capture(id: id, building: 'Genesis', label: id, meterType: 'Electricity', readingValue: '1',
            photoPath: noPhoto ? '' : '/$id.jpg', capturedAt: DateTime(2026, 10, 14),
            readingSynced: synced, photoUrl: url, noPhoto: noPhoto, status: status);
    final summary = UploadQueue.summarize([
      c('a'), // reading not sent
      c('b', synced: true), // photo to go
      c('c', synced: true, status: CaptureStatus.failed), // photo failed
      c('d', synced: true, noPhoto: true, status: CaptureStatus.done), // nothing to send
      c('e', synced: true, url: 'https://x', status: CaptureStatus.done),
    ]);
    expect(summary.readings, 1);
    expect(summary.photos, 2);
    expect(summary.failed, 1);
    expect(summary.describe(), '1 reading and 2 photos');
    expect(UploadQueue.summarize(const []).isEmpty, isTrue);
  });
}
