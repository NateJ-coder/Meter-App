/**
 * review.js - Review Page Logic
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { showNotification, formatDateTime, parseDecimalInput, getEffectiveReviewStatus, getPreviousReadingDisplayValue } from './app.js';

const REVIEW_FOCUS = {
    ALL: 'all',
    MISSING: 'missing',
    FLAGGED: 'flagged',
    APPROVED: 'approved'
};

let activeFocus = REVIEW_FOCUS.ALL;
let shouldAutoFocus = false;

/**
 * Return the corrected consumption for a reading, detecting bad rollover values.
 * The historical import applied 1,000,000-rollover on any backward reading. Any
 * stored consumption > 100,000 where actual diff is negative is a false rollover.
 */
function getDisplayConsumption(reading) {
    const stored = reading?.consumption ?? null;
    if (stored == null) return null;
    const cur = reading.reading_value ?? null;
    const prev = reading.previous_reading ?? null;
    if (cur != null && prev != null) {
        const actual = cur - prev;
        if (actual < 0 && stored > 100000) return actual; // corrected
    }
    return stored;
}

function formatConsumption(reading) {
    const c = getDisplayConsumption(reading);
    if (c == null) return 'N/A';
    if (c < 0) return `<span style="color:#e53935;font-weight:600;">${c.toFixed(2)} kWh ⚠ backward</span>`;
    return `${c.toFixed(2)} kWh`;
}

// Load page
populateCycleSelect();
applyRouteQueryState();
loadReviewData();

function applyRouteQueryState() {
    const params = new URLSearchParams(window.location.search);
    const cycleId = params.get('cycle');
    const focus = String(params.get('focus') || REVIEW_FOCUS.ALL).toLowerCase();
    const status = String(params.get('status') || '').toLowerCase();
    const flagType = String(params.get('flagType') || '').toLowerCase();

    if (cycleId) {
        const cycleSelect = document.getElementById('review-cycle');
        if (cycleSelect?.querySelector(`option[value="${cycleId}"]`)) {
            cycleSelect.value = cycleId;
        }
    }

    if (flagType) {
        const flagTypeSelect = document.getElementById('filter-flag-type');
        if (flagTypeSelect?.querySelector(`option[value="${flagType}"]`)) {
            flagTypeSelect.value = flagType;
        }
    }

    if (status) {
        const statusSelect = document.getElementById('filter-review-status');
        if (statusSelect?.querySelector(`option[value="${status}"]`)) {
            statusSelect.value = status;
        }
    }

    if (Object.values(REVIEW_FOCUS).includes(focus)) {
        activeFocus = focus;
    }

    shouldAutoFocus = Boolean(params.get('focus') || params.get('status') || params.get('flagType'));
}

function updateReviewQueryFromState() {
    const cycleId = document.getElementById('review-cycle').value;
    const status = document.getElementById('filter-review-status').value;
    const flagType = document.getElementById('filter-flag-type').value;
    const params = new URLSearchParams(window.location.search);

    if (cycleId && cycleId !== 'all') params.set('cycle', cycleId);
    else params.delete('cycle');

    if (activeFocus && activeFocus !== REVIEW_FOCUS.ALL) params.set('focus', activeFocus);
    else params.delete('focus');

    if (status) params.set('status', status);
    else params.delete('status');

    if (flagType) params.set('flagType', flagType);
    else params.delete('flagType');

    const query = params.toString();
    history.replaceState(null, '', `review.html${query ? `?${query}` : ''}`);
}

function focusReviewSection() {
    const flaggedSection = document.getElementById('flagged-readings-list');
    const missingSection = document.getElementById('missing-readings-list');

    if (activeFocus === REVIEW_FOCUS.MISSING) {
        missingSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        flaggedSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function applyFocusPreset() {
    const statusSelect = document.getElementById('filter-review-status');

    if (activeFocus === REVIEW_FOCUS.APPROVED) {
        statusSelect.value = 'approved';
    }

    if (activeFocus !== REVIEW_FOCUS.MISSING) {
        window.filterReview();
    }

    if (shouldAutoFocus) {
        focusReviewSection();
    }
}

window.focusReviewMetric = function(focus) {
    activeFocus = Object.values(REVIEW_FOCUS).includes(focus) ? focus : REVIEW_FOCUS.ALL;
    shouldAutoFocus = true;

    const statusSelect = document.getElementById('filter-review-status');
    const flagTypeSelect = document.getElementById('filter-flag-type');
    if (activeFocus === REVIEW_FOCUS.APPROVED) {
        statusSelect.value = 'approved';
    } else {
        statusSelect.value = '';
        flagTypeSelect.value = '';
    }

    applyFocusPreset();
    updateReviewQueryFromState();
};

function populateCycleSelect() {
    const cycles = storage.getVisibleCycles().sort((a, b) => 
        new Date(b.start_date) - new Date(a.start_date)
    );
    
    const select = document.getElementById('review-cycle');
    const previousValue = select.value;
    select.innerHTML = '<option value="all">All Schemes / All Cycles</option>' +
        cycles.map(cycle => {
            const scheme = storage.get('schemes', cycle.scheme_id);
            return `<option value="${cycle.id}">${scheme ? scheme.name : 'Unknown'} - ${cycle.start_date} (${cycle.status})</option>`;
        }).join('');

    if (previousValue && select.querySelector(`option[value="${previousValue}"]`)) {
        select.value = previousValue;
    } else {
        select.value = 'all';
    }
}

function getReviewScope(cycleId) {
    const visibleCycles = storage.getVisibleCycles();
    const scopedCycles = cycleId && cycleId !== 'all'
        ? visibleCycles.filter(cycle => cycle.id === cycleId)
        : visibleCycles;

    const cycleMap = new Map(scopedCycles.map(cycle => [cycle.id, cycle]));
    const readings = scopedCycles.flatMap(cycle => storage.getReadings(cycle.id));

    return { scopedCycles, cycleMap, readings };
}

function loadReviewData() {
    const cycleId = document.getElementById('review-cycle').value;
    const { scopedCycles } = getReviewScope(cycleId);

    if (scopedCycles.length === 0) {
        document.getElementById('flagged-readings-list').innerHTML = '<p class="text-muted">No cycles available yet.</p>';
        document.getElementById('missing-readings-list').innerHTML = '';
        return;
    }
    
    loadMetrics(cycleId);
    loadFlaggedReadings(cycleId);
    loadMissingReadings(cycleId);

    if (document.getElementById('filter-review-status').value || document.getElementById('filter-flag-type').value) {
        window.filterReview();
    }

    applyFocusPreset();
    updateReviewQueryFromState();
}

window.loadReviewData = loadReviewData;

function loadMetrics(cycleId) {
    const { scopedCycles, readings, cycleMap } = getReviewScope(cycleId);

    if (scopedCycles.length === 0) {
        document.getElementById('review-total-readings').textContent = '0';
        document.getElementById('review-not-read').textContent = '0';
        document.getElementById('review-flagged').textContent = '0';
        document.getElementById('review-approved').textContent = '0';
        return;
    }
    
    const flaggedCount = readings.filter(r => (r.flags && r.flags.length > 0) || (r.manual_flags && r.manual_flags.length > 0)).length;
    const approvedCount = readings.filter(r => getEffectiveReviewStatus(r, cycleMap.get(r.cycle_id)) === 'approved').length;
    const notReadCount = scopedCycles.reduce((total, cycle) => total + validation.getMissingReadings(cycle.id).length, 0);
    
    document.getElementById('review-total-readings').textContent = readings.length;
    document.getElementById('review-not-read').textContent = notReadCount;
    document.getElementById('review-flagged').textContent = flaggedCount;
    document.getElementById('review-approved').textContent = approvedCount;
}

function loadFlaggedReadings(cycleId) {
    const { readings } = getReviewScope(cycleId);
    const flaggedReadings = readings.filter(r =>
        (r.flags && r.flags.length > 0) || (r.manual_flags && r.manual_flags.length > 0)
    );
    renderFlaggedReadings(flaggedReadings, cycleId);
}

function renderFlaggedReadings(flaggedReadings, cycleId) {
    const container = document.getElementById('flagged-readings-list');

    if (flaggedReadings.length === 0) {
        container.innerHTML = '<p class="text-muted">No flagged readings match the current filter.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme</th>
                    <th>Cycle</th>
                    <th>Building</th>
                    <th>Unit</th>
                    <th>Meter</th>
                    <th>Reading</th>
                    <th>Consumption</th>
                    <th>Flags</th>
                    <th>Review Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${flaggedReadings.map(reading => {
                    const meter = storage.getMeterWithDetails(reading.meter_id);
                    const cycle = storage.get('cycles', reading.cycle_id);
                    const scheme = cycle ? storage.get('schemes', cycle.scheme_id) : null;
                    const effectiveStatus = getEffectiveReviewStatus(reading, cycle);
                    
                    // PHASE 3: Show both auto and manual flags
                    const allFlags = validation.getAllFlags(reading);
                    const autoFlags = allFlags.filter(f => f.source === 'auto');
                    const manualFlags = allFlags.filter(f => f.source === 'manual');
                    
                    const flagsHtml = [
                        ...autoFlags.map(f => `<span class="badge badge-danger" title="${f.description}">🤖 ${f.type}</span>`),
                        ...manualFlags.map(f => `<span class="badge badge-warning" title="${f.description}">👤 ${f.type}</span>`)
                    ].join(' ');
                    
                    let statusBadge = 'badge-warning';
                    let statusText = effectiveStatus;
                    if (statusText === 'approved') statusBadge = 'badge-success';
                    if (statusText === 'site-visit') statusBadge = 'badge-danger';
                    
                    return `
                        <tr>
                            <td>${scheme?.name || 'Unknown Scheme'}</td>
                            <td>${cycle ? `${cycle.start_date} to ${cycle.end_date}` : 'N/A'}</td>
                            <td>${meter.building_name || 'N/A'}</td>
                            <td>${meter.unit_name || 'N/A'}</td>
                            <td>${meter.meter_number}</td>
                            <td>${reading.reading_value} kWh</td>
                            <td>${formatConsumption(reading)}</td>
                            <td>${flagsHtml}</td>
                            <td><span class="badge ${statusBadge}">${statusText}</span></td>
                            <td>
                                <button class="btn btn-primary" onclick="openReviewModal('${reading.id}')">Review</button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function loadMissingReadings(cycleId) {
    const { scopedCycles } = getReviewScope(cycleId);
    const missingRows = scopedCycles.flatMap(cycle =>
        validation.getMissingReadings(cycle.id).map(meter => ({ meter, cycle }))
    );
    const container = document.getElementById('missing-readings-list');
    
    if (missingRows.length === 0) {
        container.innerHTML = '<p class="text-muted">All meters have been read.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme</th>
                    <th>Cycle</th>
                    <th>Building</th>
                    <th>Unit</th>
                    <th>Meter Number</th>
                    <th>Last Reading</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${missingRows.map(({ meter, cycle }) => {
                    const meterDetails = storage.getMeterWithDetails(meter.id);
                    const scheme = storage.get('schemes', cycle.scheme_id);
                    return `
                        <tr>
                            <td>${scheme?.name || 'Unknown Scheme'}</td>
                            <td>${cycle.start_date} to ${cycle.end_date}</td>
                            <td>${meterDetails.building_name || 'N/A'}</td>
                            <td><strong>${meterDetails.unit_name || 'N/A'}</strong></td>
                            <td>${meter.meter_number}</td>
                            <td>${meter.last_reading || 0} kWh</td>
                            <td><span class="badge badge-warning">MISSING</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

window.filterReview = function() {
    const cycleId = document.getElementById('review-cycle').value;
    const { readings, cycleMap } = getReviewScope(cycleId);
    if (cycleMap.size === 0) return;

    const flagTypeFilter = document.getElementById('filter-flag-type').value.toLowerCase();
    const statusFilter = document.getElementById('filter-review-status').value.toLowerCase();

    let filteredReadings = readings;

    // Keep only flagged readings for the flagged table
    filteredReadings = filteredReadings.filter(r =>
        (r.flags && r.flags.length > 0) || (r.manual_flags && r.manual_flags.length > 0)
    );

    if (flagTypeFilter) {
        filteredReadings = filteredReadings.filter(r => {
            const allFlags = [...(r.flags || []), ...(r.manual_flags || [])];
            return allFlags.some(f => String(f.type).toLowerCase() === flagTypeFilter);
        });
    }

    if (statusFilter) {
        filteredReadings = filteredReadings.filter(r => {
            const effective = String(getEffectiveReviewStatus(r, cycleMap.get(r.cycle_id))).toLowerCase();
            return effective === statusFilter;
        });
    }

    renderFlaggedReadings(filteredReadings, cycleId);
    updateReviewQueryFromState();
};

window.openReviewModal = function(readingId) {
    const reading = storage.getReadingWithDetails(readingId);
    if (!reading) return;
    
    const meter = reading.meter;
    
    // PHASE 3: Combine auto flags and manual flags
    const allFlags = validation.getAllFlags(reading);
    const autoFlags = allFlags.filter(f => f.source === 'auto');
    const manualFlags = allFlags.filter(f => f.source === 'manual');
    
    document.getElementById('review-reading-id').value = readingId;
    
    document.getElementById('review-reading-details').innerHTML = `
        <div class="info-box">
            <strong>Unit:</strong> ${meter.unit_name || 'N/A'}<br>
            <strong>Building:</strong> ${meter.building_name || 'N/A'}<br>
            <strong>Meter:</strong> ${meter.meter_number}<br>
            <strong>Previous Reading:</strong> ${getPreviousReadingDisplayValue(reading, meter)} kWh<br>
            <strong>Current Reading:</strong> ${reading.reading_value} kWh<br>
            <strong>Consumption:</strong> ${formatConsumption(reading)}<br>
            <strong>Reading Date:</strong> ${formatDateTime(reading.reading_date)}<br>
            <strong>Captured By:</strong> ${reading.captured_by || 'Unknown'}<br>
            <strong>Contact Details:</strong> ${reading.captured_by_contact_details || reading.submitted_by_contact_details || 'Not provided'}<br>
            <strong>Auto Flags:</strong> ${autoFlags.length > 0 ? autoFlags.map(f => `<span class="badge badge-danger" title="${f.description}">🤖 ${f.type}: ${f.message}</span>`).join(' ') : 'None'}<br>
            <strong>Manual Flags:</strong> ${manualFlags.length > 0 ? manualFlags.map(f => `<span class="badge badge-warning" title="${f.description}">👤 ${f.type}: ${f.message}</span>`).join(' ') : 'None'}<br>
            ${reading.notes ? `<strong>Notes:</strong> ${reading.notes}` : ''}
        </div>
        ${reading.photo ? `
            <div class="info-box mt-1">
                <strong>Photo Evidence:</strong><br>
                <img src="${reading.photo}" alt="Meter evidence" class="reading-photo-preview">
                ${reading.photo_name ? `<div class="text-muted">${reading.photo_name}</div>` : ''}
            </div>
        ` : ''}
        <button class="btn btn-secondary btn-sm mt-1" onclick="exportMeterReportFromReview('${meter.id}', '${reading.cycle_id}')">
            📄 Export Meter Report (Excel)
        </button>
    `;
    
    // PHASE 3: Load manual flags into UI
    loadManualFlagsUI(reading);
    
    document.getElementById('review-action').value = reading.review_status || '';
    document.getElementById('review-notes').value = reading.admin_notes || '';
    
    if (reading.estimated_value) {
        document.getElementById('estimated-value').value = reading.estimated_value;
    }
    
    toggleEstimateField();
    document.getElementById('review-modal').style.display = 'flex';
};

// PHASE 3: Load manual flags UI
function loadManualFlagsUI(reading) {
    const manualFlags = reading.manual_flags || [];
    const container = document.getElementById('manual-flags-list');
    
    if (manualFlags.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem; margin: 0;">No manual flags added.</p>';
    } else {
        container.innerHTML = manualFlags.map((flag, index) => `
            <div style="padding: 0.5rem; background: #fff3cd; border-left: 3px solid #ffc107; margin-bottom: 0.5rem; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${flag.type}</strong>
                        <span class="badge badge-${flag.severity === 'high' ? 'danger' : flag.severity === 'medium' ? 'warning' : 'info'}" style="margin-left: 0.5rem;">
                            ${flag.severity}
                        </span>
                        <p style="margin: 0.25rem 0; font-size: 0.9rem;">${flag.message}</p>
                        ${flag.description ? `<p style="margin: 0.25rem 0; font-size: 0.85rem; color: #666;">${flag.description}</p>` : ''}
                        <p style="margin: 0.25rem 0; font-size: 0.75rem; color: #999;">
                            Added by ${flag.added_by} on ${new Date(flag.added_at).toLocaleString()}
                        </p>
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" onclick="removeManualFlagFromUI('${reading.id}', ${index})" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                        ✕
                    </button>
                </div>
            </div>
        `).join('');
    }
}

window.showAddManualFlagForm = function() {
    document.getElementById('add-manual-flag-form').style.display = 'block';
    // Enable required fields so they participate in validation when visible
    document.querySelectorAll('#add-manual-flag-form input, #add-manual-flag-form select, #add-manual-flag-form textarea')
        .forEach(el => { el.disabled = false; });
};

window.cancelAddManualFlag = function() {
    document.getElementById('add-manual-flag-form').style.display = 'none';
    // Disable required fields so they don't block the main Save Review submission
    document.querySelectorAll('#add-manual-flag-form input, #add-manual-flag-form select, #add-manual-flag-form textarea')
        .forEach(el => { el.disabled = true; });
    document.getElementById('manual-flag-type').value = '';
    document.getElementById('manual-flag-severity').value = 'high';
    document.getElementById('manual-flag-message').value = '';
    document.getElementById('manual-flag-description').value = '';
};

window.saveManualFlag = function() {
    const readingId = document.getElementById('review-reading-id').value;
    const type = document.getElementById('manual-flag-type').value;
    const severity = document.getElementById('manual-flag-severity').value;
    const message = document.getElementById('manual-flag-message').value;
    const description = document.getElementById('manual-flag-description').value;
    
    if (!type || !severity || !message) {
        showNotification('Please fill all required fields', 'error');
        return;
    }
    
    // Add manual flag using validation module
    validation.addManualFlag(readingId, {
        type,
        severity,
        message,
        description
    });
    
    showNotification('Manual flag added successfully', 'success');
    
    // Reload manual flags UI
    const reading = storage.getReadingWithDetails(readingId);
    loadManualFlagsUI(reading);
    
    // Reset and hide form (re-disables required fields)
    window.cancelAddManualFlag();
};

window.removeManualFlagFromUI = function(readingId, flagIndex) {
    if (!confirm('Remove this manual flag?')) return;
    
    validation.removeManualFlag(readingId, flagIndex);
    showNotification('Manual flag removed', 'success');
    
    // Reload manual flags UI
    const reading = storage.getReadingWithDetails(readingId);
    loadManualFlagsUI(reading);
};

window.closeReviewModal = function() {
    document.getElementById('review-modal').style.display = 'none';
    document.getElementById('review-form').reset();
};

window.toggleEstimateField = function() {
    const action = document.getElementById('review-action').value;
    const estimateField = document.getElementById('estimate-field');
    
    if (action === 'estimated') {
        estimateField.style.display = 'block';
        document.getElementById('estimated-value').required = true;
    } else {
        estimateField.style.display = 'none';
        document.getElementById('estimated-value').required = false;
    }
};

document.getElementById('review-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const readingId = document.getElementById('review-reading-id').value;
    const action = document.getElementById('review-action').value;
    const adminNotes = document.getElementById('review-notes').value;
    
    const updateData = {
        review_status: action,
        admin_notes: adminNotes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'Admin' // In production: actual user
    };
    
    if (action === 'estimated') {
        const estimatedValueInput = document.getElementById('estimated-value');
        const estimatedValue = parseDecimalInput(estimatedValueInput.value);

        if (Number.isNaN(estimatedValue)) {
            showNotification('Please enter a valid estimated value. Decimals like 1450.5 or 1450,5 are accepted.');
            estimatedValueInput.focus();
            return;
        }

        updateData.estimated_value = estimatedValue;
        updateData.consumption = estimatedValue; // Override consumption
    }
    
    storage.update('readings', readingId, updateData);
    showNotification(`Reading marked as: ${action}`);
    
    closeReviewModal();
    window.loadReviewData();
});
// Export individual meter report from review modal
window.exportMeterReportFromReview = async function(meterId, cycleId) {
    const { xlsxExport } = await import('./xlsx-export.js');
    await xlsxExport.exportMeterReport(meterId, cycleId);
};

// Wire up all static event listeners (replaces inline onclick/onchange in HTML)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('review-cycle')?.addEventListener('change', () => window.loadReviewData());
    document.getElementById('filter-flag-type')?.addEventListener('change', () => window.filterReview());
    document.getElementById('filter-review-status')?.addEventListener('change', () => window.filterReview());
    document.getElementById('review-action')?.addEventListener('change', () => window.toggleEstimateField());
    document.getElementById('review-modal-close')?.addEventListener('click', () => window.closeReviewModal());
    document.getElementById('review-modal-cancel')?.addEventListener('click', () => window.closeReviewModal());
    document.getElementById('show-manual-flag-btn')?.addEventListener('click', () => window.showAddManualFlagForm());
    document.getElementById('save-manual-flag-btn')?.addEventListener('click', () => window.saveManualFlag());
    document.getElementById('cancel-manual-flag-btn')?.addEventListener('click', () => window.cancelAddManualFlag());

    document.querySelectorAll('.metric-card[data-focus]').forEach((card) => {
        const focus = card.getAttribute('data-focus') || REVIEW_FOCUS.ALL;
        card.addEventListener('click', () => window.focusReviewMetric(focus));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.focusReviewMetric(focus);
            }
        });
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('review-modal');
            if (modal && modal.style.display !== 'none') window.closeReviewModal();
        }
    });
});
