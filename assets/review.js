/**
 * review.js - Review Page Logic
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { showNotification, formatDateTime } from './app.js';

// Load page
populateCycleSelect();
loadReviewData();

function populateCycleSelect() {
    const cycles = storage.getAll('cycles').sort((a, b) => 
        new Date(b.start_date) - new Date(a.start_date)
    );
    
    const select = document.getElementById('review-cycle');
    select.innerHTML = '<option value="">-- Select Cycle --</option>' +
        cycles.map(cycle => {
            const scheme = storage.get('schemes', cycle.scheme_id);
            return `<option value="${cycle.id}">${scheme ? scheme.name : 'Unknown'} - ${cycle.start_date} (${cycle.status})</option>`;
        }).join('');
    
    // Auto-select first cycle if available
    if (cycles.length > 0) {
        select.value = cycles[0].id;
    }
}

window.loadReviewData = function() {
    const cycleId = document.getElementById('review-cycle').value;
    if (!cycleId) {
        document.getElementById('flagged-readings-list').innerHTML = '<p class="text-muted">Select a cycle to review.</p>';
        document.getElementById('missing-readings-list').innerHTML = '';
        return;
    }
    
    loadMetrics(cycleId);
    loadFlaggedReadings(cycleId);
    loadMissingReadings(cycleId);
};

function loadMetrics(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    const meters = storage.getMeters(cycle.scheme_id).filter(m => m.meter_type === 'UNIT');
    const readings = storage.getReadings(cycleId);
    
    const flaggedCount = readings.filter(r => r.flags && r.flags.length > 0).length;
    const approvedCount = readings.filter(r => r.review_status === 'approved').length;
    const notReadCount = meters.length - readings.length;
    
    document.getElementById('review-total-readings').textContent = readings.length;
    document.getElementById('review-not-read').textContent = notReadCount;
    document.getElementById('review-flagged').textContent = flaggedCount;
    document.getElementById('review-approved').textContent = approvedCount;
}

function loadFlaggedReadings(cycleId) {
    const readings = storage.getReadings(cycleId);
    const flaggedReadings = readings.filter(r => r.flags && r.flags.length > 0);
    
    const container = document.getElementById('flagged-readings-list');
    
    if (flaggedReadings.length === 0) {
        container.innerHTML = '<p class="text-muted">No flagged readings. Everything looks good!</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
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
                    const flags = reading.flags.map(f => `
                        <span class="badge badge-danger" title="${f.message}">${f.type}</span>
                    `).join(' ');
                    
                    let statusBadge = 'badge-warning';
                    let statusText = reading.review_status || 'pending';
                    if (statusText === 'approved') statusBadge = 'badge-success';
                    if (statusText === 'site-visit') statusBadge = 'badge-danger';
                    
                    return `
                        <tr>
                            <td>${meter.unit_name || 'N/A'}</td>
                            <td>${meter.meter_number}</td>
                            <td>${reading.reading_value} kWh</td>
                            <td>${reading.consumption != null ? reading.consumption.toFixed(2) : 'N/A'} kWh</td>
                            <td>${flags}</td>
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
    const missingMeters = validation.getMissingReadings(cycleId);
    const container = document.getElementById('missing-readings-list');
    
    if (missingMeters.length === 0) {
        container.innerHTML = '<p class="text-muted">All meters have been read.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Building</th>
                    <th>Unit</th>
                    <th>Meter Number</th>
                    <th>Last Reading</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${missingMeters.map(meter => {
                    const meterDetails = storage.getMeterWithDetails(meter.id);
                    return `
                        <tr>
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
    // Simple reload for now
    loadReviewData();
};

window.openReviewModal = function(readingId) {
    const reading = storage.getReadingWithDetails(readingId);
    if (!reading) return;
    
    const meter = reading.meter;
    const flags = reading.flags || [];
    
    document.getElementById('review-reading-id').value = readingId;
    
    document.getElementById('review-reading-details').innerHTML = `
        <div class="info-box">
            <strong>Unit:</strong> ${meter.unit_name || 'N/A'}<br>
            <strong>Building:</strong> ${meter.building_name || 'N/A'}<br>
            <strong>Meter:</strong> ${meter.meter_number}<br>
            <strong>Previous Reading:</strong> ${meter.last_reading || 0} kWh<br>
            <strong>Current Reading:</strong> ${reading.reading_value} kWh<br>
            <strong>Consumption:</strong> ${reading.consumption != null ? reading.consumption.toFixed(2) : 'N/A'} kWh<br>
            <strong>Reading Date:</strong> ${formatDateTime(reading.reading_date)}<br>
            <strong>Flags:</strong> ${flags.length > 0 ? flags.map(f => `<span class="badge badge-danger">${f.type}: ${f.message}</span>`).join(' ') : 'None'}<br>
            ${reading.notes ? `<strong>Notes:</strong> ${reading.notes}` : ''}
        </div>
    `;
    
    document.getElementById('review-action').value = reading.review_status || '';
    document.getElementById('review-notes').value = reading.admin_notes || '';
    
    if (reading.estimated_value) {
        document.getElementById('estimated-value').value = reading.estimated_value;
    }
    
    toggleEstimateField();
    document.getElementById('review-modal').style.display = 'flex';
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
        const estimatedValue = parseFloat(document.getElementById('estimated-value').value);
        updateData.estimated_value = estimatedValue;
        updateData.consumption = estimatedValue; // Override consumption
    }
    
    storage.update('readings', readingId, updateData);
    showNotification(`Reading marked as: ${action}`);
    
    closeReviewModal();
    loadReviewData();
});
