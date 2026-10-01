const editableFields = ['label', 'meterType', 'readingValue'];

export function createCorrectionPatch(current, changes, { actor, reason, at }) {
    if (!actor?.trim() || !reason?.trim() || !at || !Number.isFinite(Date.parse(at))) {
        throw new Error('A correction requires an author, reason and valid timestamp.');
    }
    if (Object.keys(changes).some((field) => !editableFields.includes(field))) {
        throw new Error('A correction cannot replace raw evidence or capture metadata.');
    }
    if (current.officeCorrections != null && !Array.isArray(current.officeCorrections)) {
        throw new Error('Existing correction history is invalid; review it before editing.');
    }
    const before = Object.fromEntries(editableFields.map((field) => [field, current[field] ?? '']));
    const after = { ...before, ...changes };
    if (typeof after.label !== 'string' || !after.label.trim() ||
        !['Electricity', 'Water'].includes(after.meterType) ||
        typeof after.readingValue !== 'string' ||
        (!current.isUnreadable && !/^\d+(\.\d+)?$/.test(after.readingValue))) {
        throw new Error('Provide a meter label, supported type and non-negative numeric reading.');
    }
    if (editableFields.every((field) => before[field] === after[field])) return null;
    return {
        ...after,
        originalLabel: current.originalLabel ?? before.label,
        originalMeterType: current.originalMeterType ?? before.meterType,
        originalReadingValue: current.originalReadingValue ?? before.readingValue,
        rawReadingValue: current.rawReadingValue ?? before.readingValue,
        flagAcknowledged: false,
        officeCorrections: [...(current.officeCorrections ?? []), {
            actor: actor.trim(), reason: reason.trim(), at, before, after
        }]
    };
}

export function assertCaptureUnchanged(current, expected) {
    if (editableFields.some((field) => (current[field] ?? '') !== (expected[field] ?? ''))) {
        throw new Error('This capture changed since it was loaded. Reload before correcting it.');
    }
}

export function getCaptureHistoryWarnings(rows) {
    const warnings = new Map(rows.map((row) => [row.id, []]));
    const groups = new Map();
    for (const row of rows) {
        if (row.isUnreadable || !/^\d+(\.\d+)?$/.test(String(row.readingValue ?? ''))) continue;
        const timestamp = row.capturedAtDate?.getTime();
        if (!Number.isFinite(timestamp)) continue;
        const building = row.building.trim().toUpperCase();
        const unit = building === 'GENESIS' && /^GEN\s*(?:UNIT\s*)?0*(\d+)$/i.exec(row.label.trim());
        const label = unit ? `GEN ${Number(unit[1])}` : row.label.trim().toUpperCase().replace(/\s+/g, ' ');
        const value = unit && row.meterType === 'Electricity'
            ? Math.trunc(Number(row.readingValue)) : Number(row.readingValue);
        if (!Number.isFinite(value)) continue;
        const key = JSON.stringify([building, row.meterType, label]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ id: row.id, timestamp, value });
    }
    for (const entries of groups.values()) {
        entries.sort((first, second) => first.timestamp - second.timestamp);
        let previous = null;
        for (let index = 0; index < entries.length;) {
            let end = index + 1;
            while (end < entries.length && entries[end].timestamp === entries[index].timestamp) end++;
            if (end - index > 1) {
                for (const entry of entries.slice(index, end)) {
                    warnings.get(entry.id).push('Multiple captures for this meter at the same time; verify the baseline.');
                }
                previous = null;
            } else {
                const entry = entries[index];
                if (previous) {
                    const suffix = ` (${previous.value}; capture ${previous.id}).`;
                    if (entry.value < previous.value) {
                        warnings.get(entry.id).push(`Below the previous captured reading${suffix}`);
                    } else if (entry.value === previous.value) {
                        warnings.get(entry.id).push(`Unchanged from the previous captured reading${suffix}`);
                    } else if (previous.value > 0 && entry.value >= previous.value * 10) {
                        warnings.get(entry.id).push(`At least ten times the previous captured reading${suffix}`);
                    }
                }
                previous = entry;
            }
            index = end;
        }
    }
    return warnings;
}