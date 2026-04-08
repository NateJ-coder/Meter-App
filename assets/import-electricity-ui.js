import { storage } from './storage.js';
import { auth } from './auth.js';
import { processElectricityReadingImport } from './electricity-import-pipeline.js';
import { renderImportReviewTable } from './import-review-table.js';

const state = {
    previewRows: []
};

const HEADER_ALIASES = {
    unitnumber: 'unitNumber',
    unit: 'unitNumber',
    unit_number: 'unitNumber',
    meternumber: 'meterNumber',
    meter: 'meterNumber',
    meter_number: 'meterNumber',
    readingvalue: 'readingValue',
    reading: 'readingValue',
    reading_value: 'readingValue',
    readingdate: 'readingDate',
    date: 'readingDate',
    reading_date: 'readingDate',
    rowtype: 'rowType',
    row_type: 'rowType',
    maxregistervalue: 'maxRegisterValue',
    max_register_value: 'maxRegisterValue',
    notes: 'notes'
};

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeHeader(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const nextCharacter = line[index + 1];

        if (character === '"') {
            if (inQuotes && nextCharacter === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (character === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += character;
    }

    values.push(current.trim());
    return values;
}

function parseCsvText(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        throw new Error('Provide CSV data with a header row and at least one reading row.');
    }

    const rawHeaders = parseCsvLine(lines[0]);
    const headers = rawHeaders.map((header) => HEADER_ALIASES[normalizeHeader(header)] || null);

    if (!headers.includes('readingValue')) {
        throw new Error('CSV must include a readingValue column.');
    }

    return lines.slice(1).map((line, rowIndex) => {
        const values = parseCsvLine(line);
        const row = {};

        headers.forEach((key, headerIndex) => {
            if (!key) {
                return;
            }

            row[key] = values[headerIndex] ?? '';
        });

        row.sourceRowReference = rowIndex + 2;
        return row;
    });
}

function getSelectedContext() {
    const schemeId = getElement('import-scheme').value;
    const buildingId = getElement('import-building').value;
    const cycleId = getElement('import-cycle').value;

    const scheme = schemeId ? storage.get('schemes', schemeId) : null;
    const building = buildingId ? storage.get('buildings', buildingId) : null;
    const cycle = cycleId ? storage.get('cycles', cycleId) : null;

    return { scheme, building, cycle };
}

function setStatus(message, tone = 'muted') {
    const container = getElement('import-status');
    if (!container) {
        return;
    }

    container.className = `info-box ${tone === 'error' ? 'error-card' : tone === 'success' ? 'success-card' : ''}`.trim();
    container.innerHTML = message;
}

function setSummary(rows) {
    const container = getElement('import-preview-summary');
    if (!container) {
        return;
    }

    const ready = rows.filter((row) => !row.blockingIssues.length && row.flags.length === 0).length;
    const needsReview = rows.filter((row) => !row.blockingIssues.length && row.flags.length > 0).length;
    const unmatched = rows.filter((row) => row.blockingIssues.length > 0).length;

    container.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${rows.length}</div>
                <div class="metric-label">Rows Parsed</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${ready}</div>
                <div class="metric-label">Ready</div>
            </div>
            <div class="metric-card warning">
                <div class="metric-value">${needsReview}</div>
                <div class="metric-label">Needs Review</div>
            </div>
            <div class="metric-card danger">
                <div class="metric-value">${unmatched}</div>
                <div class="metric-label">Unmatched</div>
            </div>
        </div>
    `;
}

function populateSchemeOptions() {
    const schemes = storage.getSchemes()
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name));

    const select = getElement('import-scheme');
    select.innerHTML = '<option value="">-- Select Scheme --</option>' + schemes.map((scheme) => (
        `<option value="${scheme.id}">${escapeHtml(scheme.name)}</option>`
    )).join('');
}

function populateBuildingOptions() {
    const schemeId = getElement('import-scheme').value;
    const buildings = storage.getBuildings(schemeId)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name));

    const select = getElement('import-building');
    select.innerHTML = '<option value="">-- Select Building --</option>' + buildings.map((building) => (
        `<option value="${building.id}">${escapeHtml(building.name)}</option>`
    )).join('');

    if (buildings.length === 1) {
        select.value = buildings[0].id;
    }
}

function populateCycleOptions() {
    const schemeId = getElement('import-scheme').value;
    const cycles = storage.getCycles(schemeId)
        .slice()
        .sort((left, right) => new Date(right.start_date || 0) - new Date(left.start_date || 0));

    const select = getElement('import-cycle');
    select.innerHTML = '<option value="">-- Select Cycle --</option>' + cycles.map((cycle) => (
        `<option value="${cycle.id}">${escapeHtml(cycle.start_date || 'Unknown')} (${escapeHtml(cycle.status || 'UNKNOWN')})</option>`
    )).join('');

    const openCycle = cycles.find((cycle) => cycle.status === 'OPEN');
    if (openCycle) {
        select.value = openCycle.id;
    }
}

function updatePreviewTable() {
    renderImportReviewTable(state.previewRows, getElement('import-preview-table'), {
        onToggleApprove(rowIndex, approved) {
            state.previewRows[rowIndex].approved = approved;
        }
    });

    setSummary(state.previewRows);
}

async function readImportSourceText() {
    const file = getElement('import-file').files[0];
    if (file) {
        return {
            sourceText: await file.text(),
            sourceFileName: file.name
        };
    }

    const sourceText = getElement('import-text').value;
    return {
        sourceText,
        sourceFileName: 'pasted-electricity-readings.csv'
    };
}

function buildPreviewRows(parsedRows, context, sourceFileName) {
    return parsedRows.map((parsedRow, index) => {
        const pipelineResult = processElectricityReadingImport({
            ...parsedRow,
            schemeId: context.scheme?.id || null,
            schemeName: context.scheme?.name || null,
            buildingId: context.building?.id || null,
            buildingName: context.building?.name || null,
            cycleId: context.cycle?.id || null,
            sourceFile: sourceFileName,
            sourceRowReference: parsedRow.sourceRowReference || index + 2
        });

        return {
            id: `preview-${index}`,
            approved: pipelineResult.readyForCreate && pipelineResult.flags.length === 0,
            currentReading: pipelineResult.stagedReading.currentReading,
            previousReading: pipelineResult.previousReading?.readingValue ?? null,
            consumption: pipelineResult.consumption.consumption,
            displayUnit: pipelineResult.resolution.unit?.unit_number || pipelineResult.stagedReading.unitNumber || '',
            displayMeter: pipelineResult.resolution.meter?.meter_number || pipelineResult.stagedReading.meterNumber || '',
            flags: pipelineResult.flags,
            issues: pipelineResult.issues,
            blockingIssues: pipelineResult.blockingIssues,
            validationStatus: pipelineResult.validationStatus,
            result: pipelineResult
        };
    });
}

function createBatchRecord(context, sourceFileName, rows, savedRows) {
    const currentUser = auth.getCurrentUser();
    const approvedRows = rows.filter((row) => row.approved && row.result.readyForCreate).length;
    const flaggedRows = rows.filter((row) => row.flags.length > 0).length;
    const rejectedRows = rows.filter((row) => row.blockingIssues.length > 0).length;

    return storage.create('import_batches', {
        import_type: 'electricity_readings',
        source_file: sourceFileName,
        scheme_id: context.scheme?.id || null,
        scheme_name: context.scheme?.name || null,
        building_id: context.building?.id || null,
        building_name: context.building?.name || null,
        cycle_id: context.cycle?.id || null,
        cycle_label: context.cycle ? `${context.cycle.start_date || 'Unknown'} (${context.cycle.status || 'UNKNOWN'})` : null,
        imported_at: new Date().toISOString(),
        imported_by: currentUser?.id || null,
        imported_by_name: currentUser?.name || '',
        rows_processed: rows.length,
        rows_approved: approvedRows,
        rows_flagged: flaggedRows,
        rows_rejected: rejectedRows,
        saved_reading_ids: savedRows.map((row) => row.id),
        preview_rows: rows.map((row) => ({
            approved: row.approved,
            validation_status: row.validationStatus,
            unit: row.displayUnit,
            meter: row.displayMeter,
            current_reading: row.currentReading,
            previous_reading: row.previousReading,
            consumption: row.consumption,
            flags: row.flags,
            issues: row.issues
        }))
    });
}

function saveApprovedRows(context, sourceFileName) {
    const approvedPreviewRows = state.previewRows.filter((row) => row.approved && row.result.readyForCreate);
    if (approvedPreviewRows.length === 0) {
        throw new Error('No approved rows are ready to save.');
    }

    const savedRows = approvedPreviewRows.map((previewRow) => {
        const payload = {
            ...previewRow.result.readingPayload,
            cycle_id: context.cycle?.id || null,
            import_batch_source_file: sourceFileName
        };

        const existingReading = storage.getReadings(context.cycle?.id || null)
            .find((reading) => reading.meter_id === payload.meter_id);

        let savedReading = null;
        if (existingReading) {
            savedReading = storage.update('readings', existingReading.id, payload);
        } else {
            savedReading = storage.create('readings', payload);
        }

        storage.update('meters', payload.meter_id, {
            last_reading: payload.reading_value,
            last_reading_date: payload.reading_date
        });

        previewRow.savedReadingId = savedReading.id;
        return savedReading;
    });

    const batchRecord = createBatchRecord(context, sourceFileName, state.previewRows, savedRows);

    approvedPreviewRows.forEach((previewRow) => {
        if (previewRow.savedReadingId) {
            storage.update('readings', previewRow.savedReadingId, { import_batch_id: batchRecord.id });
        }
    });

    auth.recordActivity('electricity_import_batch_saved', {
        batchId: batchRecord.id,
        rowsProcessed: batchRecord.rows_processed,
        rowsApproved: batchRecord.rows_approved,
        rowsFlagged: batchRecord.rows_flagged,
        rowsRejected: batchRecord.rows_rejected,
        buildingName: batchRecord.building_name,
        sourceFile: batchRecord.source_file
    });

    return batchRecord;
}

async function handlePreviewImport() {
    const context = getSelectedContext();
    if (!context.scheme || !context.building || !context.cycle) {
        throw new Error('Select scheme, building, and cycle before previewing an import.');
    }

    const { sourceText, sourceFileName } = await readImportSourceText();
    if (!String(sourceText || '').trim()) {
        throw new Error('Paste CSV data or choose a CSV file first.');
    }

    const parsedRows = parseCsvText(sourceText);
    state.previewRows = buildPreviewRows(parsedRows, context, sourceFileName);
    updatePreviewTable();
    getElement('save-approved-button').disabled = false;
    getElement('save-approved-button').dataset.sourceFileName = sourceFileName;
    setStatus(`Preview ready for ${state.previewRows.length} row(s). Review flags before saving.`, 'success');
}

function renderRecentBatches() {
    const batches = storage.getImportBatches().slice(0, 5);
    const container = getElement('recent-import-batches');
    if (!container) {
        return;
    }

    if (batches.length === 0) {
        container.innerHTML = '<p class="text-muted">No electricity import batches saved yet.</p>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Imported At</th>
                    <th>Building</th>
                    <th>Source</th>
                    <th>Processed</th>
                    <th>Approved</th>
                    <th>Flagged</th>
                    <th>Rejected</th>
                </tr>
            </thead>
            <tbody>
                ${batches.map((batch) => `
                    <tr>
                        <td>${escapeHtml(batch.imported_at || batch.created_at || '')}</td>
                        <td>${escapeHtml(batch.building_name || 'N/A')}</td>
                        <td>${escapeHtml(batch.source_file || 'N/A')}</td>
                        <td>${batch.rows_processed || 0}</td>
                        <td>${batch.rows_approved || 0}</td>
                        <td>${batch.rows_flagged || 0}</td>
                        <td>${batch.rows_rejected || 0}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function attachHandlers() {
    getElement('import-scheme').addEventListener('change', () => {
        populateBuildingOptions();
        populateCycleOptions();
    });

    getElement('preview-import-button').addEventListener('click', async () => {
        try {
            await handlePreviewImport();
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    getElement('save-approved-button').addEventListener('click', () => {
        try {
            const context = getSelectedContext();
            const sourceFileName = getElement('save-approved-button').dataset.sourceFileName || 'pasted-electricity-readings.csv';
            const batch = saveApprovedRows(context, sourceFileName);
            renderRecentBatches();
            setStatus(`Saved approved rows. Batch ${batch.id} recorded with ${batch.rows_approved} approved row(s).`, 'success');
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });
}

function initializeImportScreen() {
    populateSchemeOptions();
    populateBuildingOptions();
    populateCycleOptions();
    attachHandlers();
    renderRecentBatches();
    updatePreviewTable();
}

initializeImportScreen();
