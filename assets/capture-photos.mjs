/**
 * capture-photos.mjs
 * Photo status of mobile captures and the "Missing photos" list shown when
 * the office signs in to the dashboard.
 *
 * A reading can reach the server without a photo for three reasons, and the
 * office needs to treat them differently:
 *   - none:    the reader recorded why no photo could be taken (app v1.0.7+),
 *              or the app found the photo file lost before upload. Follow up
 *              with the reader or the site; nothing more will arrive.
 *   - pending: the reading is on the server but the phone has not uploaded
 *              the photo yet (no signal, app closed). It usually arrives once
 *              the app is opened with signal; chase the reader if it is old.
 *   - uploaded: photo on the server.
 *
 * Pure functions only (no DOM, no Firebase) so scripts/check-capture-photos.mjs
 * can exercise them in Node.
 */
import { captureMonth, unitFromLabel } from './capture-navigation.mjs';

const PENDING_AFTER_HOURS = 24;

export function photoStatus(row, now = new Date()) {
    if (row.photoUrl) return { state: 'uploaded', reason: '', note: '', text: 'Photo uploaded' };
    const reason = String(row.noPhotoReason ?? '').trim();
    const note = String(row.noPhotoNote ?? '').trim();
    if (row.noPhoto === true || reason) {
        const text = `No photo: ${reason || 'reason not recorded'}${note ? ` - ${note}` : ''}`;
        return { state: 'none', reason: reason || 'reason not recorded', note, text };
    }
    if (row.isUnreadable === true) {
        const why = String(row.unreadableReason ?? '').trim() || 'reason not recorded';
        const unreadableNote = String(row.unreadableNote ?? '').trim();
        return {
            state: 'none', reason: `Unable to read: ${why}`, note: unreadableNote,
            text: `No photo - unable to read: ${why}${unreadableNote ? ` - ${unreadableNote}` : ''}`
        };
    }
    const ageHours = (now - row.capturedAtDate) / 3600000;
    const stale = Number.isFinite(ageHours) && ageHours >= PENDING_AFTER_HOURS;
    return {
        state: 'pending', reason: '', note: '', stale,
        text: stale
            ? 'Still waiting for the phone to upload it - ask the reader to open the app where there is signal'
            : 'Waiting for the phone to upload it'
    };
}

/** Rows without a photo, newest first, each annotated with its photo status. */
export function missingPhotoRows(rows, now = new Date()) {
    return rows
        .map((row) => ({ row, photo: photoStatus(row, now) }))
        .filter(({ photo }) => photo.state !== 'uploaded')
        .sort((a, b) => b.row.capturedAtDate - a.row.capturedAtDate);
}

/** Missing-photo rows grouped by building, buildings alphabetical. */
export function groupMissingPhotos(rows, now = new Date()) {
    const groups = new Map();
    for (const entry of missingPhotoRows(rows, now)) {
        const building = String(entry.row.building ?? '').trim() || 'Unknown building';
        if (!groups.has(building)) groups.set(building, { building, none: 0, pending: 0, entries: [] });
        const group = groups.get(building);
        group.entries.push(entry);
        if (entry.photo.state === 'none') group.none += 1;
        else group.pending += 1;
    }
    return [...groups.values()].sort((a, b) => a.building.localeCompare(b.building));
}

/** First day of the month [monthsBack] months before [now], local time. */
export function missingPhotosSince(now = new Date(), monthsBack = 1) {
    return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

/** Dashboard link that opens the capture in its building/month (and unit when known). */
export function missingPhotoLink(row) {
    const params = new URLSearchParams({ building: row.building });
    const month = captureMonth(row.capturedAtDate);
    if (month) params.set('month', month);
    let unit = null;
    try { unit = unitFromLabel(row.building, row.label); } catch { unit = null; }
    if (unit) params.set('unit', unit);
    return `capture-dashboard.html?${params.toString()}`;
}

/** Rows for a "Missing Photos" worksheet. */
export function missingPhotoSheet(rows, now = new Date()) {
    const header = ['Building', 'Meter Label', 'Type', 'Reading', 'Captured At', 'Photo Status', 'Reason', 'Note', 'Capture ID'];
    const body = [];
    for (const group of groupMissingPhotos(rows, now)) {
        for (const { row, photo } of group.entries) {
            body.push([
                group.building, row.label, row.meterType,
                row.isUnreadable ? `NO ACCESS: ${row.unreadableReason || ''}`.trim() : row.readingValue,
                row.capturedAtDate.toISOString(),
                photo.state === 'none' ? 'No photo' : (photo.stale ? 'Pending (overdue)' : 'Pending'),
                photo.reason, photo.note, row.id
            ]);
        }
    }
    return [header, ...body];
}
