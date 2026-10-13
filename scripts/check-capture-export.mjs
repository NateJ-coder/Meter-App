import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelKey, normalizeExportMeterType, organizeCaptures, prepareCaptureExport } from '../assets/capture-export.mjs';

assert.equal(normalizeExportMeterType(' electricity '), 'Electricity');
assert.equal(normalizeExportMeterType('WATER'), 'Water');
assert.equal(normalizeExportMeterType('Gas'), '');
assert.equal(normalizeExportMeterType(null), '');

// Label keys: reader spelling variants collapse onto the workbook row.
for (const [building, label, expected] of [
    ['Phanda Lodge', 'PH 05', '5'], ['Phanda Lodge', 'UNIT 5', '5'], ['Phanda Lodge', 'No 5', '5'],
    ['Phanda Lodge', 'PHA 05', '5'], ['Phanda Lodge', '05', '5'], ['Phanda Lodge', 'Bulk 1', 'BULK 1'],
    ['Queensgate', 'QG  38A', '38A'], ['Queensgate', 'QG 38A', '38A'], ['Queensgate', '15', '15'],
    ['Genesis', 'GEN UNIT 30', '30'], ['Genesis', 'GEN30', '30'], ['Genesis', 'Com 1', 'COM 1'],
    ['Hazelmere', 'HM 50 A', '50A'], ['Hazelmere', 'G05', 'G05'], ['Hazelmere', 'Com Store 1', 'COM STORE 1'],
    ['Bonifay', 'Com Staff Room 1 (Willie)', 'COM STAFF ROOM 1 (WILLIE)'], ['Bonifay', 'Flat 12', '12']
]) assert.equal(labelKey(label, building), expected, `${building}: ${label}`);

// Plain export (no layout): per-type sheets, numeric strings become numbers.
const rows = [
    { label: 'GEN 10', meterType: 'Water', readingValue: '00012.5' },
    { label: 'GEN 2', meterType: ' electricity ', readingValue: '0' },
    { label: 'GEN 3', meterType: 'Electricity', readingValue: 'unverified' },
    { label: 'GEN 1', meterType: 'WATER', readingValue: '', isUnreadable: true, unreadableReason: 'Locked' },
    { label: 'GEN 4', meterType: '', readingValue: '44' }
];
const snapshot = structuredClone(rows);
const plain = prepareCaptureExport(rows);
assert.equal(plain.organized, false);
assert.deepEqual(plain.readingSheets, [
    { name: 'Electricity Readings', rows: [['GEN 2', 0], ['GEN 3', 'unverified']] },
    { name: 'Water Readings', rows: [['GEN 1', 'NO ACCESS: Locked'], ['GEN 10', 12.5]] },
    { name: 'Unclassified Readings', rows: [['GEN 4', 44]] }
]);
assert.deepEqual(plain.sortedRows.map((row) => row.label), ['GEN 1', 'GEN 2', 'GEN 3', 'GEN 4', 'GEN 10']);
assert.deepEqual(rows, snapshot);
assert.deepEqual(prepareCaptureExport([]).readingSheets, [
    { name: 'Electricity Readings', rows: [] },
    { name: 'Water Readings', rows: [] }
]);

// Organised export: workbook order, sections, relabels, duplicates, unmatched.
const layout = {
    electricity: [{ label: 'PH 01', row: 18 }, { label: 'PH 02', row: 19 }, { label: 'PH 03', row: 20 }, { label: 'Bulk 1', row: 21 }],
    water: [{ label: 'PH 01', row: 23 }, { label: 'Bulk 1', row: 24 }]
};
const captures = [
    { label: 'UNIT 3', meterType: 'Electricity', readingValue: '4190' },
    { label: 'UNIT 1', meterType: 'Electricity', readingValue: '3405', labelConfirmed: false },
    { label: 'KWH', meterType: 'Electricity', readingValue: '3107338' },
    { label: 'KVA', meterType: 'Electricity', readingValue: '95.9' },
    { label: 'UNIT 2', meterType: 'Electricity', readingValue: '7503' },
    { label: 'UNIT 2', meterType: 'Electricity', readingValue: '7510' },
    { label: 'BULK WATER', meterType: 'Water', readingValue: '4555' },
    { label: 'PH 01', meterType: 'Water', readingValue: '', isUnreadable: true, unreadableReason: 'Locked gate' }
];
const organized = organizeCaptures(captures, 'Phanda Lodge', layout);
assert.deepEqual(organized.rows, [
    ['ELECTRICITY', '', ''],
    ['PH 01', 3405, 'captured as "UNIT 1"; label not on meter list'],
    ['PH 02', '', 'CHECK: 2 captures - UNIT 2 = 7503 / UNIT 2 = 7510'],
    ['PH 03', 4190, 'captured as "UNIT 3"'],
    ['Bulk 1', 3107338, 'captured as "KWH"'],
    ['WATER', '', ''],
    ['PH 01', 'NO ACCESS: Locked gate', ''],
    ['Bulk 1', 4555, 'captured as "BULK WATER"'],
    ['UNMATCHED CAPTURES', '', 'not on the Utility Dash sheet - check the label'],
    ['KVA', 95.9, 'Electricity']
]);
assert.equal(organized.unmatched.length, 1);
assert.equal(organized.duplicates.length, 1);

const full = prepareCaptureExport(captures, 'Phanda Lodge', layout);
assert.equal(full.organized, true);
assert.equal(full.readingSheets.length, 1);
assert.equal(full.readingSheets[0].name, 'Readings');
assert.deepEqual(full.readingSheets[0].rows[0], ['Meter Label', 'Reading', 'Note']);
assert.equal(full.readingSheets[0].unmatched, 1);
assert.equal(full.readingSheets[0].duplicates, 1);

// Two identical captures of one meter are not a conflict.
const twin = organizeCaptures([
    { label: 'PH 01', meterType: 'Electricity', readingValue: '10' },
    { label: 'UNIT 1', meterType: 'Electricity', readingValue: '10' }
], 'Phanda Lodge', layout);
assert.deepEqual(twin.rows[1], ['PH 01', 10, '']);
assert.equal(twin.duplicates.length, 0);

// The generated layouts file must cover every building the dashboard offers.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layouts = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'export-layouts.json'), 'utf8')).layouts;
const dashboard = /<select id="building-select"[\s\S]*?<\/select>/.exec(
    fs.readFileSync(path.join(projectRoot, 'capture-dashboard.html'), 'utf8'))[0];
const offered = [...dashboard.matchAll(/<option(?: value="([^"]+)")?[^>]*>([^<]+)<\/option>/g)]
    .map((match) => match[1] ?? match[2].trim())
    .filter((name) => !['Test'].includes(name));
for (const building of offered) {
    assert.ok(layouts[building], `export-layouts.json is missing "${building}" - run node scripts/generate-export-layouts.mjs`);
    assert.ok(layouts[building].electricity.length > 0 && layouts[building].water.length > 0, `${building} layout is empty`);
}

console.log('Capture export checks passed.');
