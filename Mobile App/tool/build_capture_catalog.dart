import 'dart:convert';
import 'dart:io';

final photoPattern = RegExp(
  r'^(.+?)\s*-\s*(Electricity|Water)\s+Reading\s+(\d{2}\.\d{2}\.\d{4}|\d{4}\.\d{2}\.\d{2})\.(jpe?g)$',
  caseSensitive: false,
);

DateTime? parseArchiveDate(String text) {
  final parts = text.split('.').map(int.parse).toList();
  final yearFirst = text.split('.').first.length == 4;
  final year = yearFirst ? parts[0] : parts[2];
  final month = parts[1];
  final day = yearFirst ? parts[2] : parts[0];
  final date = DateTime(year, month, day);
  return date.year == year && date.month == month && date.day == day ? date : null;
}

Future<void> main(List<String> args) async {
  if (args.length != 2) {
    throw ArgumentError('Usage: dart run tool/build_capture_catalog.dart PORTFOLIO OUTPUT');
  }
  final portfolio = Directory(args[0]);
  if (!await portfolio.exists()) throw ArgumentError('Portfolio does not exist');
  final buildings = <Map<String, dynamic>>[];
  final cutoff = DateTime.now();
  await for (final building in portfolio.list(followLinks: false)) {
    if (building is! Directory) continue;
    final folderName = building.path.split(Platform.pathSeparator).last;
    final prefix = RegExp(r'^([A-Z]{3})\s*-\s*(.+)$').firstMatch(folderName);
    if (prefix == null) continue;
    final entries = <String, Map<String, dynamic>>{};
    var skipped = 0;
    await for (final section in building.list(followLinks: false)) {
      if (section is! Directory ||
          !section.path.split(Platform.pathSeparator).last.toUpperCase().contains('COUNCIL')) {
        continue;
      }
      await for (final file in section.list(recursive: true, followLinks: false)) {
        if (file is! File || !RegExp(r'\.(jpe?g|png)$', caseSensitive: false).hasMatch(file.path)) continue;
        final relative = file.path.substring(portfolio.path.length + 1).replaceAll('\\', '/');
        if (!relative.toLowerCase().contains('reading')) continue;
        final name = relative.split('/').last;
        final match = photoPattern.firstMatch(name);
        if (match == null) { skipped++; continue; }
        final dateText = match.group(3)!;
        final date = parseArchiveDate(dateText);
        if (date == null || date.isAfter(cutoff) || date.year != cutoff.year) { skipped++; continue; }
        final label = match.group(1)!.trim();
        final type = match.group(2)!.toLowerCase() == 'water' ? 'Water' : 'Electricity';
        final key = '$type|${label.toUpperCase().replaceAll(RegExp(r'\s+'), ' ')}';
        final year = date.year.toString();
        final month = date.month.toString().padLeft(2, '0');
        final day = date.day.toString().padLeft(2, '0');
        var folder = relative.substring(0, relative.lastIndexOf('/'));
        final cycle = '$year.$month.$day';
        if (!folder.split('/').contains(cycle)) { skipped++; continue; }
        folder = folder.split('/').map((part) => part == cycle ? '{cycle}' : part == year ? '{year}' : part).join('/');
        final entry = <String, dynamic>{
          'id': key, 'label': label, 'meterType': type,
          'fileTemplate': name.replaceFirst(dateText, '{date}'),
          'dateOrder': dateText.startsWith(year) ? 'ymd' : 'dmy',
          'folderTemplate': folder,
          'sourceDate': date.toIso8601String().substring(0, 10),
          'sourcePath': relative,
          'identityVerified': false,
          'conflictingTemplate': false,
        };
        final existing = entries[key];
        if (existing == null || (entry['sourceDate'] as String).compareTo(existing['sourceDate'] as String) > 0) {
          entries[key] = entry;
        } else if (entry['sourceDate'] == existing['sourceDate'] &&
            (entry['fileTemplate'] != existing['fileTemplate'] || entry['folderTemplate'] != existing['folderTemplate'])) {
          existing['conflictingTemplate'] = true;
        }
      }
    }
    final name = switch (prefix.group(1)) {
      'GEN' => 'Genesis', 'PHA' => 'Phanda Lodge',
      _ => prefix.group(2)!,
    };
    final meters = entries.values.toList()..sort((first, second) =>
        (first['id'] as String).compareTo(second['id'] as String));
    buildings.add({'name': name, 'portfolioFolder': folderName,
      'meters': meters, 'skippedImages': skipped});
  }
  buildings.sort((first, second) => (first['name'] as String).compareTo(second['name'] as String));
  final result = {'generatedAt': DateTime.now().toUtc().toIso8601String(),
    'scope': 'Current-year historical filenames, not verified physical meter identities',
    'buildings': buildings};
  final output = File(args[1]);
  await output.parent.create(recursive: true);
  await output.writeAsString(const JsonEncoder.withIndent('  ').convert(result));
  final decoded = jsonDecode(await output.readAsString()) as Map<String, dynamic>;
  for (final building in decoded['buildings'] as List) {
    stdout.writeln('${building['name']}: ${(building['meters'] as List).length} templates; ${building['skippedImages']} skipped');
  }
}