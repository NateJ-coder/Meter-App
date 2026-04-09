import { storage } from './storage.js';
import { auth } from './auth.js';

const state = {
    payload: null
};

function getElement(id) {
    return document.getElementById(id);
}

function setStatus(message, tone = 'muted') {
    const container = getElement('utility-dash-sync-status');
    if (!container) {
        return;
    }

    container.className = `info-box ${tone === 'error' ? 'error-card' : tone === 'success' ? 'success-card' : ''}`.trim();
    container.innerHTML = message;
}

function renderSummary(payload) {
    const metadata = payload.metadata || {};
    const container = getElement('utility-dash-sync-summary');
    container.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card"><div class="metric-value">${payload.schemes?.length || 0}</div><div class="metric-label">Schemes</div></div>
            <div class="metric-card"><div class="metric-value">${payload.buildings?.length || 0}</div><div class="metric-label">Buildings</div></div>
            <div class="metric-card"><div class="metric-value">${payload.units?.length || 0}</div><div class="metric-label">Units</div></div>
            <div class="metric-card"><div class="metric-value">${payload.meters?.length || 0}</div><div class="metric-label">Meters</div></div>
            <div class="metric-card"><div class="metric-value">${payload.cycles?.length || 0}</div><div class="metric-label">Cycles</div></div>
            <div class="metric-card"><div class="metric-value">${payload.readings?.length || 0}</div><div class="metric-label">Readings</div></div>
        </div>
        <div class="info-box mt-2">
            <strong>Generated:</strong> ${metadata.generated_at || 'Unknown'}<br>
            <strong>Source:</strong> ${metadata.source_file || 'Unknown'}
        </div>
    `;
}

async function loadPayloadFromFile() {
    const file = getElement('utility-dash-sync-file').files[0];
    if (!file) {
        throw new Error('Choose the generated utility-dash-app-payload.json file first.');
    }

    const text = await file.text();
    return JSON.parse(text);
}

function createImportAuditRecord(payload) {
    const metadata = payload.metadata || {};
    const readings = payload.readings || [];
    const flaggedReadings = readings.filter((reading) => Array.isArray(reading.flags) && reading.flags.length > 0);
    const currentUser = auth.getCurrentUser();

    return storage.create('import_batches', {
        import_type: 'utility_dash_payload',
        source_file: metadata.source_file || 'utility-dash-app-payload.json',
        imported_at: new Date().toISOString(),
        imported_by: currentUser?.id || null,
        imported_by_name: currentUser?.name || 'Open Access Operator',
        rows_processed: readings.length,
        rows_approved: readings.length - flaggedReadings.length,
        rows_flagged: flaggedReadings.length,
        rows_rejected: 0,
        payload_summary: {
            generated_at: metadata.generated_at || null,
            settings: metadata.settings || {},
            schemes: payload.schemes?.length || 0,
            buildings: payload.buildings?.length || 0,
            units: payload.units?.length || 0,
            meters: payload.meters?.length || 0,
            cycles: payload.cycles?.length || 0,
            readings: readings.length,
            flagged_readings: flaggedReadings.length,
            notes: metadata.notes || []
        }
    });
}

function upsertEntityCollection(entity, records) {
    return storage.upsertMany(entity, records);
}

async function importPayload(payload) {
    await upsertEntityCollection('schemes', payload.schemes || []);
    await upsertEntityCollection('buildings', payload.buildings || []);
    await upsertEntityCollection('units', payload.units || []);
    await upsertEntityCollection('meters', payload.meters || []);
    await upsertEntityCollection('cycles', payload.cycles || []);
    await upsertEntityCollection('readings', payload.readings || []);
    await upsertEntityCollection('legacy_meter_map', payload.legacy_meter_map || []);

    const importBatch = createImportAuditRecord(payload);

    auth.recordActivity('utility_dash_payload_imported', {
        batchId: importBatch.id,
        schemes: payload.schemes?.length || 0,
        buildings: payload.buildings?.length || 0,
        units: payload.units?.length || 0,
        meters: payload.meters?.length || 0,
        cycles: payload.cycles?.length || 0,
        readings: payload.readings?.length || 0,
    });

    return importBatch;
}

function setBusyState(isBusy) {
    getElement('utility-dash-sync-preview-button').disabled = isBusy;
    getElement('utility-dash-sync-import-button').disabled = isBusy || !state.payload;
    getElement('utility-dash-sync-file').disabled = isBusy;
}

async function handlePreview() {
    state.payload = await loadPayloadFromFile();
    renderSummary(state.payload);
    getElement('utility-dash-sync-import-button').disabled = false;
    setStatus('Payload loaded. Review the counts, then import into app storage.', 'success');
}

async function handleImport() {
    if (!state.payload) {
        throw new Error('Load a payload before importing.');
    }

    setBusyState(true);
    setStatus('Importing payload into app storage and waiting for cloud sync to finish. This can take a while for the full reading history.', 'muted');

    try {
        const importBatch = await importPayload(state.payload);
        setStatus(`Utility Dash payload imported into app storage and cloud sync completed. Audit batch ${importBatch.id} was recorded for this import. Reload the dashboard or register pages to see the updated inventory.`, 'success');
    } finally {
        setBusyState(false);
    }
}

getElement('utility-dash-sync-preview-button').addEventListener('click', async () => {
    try {
        await handlePreview();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

getElement('utility-dash-sync-import-button').addEventListener('click', async () => {
    try {
        await handleImport();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});
