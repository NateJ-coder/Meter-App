import assert from 'node:assert/strict';
import {
    groupMissingPhotos, missingPhotoLink, missingPhotoRows, missingPhotoSheet, missingPhotosSince, photoStatus
} from '../assets/capture-photos.mjs';

const now = new Date('2026-10-14T10:00:00+02:00');
const at = (iso) => new Date(iso);
const rows = [
    { id: 'up', building: 'Queensgate', label: 'QG 01', meterType: 'Electricity', readingValue: '10',
        photoUrl: 'https://x/1.jpg', capturedAtDate: at('2026-10-13T08:00:00+02:00') },
    { id: 'none', building: 'Queensgate', label: 'QG 05', meterType: 'Electricity', readingValue: '4410',
        photoUrl: '', noPhoto: true, noPhotoReason: 'Meter behind glass / in a locked box', noPhotoNote: 'key with caretaker',
        capturedAtDate: at('2026-10-13T09:00:00+02:00') },
    { id: 'lost', building: 'Hazelmere', label: 'HM 28A', meterType: 'Water', readingValue: '153',
        photoUrl: '', noPhoto: true, noPhotoReason: 'Photo lost on the phone before upload', noPhotoNote: '',
        capturedAtDate: at('2026-10-12T09:00:00+02:00') },
    { id: 'locked', building: 'Hazelmere', label: 'G3', meterType: 'Electricity', readingValue: '',
        photoUrl: '', isUnreadable: true, unreadableReason: 'Locked / no access', unreadableNote: 'gate chained',
        capturedAtDate: at('2026-10-12T10:00:00+02:00') },
    { id: 'fresh', building: 'Genesis', label: 'GEN UNIT 30', meterType: 'Electricity', readingValue: '7',
        photoUrl: '', capturedAtDate: at('2026-10-14T09:30:00+02:00') },
    { id: 'old', building: 'Genesis', label: 'GEN 9', meterType: 'Electricity', readingValue: '8',
        photoUrl: '', capturedAtDate: at('2026-10-01T09:30:00+02:00') },
    { id: 'legacy-unreadable', building: 'Genesis', label: 'Bulk 1', meterType: 'Water', readingValue: '',
        photoUrl: 'https://x/gate.jpg', isUnreadable: true, unreadableReason: 'Locked / no access',
        capturedAtDate: at('2026-10-02T09:30:00+02:00') }
];

assert.deepEqual(photoStatus(rows[0], now), { state: 'uploaded', reason: '', note: '', text: 'Photo uploaded' });
assert.deepEqual(photoStatus(rows[1], now), {
    state: 'none', reason: 'Meter behind glass / in a locked box', note: 'key with caretaker',
    text: 'No photo: Meter behind glass / in a locked box - key with caretaker'
});
assert.equal(photoStatus(rows[2], now).text, 'No photo: Photo lost on the phone before upload');
assert.deepEqual(photoStatus(rows[3], now), {
    state: 'none', reason: 'Unable to read: Locked / no access', note: 'gate chained',
    text: 'No photo - unable to read: Locked / no access - gate chained'
});
assert.equal(photoStatus(rows[4], now).state, 'pending');
assert.equal(photoStatus(rows[4], now).stale, false);
assert.equal(photoStatus(rows[5], now).stale, true);
assert.match(photoStatus(rows[5], now).text, /ask the reader/);
assert.equal(photoStatus(rows[6], now).state, 'uploaded', 'an unreadable meter with a gate photo is not missing a photo');
// A no-photo reason without the flag (older doc shape) still counts as "none".
assert.equal(photoStatus({ photoUrl: '', noPhotoReason: 'Other', capturedAtDate: now }, now).state, 'none');
assert.equal(photoStatus({ photoUrl: '', noPhoto: true, capturedAtDate: now }, now).text, 'No photo: reason not recorded');

assert.deepEqual(missingPhotoRows(rows, now).map(({ row }) => row.id), ['fresh', 'none', 'locked', 'lost', 'old']);

const groups = groupMissingPhotos(rows, now);
assert.deepEqual(groups.map((g) => [g.building, g.none, g.pending, g.entries.map((e) => e.row.id)]), [
    ['Genesis', 0, 2, ['fresh', 'old']],
    ['Hazelmere', 2, 0, ['locked', 'lost']],
    ['Queensgate', 1, 0, ['none']]
]);
assert.deepEqual(groupMissingPhotos([rows[0]], now), []);

assert.equal(missingPhotosSince(now).toISOString(), new Date(2026, 8, 1).toISOString());
assert.equal(missingPhotosSince(new Date('2026-01-15T00:00:00'), 1).getMonth(), 11);

assert.equal(missingPhotoLink(rows[1]), 'capture-dashboard.html?building=Queensgate&month=2026-10&unit=5');
assert.equal(missingPhotoLink(rows[3]), 'capture-dashboard.html?building=Hazelmere&month=2026-10');
assert.equal(missingPhotoLink(rows[4]), 'capture-dashboard.html?building=Genesis&month=2026-10&unit=30');

const sheet = missingPhotoSheet(rows, now);
assert.deepEqual(sheet[0], ['Building', 'Meter Label', 'Type', 'Reading', 'Captured At', 'Photo Status', 'Reason', 'Note', 'Capture ID']);
assert.equal(sheet.length, 6);
assert.deepEqual(sheet[1], ['Genesis', 'GEN UNIT 30', 'Electricity', '7', '2026-10-14T07:30:00.000Z', 'Pending', '', '', 'fresh']);
assert.deepEqual(sheet[2].slice(5), ['Pending (overdue)', '', '', 'old']);
assert.deepEqual(sheet[3], ['Hazelmere', 'G3', 'Electricity', 'NO ACCESS: Locked / no access', '2026-10-12T08:00:00.000Z',
    'No photo', 'Unable to read: Locked / no access', 'gate chained', 'locked']);
assert.deepEqual(sheet[5].slice(5), ['No photo', 'Meter behind glass / in a locked box', 'key with caretaker', 'none']);

console.log('Capture photo checks passed.');
