import {
    collection,
    doc,
    setDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { firebaseCollections, firebaseDb, isFirebaseConfigured } from './firebase.js';
import { storage } from './storage.js';

const LATEST_READINGS_URL = '../source-documents/03-extracted-outputs/utility-dash/utility-dash-latest-electricity-readings.csv';
const HISTORY_URL = '../source-documents/03-extracted-outputs/utility-dash/utility-dash-electricity-history.ndjson';
const SUMMARY_URL = '../source-documents/03-extracted-outputs/utility-dash/utility-dash-summary.csv';

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function parseCsv(text) {
    const rows = [];
    let currentRow = [];
    let currentValue = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentValue += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            currentRow.push(currentValue);
            currentValue = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                index += 1;
            }

            if (currentValue.length > 0 || currentRow.length > 0) {
                currentRow.push(currentValue);
                rows.push(currentRow);
                currentRow = [];
                currentValue = '';
            }
            continue;
        }

        currentValue += char;
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
        currentRow.push(currentValue);
        rows.push(currentRow);
    }

    const [headerRow, ...bodyRows] = rows;
    if (!headerRow) {
        return [];
    }

    return bodyRows.map((row) => {
        const entry = {};
        headerRow.forEach((header, columnIndex) => {
            entry[header] = row[columnIndex] ?? '';
        });
        return entry;
    });
}

function parseFlexibleNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    const rawValue = String(value || '').trim();
    if (!rawValue || rawValue === '#########') {
        return null;
    }

    const normalized = rawValue.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue || rawValue === '#########') {
        return null;
    }

    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(rawValue)) {
        return rawValue.replace(/\//g, '-');
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawValue)) {
        const [day, month, year] = rawValue.split('/');
        return `${year}-${month}-${day}`;
    }

    if (/^\d{4}-\d{2}$/.test(rawValue)) {
        return `${rawValue}-01`;
    }

    return null;
}

function buildDataset(latestRows, historyRows, summaryRows) {
    const summaryByScheme = new Map(
        summaryRows.map((row) => [row.scheme_name, row])
    );

    const schemes = [];
    const buildings = [];
    const units = [];
    const meters = [];
    const meterHistoryDocs = [];
    const seenSchemes = new Set();

    historyRows.forEach((historyRow) => {
        const schemeName = historyRow.scheme_name;
        const schemeSlug = slugify(schemeName);
        const schemeId = `scheme:${schemeSlug}`;
        const buildingId = `building:${schemeSlug}:primary`;
        const unitKey = historyRow.provisional_meter_key || historyRow.unit_label;
        const unitId = `unit:${schemeSlug}:${slugify(unitKey)}`;
        const meterId = `meter:${schemeSlug}:${slugify(unitKey)}`;
        const summary = summaryByScheme.get(schemeName);
        const latestRow = latestRows.find((row) => row.provisional_meter_key === historyRow.provisional_meter_key && row.scheme_name === schemeName);
        const historyEntries = Array.isArray(historyRow.reading_history)
            ? historyRow.reading_history.map((entry) => ({
                reading_date: normalizeDate(entry.reading_date),
                source_reading_date: String(entry.reading_date || ''),
                reading_label: entry.reading_label || '',
                tariff_table: entry.tariff_table || '',
                reading_value: parseFlexibleNumber(entry.reading_value)
            })).filter((entry) => entry.reading_value != null)
            : [];

        if (!seenSchemes.has(schemeId)) {
            seenSchemes.add(schemeId);
            schemes.push({
                id: schemeId,
                name: schemeName,
                address: '',
                source_sheet: historyRow.source_sheet || schemeName,
                imported_from: 'utility_dash',
                latest_period: normalizeDate(summary?.latest_period) || normalizeDate(historyRow.latest_reading_date),
                latest_period_source: summary?.latest_period || historyRow.latest_reading_date || '',
                months_available: Number(summary?.months_available || historyEntries.length || 0),
                electricity_meter_rows: Number(summary?.electricity_meter_rows || 0),
                charge_components: Number(summary?.charge_components || 0)
            });

            buildings.push({
                id: buildingId,
                scheme_id: schemeId,
                name: schemeName,
                source_sheet: historyRow.source_sheet || schemeName,
                imported_from: 'utility_dash'
            });
        }

        units.push({
            id: unitId,
            building_id: buildingId,
            unit_number: historyRow.unit_label,
            owner_name: '',
            imported_from: 'utility_dash'
        });

        meters.push({
            id: meterId,
            scheme_id: schemeId,
            unit_id: unitId,
            meter_type: 'UNIT',
            meter_number: historyRow.provisional_meter_key,
            last_reading: parseFlexibleNumber(latestRow?.latest_reading ?? historyRow.latest_reading) ?? 0,
            last_reading_date: normalizeDate(latestRow?.latest_reading_date ?? historyRow.latest_reading_date),
            last_reading_date_source: latestRow?.latest_reading_date || historyRow.latest_reading_date || '',
            status: 'active',
            imported_from: 'utility_dash',
            source_sheet: historyRow.source_sheet || schemeName,
            source_unit_label: historyRow.unit_label,
            source_provisional_meter_key: historyRow.provisional_meter_key,
            pq_factor: parseFlexibleNumber(latestRow?.pq_factor ?? historyRow.pq_factor),
            prepaid: Boolean(historyRow.prepaid),
            history_entry_count: historyEntries.length,
            history_start_date: historyEntries[0]?.reading_date || null,
            history_end_date: historyEntries[historyEntries.length - 1]?.reading_date || null
        });

        meterHistoryDocs.push({
            id: meterId,
            meter_id: meterId,
            scheme_id: schemeId,
            unit_id: unitId,
            unit_label: historyRow.unit_label,
            source_sheet: historyRow.source_sheet || schemeName,
            source_provisional_meter_key: historyRow.provisional_meter_key,
            latest_reading: parseFlexibleNumber(latestRow?.latest_reading ?? historyRow.latest_reading),
            latest_reading_date: normalizeDate(latestRow?.latest_reading_date ?? historyRow.latest_reading_date),
            latest_reading_date_source: latestRow?.latest_reading_date || historyRow.latest_reading_date || '',
            history_entry_count: historyEntries.length,
            readings: historyEntries,
            imported_from: 'utility_dash'
        });
    });

    return {
        schemes,
        buildings,
        units,
        meters,
        meterHistoryDocs
    };
}

async function loadDatasetFiles() {
    const [latestResponse, historyResponse, summaryResponse] = await Promise.all([
        fetch(new URL(LATEST_READINGS_URL, import.meta.url)),
        fetch(new URL(HISTORY_URL, import.meta.url)),
        fetch(new URL(SUMMARY_URL, import.meta.url))
    ]);

    if (!latestResponse.ok || !historyResponse.ok || !summaryResponse.ok) {
        throw new Error('Unable to load Utility Dash export files. Serve the app from the project root so source-documents files are reachable.');
    }

    const [latestCsv, historyText, summaryCsv] = await Promise.all([
        latestResponse.text(),
        historyResponse.text(),
        summaryResponse.text()
    ]);

    return {
        latestRows: parseCsv(latestCsv),
        summaryRows: parseCsv(summaryCsv),
        historyRows: historyText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line))
    };
}

async function writeMeterHistoryDocs(historyDocs) {
    if (!isFirebaseConfigured()) {
        return;
    }

    const chunkSize = 350;

    for (let index = 0; index < historyDocs.length; index += chunkSize) {
        const chunk = historyDocs.slice(index, index + chunkSize);
        const batch = writeBatch(firebaseDb);

        chunk.forEach((entry) => {
            batch.set(doc(firebaseDb, firebaseCollections.meterHistory, entry.id), entry);
        });

        await batch.commit();
    }
}

async function recordImport(importSummary) {
    if (!isFirebaseConfigured()) {
        return;
    }

    const importId = `utility-dash-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await setDoc(doc(firebaseDb, firebaseCollections.imports, importId), {
        id: importId,
        source: 'utility_dash',
        imported_at: new Date().toISOString(),
        ...importSummary
    });
}

export async function syncUtilityDashDataset() {
    const { latestRows, historyRows, summaryRows } = await loadDatasetFiles();
    const dataset = buildDataset(latestRows, historyRows, summaryRows);

    await storage.replaceOperationalData({
        schemes: dataset.schemes,
        buildings: dataset.buildings,
        units: dataset.units,
        meters: dataset.meters,
        cycles: storage.getAll('cycles'),
        readings: storage.getAll('readings'),
        cycle_schedules: storage.getAll('cycle_schedules')
    }, { pushToCloud: true });

    await writeMeterHistoryDocs(dataset.meterHistoryDocs);
    await recordImport({
        scheme_count: dataset.schemes.length,
        unit_count: dataset.units.length,
        meter_count: dataset.meters.length,
        history_doc_count: dataset.meterHistoryDocs.length
    });

    return {
        schemes: dataset.schemes.length,
        units: dataset.units.length,
        meters: dataset.meters.length,
        histories: dataset.meterHistoryDocs.length
    };
}

export async function getMeterHistoryForMeter(meterId) {
    return storage.getMeterHistory(meterId);
}