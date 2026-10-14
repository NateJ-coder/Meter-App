/**
 * capture-export.mjs
 * Turns the dashboard's loaded captures into the rows of the "Readings"
 * export sheet, laid out in the same order as the building's Utility Dash
 * sheet (ELECTRICITY block, then WATER block) so a column can be checked or
 * pasted top to bottom. Captures that do not match a workbook row are
 * listed at the end under "UNMATCHED CAPTURES" instead of being dropped,
 * and a workbook row that received two different captures is marked so the
 * office picks one instead of the export silently choosing.
 *
 * Pure functions only (no DOM, no Firebase) so scripts/check-capture-export.mjs
 * can exercise them in Node.
 */

const SECTION_ORDER = ['Electricity', 'Water'];

// Building prefixes used on workbook rows, keyed by dashboard building value.
// Readers often type "UNIT 5" or "5"; the workbook row is "PH 05" / "BC 05" etc.
const UNIT_PREFIXES = {
    Azores: ['AZ'], 'Carissa Lane': ['CL'], Genesis: ['GEN'],
    Hazelmere: ['HM', 'HZM'], "L'Montagne": ['LM'], Queensgate: ['QG'],
    'Rivonia Gate': ['RG'], Taragona: ['TG'], 'Villino Glen': ['VG', 'VIL'],
    'Phanda Lodge': ['PH', 'PHA', 'PL'], 'Vista Del Monte': ['VD'], Bonifay: ['BC', 'BON'],
    Akasia: ['AK', 'AKA'], Transvalia: ['TRV']
};

// Free-typed bulk register labels that map onto a bulk row of the sheet.
const BULK_ALIASES = {
    Electricity: ['KWH', 'BULK', 'BULK ELECTRICITY', 'BULK ELECTRICITY READING', 'ELECTRICITY BULK READING', 'MAIN', 'MAIN METER'],
    Water: ['BULK WATER', 'BULK WATER READING', 'WATER BULK', 'MAIN WATER', 'WATER METER']
};

export function normalizeExportMeterType(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'electricity') return 'Electricity';
    if (normalized === 'water') return 'Water';
    return '';
}

function naturalLabelCompare(a, b) {
    const tokenize = (value) => String(value).replace(/\s+/g, '').match(/\d+|\D+/g) || [];
    const left = tokenize(a);
    const right = tokenize(b);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
        const leftPart = left[index] ?? '';
        const rightPart = right[index] ?? '';
        const numeric = /^\d+$/.test(leftPart) && /^\d+$/.test(rightPart);
        const difference = numeric
            ? Number(leftPart) - Number(rightPart)
            : leftPart.localeCompare(rightPart);
        if (difference) return difference;
    }

    return 0;
}

/**
 * Canonical matching key for a meter label: upper-case, single spaces,
 * no "UNIT"/"NO" words, no leading zeros on the unit number, and the
 * building prefix removed. "PH 05", "PHA 5", "UNIT 05", "No 5" and "5" all
 * become "5"; "GEN UNIT 30" becomes "30"; "Com Store 1" stays "COM STORE 1".
 */
export function labelKey(label, building) {
    let key = String(label ?? '').toUpperCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) return '';
    const prefixes = UNIT_PREFIXES[building] ?? [];
    for (const prefix of prefixes) {
        if (key === prefix) return key;
        if (key.startsWith(`${prefix} `)) {
            key = key.slice(prefix.length + 1);
            break;
        }
        const glued = new RegExp(`^${prefix}(?=\\d)`);
        if (glued.test(key)) {
            key = key.replace(glued, '');
            break;
        }
    }
    key = key.replace(/^(UNIT|NO|FLAT|HOUSE)\s*/, '');
    const unit = /^0*(\d+)\s*([A-Z]?)$/.exec(key);
    if (unit) return `${Number(unit[1])}${unit[2]}`;
    return key.replace(/\s+/g, ' ');
}

function readingCellValue(row) {
    if (row.isUnreadable) {
        const reason = String(row.unreadableReason ?? '').trim() || 'Reason not recorded';
        return `NO ACCESS: ${reason}`;
    }

    const value = String(row.readingValue ?? '').trim();
    if (/^\d+(?:\.\d+)?$/.test(value)) {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) return numericValue;
    }
    return value;
}

function captureNote(row) {
    const notes = [];
    if (row.labelConfirmed === false) notes.push('label not on meter list');
    if (row.noPhoto === true || String(row.noPhotoReason ?? '').trim()) {
        const reason = String(row.noPhotoReason ?? '').trim() || 'reason not recorded';
        const note = String(row.noPhotoNote ?? '').trim();
        notes.push(`no photo: ${reason}${note ? ` (${note})` : ''}`);
    } else if (!row.photoUrl && !row.isUnreadable && 'photoUrl' in row) {
        notes.push('photo not received from phone');
    }
    if (row.needsAttention) notes.push('needs office review');
    return notes.join('; ');
}

/**
 * Lay captures out against a building layout:
 *   layout = { electricity: [{label, row}], water: [{label, row}] }
 * Returns { rows: [[label, reading, note]], unmatched: [...], duplicates: [...] }.
 */
export function organizeCaptures(rows, building, layout) {
    const byType = { Electricity: new Map(), Water: new Map() };
    const unmatched = [];
    for (const row of rows) {
        const type = normalizeExportMeterType(row.meterType);
        if (!type) {
            unmatched.push(row);
            continue;
        }
        const key = labelKey(row.label, building);
        const list = byType[type].get(key) ?? [];
        list.push(row);
        byType[type].set(key, list);
    }

    const output = [];
    const duplicates = [];
    const used = new Set();
    for (const type of SECTION_ORDER) {
        const block = type === 'Electricity' ? layout.electricity : layout.water;
        output.push([type.toUpperCase(), '', '']);
        const bulkRows = block.filter((entry) => /^BULK\b/i.test(entry.label));
        for (const entry of block) {
            const key = labelKey(entry.label, building);
            let matches = byType[type].get(key) ?? [];
            // A free-typed bulk register ("KWH", "BULK WATER") lands on the
            // first bulk row of the block when no capture used the row's own name.
            if (matches.length === 0 && bulkRows[0] === entry) {
                for (const alias of BULK_ALIASES[type]) {
                    const aliasMatches = byType[type].get(labelKey(alias, building)) ?? [];
                    if (aliasMatches.length > 0) {
                        matches = aliasMatches;
                        used.add(`${type}|${labelKey(alias, building)}`);
                        break;
                    }
                }
            }
            used.add(`${type}|${key}`);
            if (matches.length === 0) {
                output.push([entry.label, '', '']);
                continue;
            }
            if (matches.length > 1) {
                const distinct = new Set(matches.map((row) => String(row.readingValue ?? '').trim()));
                if (distinct.size > 1) {
                    duplicates.push({ label: entry.label, type, captures: matches });
                    output.push([entry.label, '', `CHECK: ${matches.length} captures - ${matches.map((row) => `${row.label} = ${readingCellValue(row)}`).join(' / ')}`]);
                    continue;
                }
            }
            const match = matches[0];
            const note = [
                match.label.trim().toUpperCase() !== entry.label.trim().toUpperCase() ? `captured as "${match.label.trim()}"` : '',
                captureNote(match)
            ].filter(Boolean).join('; ');
            output.push([entry.label, readingCellValue(match), note]);
        }
    }

    for (const type of SECTION_ORDER) {
        for (const [key, matches] of byType[type]) {
            if (used.has(`${type}|${key}`)) continue;
            unmatched.push(...matches);
        }
    }
    unmatched.sort((a, b) => naturalLabelCompare(a.label, b.label));
    if (unmatched.length > 0) {
        output.push(['UNMATCHED CAPTURES', '', 'not on the Utility Dash sheet - check the label']);
        for (const row of unmatched) {
            output.push([String(row.label ?? '').trim(), readingCellValue(row),
                [normalizeExportMeterType(row.meterType) || `type "${row.meterType}"`, captureNote(row)].filter(Boolean).join('; ')]);
        }
    }
    return { rows: output, unmatched, duplicates };
}

/**
 * Build the export: an organised "Readings" sheet when a layout is known
 * for the building, otherwise the plain per-type lists (sorted by label).
 */
export function prepareCaptureExport(rows, building = '', layout = null) {
    const sortedRows = [...rows].sort((a, b) => naturalLabelCompare(a.label, b.label));
    const readingSheets = [];

    if (layout && Array.isArray(layout.electricity) && Array.isArray(layout.water)) {
        const organized = organizeCaptures(rows, building, layout);
        readingSheets.push({
            name: 'Readings',
            rows: [['Meter Label', 'Reading', 'Note'], ...organized.rows],
            unmatched: organized.unmatched.length,
            duplicates: organized.duplicates.length
        });
        return { sortedRows, readingSheets, organized: true };
    }

    for (const type of SECTION_ORDER) {
        readingSheets.push({
            name: `${type} Readings`,
            rows: sortedRows
                .filter((row) => normalizeExportMeterType(row.meterType) === type)
                .map((row) => [String(row.label ?? '').trim(), readingCellValue(row)])
        });
    }
    const unclassifiedRows = sortedRows
        .filter((row) => !normalizeExportMeterType(row.meterType))
        .map((row) => [String(row.label ?? '').trim(), readingCellValue(row)]);
    if (unclassifiedRows.length > 0) {
        readingSheets.push({ name: 'Unclassified Readings', rows: unclassifiedRows });
    }
    return { sortedRows, readingSheets, organized: false };
}
