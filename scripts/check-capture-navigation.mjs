import assert from 'node:assert/strict';
import { captureMonth, filterCaptures, normalizeUnit, readNavigation, unitFromLabel } from '../assets/capture-navigation.mjs';

const buildings = ['Hazelmere', 'Genesis', 'Bonifay'];
assert.deepEqual(readNavigation('?building=HZM&month=2026-10&unit=028', buildings),
    { building: 'Hazelmere', month: '2026-10', unit: '28' });
assert.deepEqual(readNavigation('', buildings), { building: '', month: '', unit: '' });
assert.throws(() => readNavigation('?building=Hazel&unit=28', buildings));
assert.throws(() => readNavigation('?month=2026-13', buildings));
assert.throws(() => readNavigation('?unit=28%20or%2029', buildings));
assert.equal(normalizeUnit('Unit 028 A'), '28A');
for (const [building, label, expected] of [
    ['Hazelmere', 'HZM UNIT 028', '28'], ['Hazelmere', 'HM 28A', '28A'],
    ['Hazelmere', 'G28', null], ['Hazelmere', 'Bulk 28', null],
    ['Bonifay', 'BON 01', '1'], ['Bonifay', 'BC 01', '1'],
    ['Genesis', 'GEN UNIT 01', '1'], ['Phanda Lodge', 'PHA 28', '28']
]) assert.equal(unitFromLabel(building, label), expected);
assert.equal(captureMonth(new Date('2026-09-30T22:00:00Z')), '2026-10');
assert.equal(captureMonth(new Date('2026-09-30T21:59:59Z')), '2026-09');
const rows = ['HZM 28', 'HZM 128', 'HZM 28A', 'G28', 'Bulk 28'].map(label => ({
    label, capturedAtDate: new Date('2026-10-01T00:00:00Z')
}));
assert.deepEqual(filterCaptures(rows, { building: 'Hazelmere', month: '2026-10', unit: '28' }), [rows[0]]);
assert.deepEqual(filterCaptures(rows, { building: 'Hazelmere', month: '2026-11', unit: '28' }), []);
assert.deepEqual(filterCaptures(rows, { building: 'Hazelmere', month: '', unit: '' }), rows);
console.log('Capture navigation checks passed.');
