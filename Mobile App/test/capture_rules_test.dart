import 'package:flutter_test/flutter_test.dart';
import 'package:fuzio_meter_reader/reading_cleaner.dart';
import 'package:fuzio_meter_reader/capture.dart';
import 'package:fuzio_meter_reader/capture_store.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:fuzio_meter_reader/firebase_upload_service.dart';
import 'package:fuzio_meter_reader/app_updater.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../tool/build_capture_catalog.dart' as catalog;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('Update prompt requires a higher hosted build number', () async {
    PackageInfo.setMockInitialValues(appName: 'Meter Reader', packageName: 'test',
      version: '1.0.2', buildNumber: '3', buildSignature: '');
    var hostedBuild = 3;
    final client = MockClient((request) async => http.Response(jsonEncode({
      'version': '1.0.3', 'buildNumber': hostedBuild,
      'apkUrl': 'https://example.invalid/release.apk', 'required': false,
    }), 200));
    addTearDown(client.close);
    expect(await AppUpdater.checkForUpdate(client: client), isNull);
    hostedBuild = 4;
    expect((await AppUpdater.checkForUpdate(client: client))?.buildNumber, 4);
    hostedBuild = 2;
    expect(await AppUpdater.checkForUpdate(client: client), isNull);
  });

  test('Reading and review note sync first; failed photo retries only update photo', () async {
    final directory = await Directory.systemTemp.createTemp('meter-upload-test');
    addTearDown(() => directory.delete(recursive: true));
    final file = await File('${directory.path}/photo.jpg').writeAsBytes([1, 2, 3]);
    final capture = Capture(id: 'upload-test', building: 'Genesis', label: 'GEN 01',
      meterType: 'Electricity', readingValue: '123.4', photoPath: file.path,
      capturedAt: DateTime(2026), reviewNote: 'Checked the display',
      reviewWarnings: ['Admin value differs'], reviewAcknowledged: true);
    final requests = <http.Request>[];
    var storageBlocked = true;
    var linkBlocked = true;
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'POST') {
        return storageBlocked ? http.Response('billing unavailable', 402)
            : http.Response('{"downloadTokens":"test-token"}', 200);
      }
      final mask = request.url.queryParametersAll['updateMask.fieldPaths']!;
      if (mask.length == 1 && mask.single == 'photoUrl' && linkBlocked) {
        return http.Response('temporary error', 503);
      }
      return http.Response('{}', 200);
    });
    addTearDown(client.close);
    await expectLater(FirebaseUploadService.uploadCapture(capture, client: client), throwsException);
    expect(requests.map((request) => request.method), ['PATCH', 'POST']);
    final fields = (jsonDecode(requests.first.body) as Map<String, dynamic>)['fields'];
    expect(fields['readerNote']['stringValue'], 'Checked the display');
    expect(fields['rawReadingValue']['stringValue'], '123.4');
    expect(fields['readingValue']['stringValue'], '123');
    expect(requests.first.url.queryParametersAll['updateMask.fieldPaths'], isNot(contains('photoUrl')));
    expect(capture.readingSynced, isTrue);
    requests.clear();
    storageBlocked = false;
    await expectLater(FirebaseUploadService.uploadCapture(capture, client: client), throwsException);
    expect(requests.map((request) => request.method), ['POST', 'PATCH']);
    expect(capture.photoUrl, isNotNull);
    requests.clear();
    linkBlocked = false;
    await FirebaseUploadService.uploadCapture(capture, client: client);
    expect(requests.single.method, 'PATCH');
    expect(requests.single.url.queryParametersAll['updateMask.fieldPaths'], ['photoUrl']);
  });

  test('Concurrent per-capture writes retain readings from other buildings', () async {
    SharedPreferences.setMockInitialValues({});
    final first = Capture(id: 'one', building: 'Genesis', label: 'GEN 01',
      meterType: 'Electricity', readingValue: '123', photoPath: '/one.jpg', capturedAt: DateTime(2026));
    final second = Capture(id: 'two', building: 'Bonifay', label: 'Flat 1',
      meterType: 'Electricity', readingValue: '456', photoPath: '/two.jpg', capturedAt: DateTime(2026));
    await Future.wait([CaptureStore.saveCapture(first), CaptureStore.saveCapture(second)]);
    first.status = CaptureStatus.done;
    await CaptureStore.saveCapture(first);
    final saved = await CaptureStore.loadAll();
    expect(saved.length, 2);
    expect(saved.first.status, CaptureStatus.done);
    expect(saved.last.building, 'Bonifay');
  });

  test('Corrupt queue is reported and cannot be overwritten by a new capture', () async {
    SharedPreferences.setMockInitialValues({'fuzio_captures_v1': 'damaged'});
    await expectLater(CaptureStore.loadAll(), throwsFormatException);
    final capture = Capture(id: 'new', building: 'Genesis', label: 'GEN 01',
      meterType: 'Electricity', readingValue: '123', photoPath: '/one.jpg', capturedAt: DateTime(2026));
    await expectLater(CaptureStore.saveCapture(capture), throwsFormatException);
    expect((await SharedPreferences.getInstance()).getString('fuzio_captures_v1'), 'damaged');
    SharedPreferences.setMockInitialValues({});
    await CaptureStore.saveCapture(capture);
    expect((await CaptureStore.loadAll()).single.id, 'new');
  });

  test('Review flags are advisory and survive local serialization', () {
    final warnings = ReadingCleaner.reviewWarnings('123', '123', previousReading: '200');
    expect(warnings.length, 2);
    final capture = Capture(id: 'review', building: 'Genesis', label: 'GEN 01',
        meterType: 'Electricity', readingValue: '123', photoPath: '/photo.jpg',
        capturedAt: DateTime(2026, 9, 22), reviewNote: 'Meter replaced',
        reviewWarnings: warnings, reviewAcknowledged: true);
    final restored = Capture.decodeList(Capture.encodeList([capture])).single;
    expect(restored.reviewNote, 'Meter replaced');
    expect(restored.reviewWarnings, warnings);
    expect(restored.reviewAcknowledged, isTrue);
    final legacy = capture.toJson()..remove('reviewNote')..remove('reviewWarnings')..remove('reviewAcknowledged');
    expect(Capture.fromJson(legacy).reviewNote, isEmpty);
    expect(ReadingCleaner.reviewWarnings('123.4', '123.4', previousReading: '100'), isEmpty);
    expect(ReadingCleaner.reviewWarnings('123.4', '123.4', previousReading: '123.4').single, contains('Unchanged'));
    expect(ReadingCleaner.reviewWarnings('1234.0', '1234.0', previousReading: '100').single, contains('ten times'));
  });

  test('Archive parser accepts exact templates and rejects ambiguous names', () {
    final match = catalog.photoPattern.firstMatch('Flat 1 - Electricity Reading 31.07.2026.jpg');
    expect(match?.group(1), 'Flat 1');
    expect(catalog.parseArchiveDate('31.07.2026'), DateTime(2026, 7, 31));
    expect(catalog.parseArchiveDate('2026.07.31'), DateTime(2026, 7, 31));
    expect(catalog.parseArchiveDate('31.02.2026'), isNull);
    expect(catalog.photoPattern.firstMatch('IMG_0001.jpg'), isNull);
    expect(catalog.photoPattern.firstMatch('Bulk - Electricity Reading 31.07.2026 (2).jpg'), isNull);
  });

  String clean(String building, String label, String value,
          [String type = 'Electricity']) =>
      ReadingCleaner.clean(building: building, label: label,
          meterType: type, rawValue: value);

  test('Genesis unit policy truncates fractions without guessing decimals', () {
    expect(clean('Genesis', 'GEN UNIT 47', '059240.6'), '59240');
    expect(clean('Genesis', 'GEN 01', '00000.9'), '0');
    expect(clean('Genesis', 'GEN 01', '58773.7'), '58773');
    expect(clean('Genesis', 'GEN 02', '58538.3'), '58538');
    expect(clean('Genesis', 'GEN 03', '50446.9'), '50446');
    expect(clean('Genesis', 'GEN 01', '0592406'), '592406');
    expect(clean('Genesis', 'Com 3', '8320.8'), '8320.8');
    expect(clean('Genesis', 'GEN E1922', '105.80'), '105.80');
    expect(clean('Genesis', 'GEN 01', '105.80', 'Water'), '105.80');
  });

  test('Phanda preserves bulk, water and reactive register precision', () {
    expect(clean('Phanda Lodge', 'PH 01', '00078.9'), '78');
    expect(clean('Phanda Lodge', 'BULK ELECTRICITY', '105.80'), '105.80');
    expect(clean('Phanda Lodge', 'WATER', '9460.5', 'Water'), '9460.5');
    expect(clean('Phanda Lodge', 'PH 01', '105.80', 'Water'), '105.80');
  });

  test('Ambiguous and malformed input is rejected, not silently repaired', () {
    for (final value in ['', '-12', '1,25', '1.2.3', '12abc', '12.', '.2']) {
      expect(ReadingCleaner.validate(value), isNotNull, reason: value);
    }
    for (final value in ['0', '00012', '12.30', ' 12.30 ']) {
      expect(ReadingCleaner.validate(value), isNull, reason: value);
    }
  });

  test('Hazelmere staff exception retains its final digit', () {
    expect(clean('Hazelmere', 'HM 17 STAFF', '337.1'), '3371');
    expect(clean('Hazelmere', '** HM 17', '337.1'), '3371');
    expect(clean('Hazelmere', '**Staff Quarter', '7786.5', 'Water'), '7786');
    expect(clean('Hazelmere', 'HM 17', '337.1'), '337');
  });
}