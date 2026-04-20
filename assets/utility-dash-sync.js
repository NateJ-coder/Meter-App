import { storage } from './storage.js';

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

function renderSummary() {
    const importBatch = storage.getImportBatches()[0] || null;
    const container = getElement('utility-dash-sync-summary');

    if (!importBatch) {
        container.innerHTML = '<p class="text-muted">No backend import batch has been hydrated into this browser yet. Use the developer console to refresh from Firebase if needed.</p>';
        setStatus('No backend import batch found in hydrated app storage yet.', 'error');
        return;
    }

    const payloadSummary = importBatch.payload_summary || {};
    const retainedCounts = payloadSummary.retained_counts || {};
    const originalCounts = payloadSummary.original_counts || {};

    container.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card"><div class="metric-value">${storage.getAll('schemes').length}</div><div class="metric-label">Schemes Hydrated</div></div>
            <div class="metric-card"><div class="metric-value">${storage.getAll('buildings').length}</div><div class="metric-label">Buildings Hydrated</div></div>
            <div class="metric-card"><div class="metric-value">${storage.getAll('units').length}</div><div class="metric-label">Units Hydrated</div></div>
            <div class="metric-card"><div class="metric-value">${storage.getAll('meters').length}</div><div class="metric-label">Meters Hydrated</div></div>
            <div class="metric-card"><div class="metric-value">${storage.getAll('cycles').length}</div><div class="metric-label">Cycles Hydrated</div></div>
            <div class="metric-card"><div class="metric-value">${storage.getAll('readings').length}</div><div class="metric-label">Readings Hydrated</div></div>
        </div>
        <div class="info-box mt-2">
            <strong>Latest Backend Batch:</strong> ${importBatch.id}<br>
            <strong>Imported At:</strong> ${importBatch.imported_at || importBatch.created_at || 'Unknown'}<br>
            <strong>Source:</strong> ${importBatch.source_file || 'Unknown'}<br>
            <strong>Import Strategy:</strong> ${payloadSummary.import_strategy || 'Unknown'}<br>
            <strong>History Window:</strong> ${payloadSummary.history_window_per_meter || 'Unknown'}
        </div>
        <div class="info-box mt-2">
            <strong>Original Readings Considered:</strong> ${originalCounts.readings || 0}<br>
            <strong>Retained Readings in Runtime Baseline:</strong> ${retainedCounts.readings || payloadSummary.readings || 0}<br>
            <strong>Retained Cycles in Runtime Baseline:</strong> ${retainedCounts.cycles || payloadSummary.cycles || 0}
        </div>
    `;

    setStatus('Backend baseline import is active. Browser-side import controls were removed; this page now reflects hydrated app storage only.', 'success');
}

renderSummary();