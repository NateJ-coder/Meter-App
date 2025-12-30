/**
 * reading-cycle.js - Reading Cycle Page Logic
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { showNotification, confirmAction, getTodayDate, getCurrentDateTime, formatDateTime } from './app.js';

// Load page
loadCycleStatus();
populateSchemeSelect();

// Set default dates (current month)
const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
document.getElementById('cycle-start-date').value = firstDay.toISOString().split('T')[0];
document.getElementById('cycle-end-date').value = lastDay.toISOString().split('T')[0];

// Cycle form submission
document.getElementById('cycle-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const schemeId = document.getElementById('cycle-scheme').value;
    
    // Check if there's already an open cycle
    const existingCycle = storage.getOpenCycle(schemeId);
    if (existingCycle) {
        showNotification('There is already an open cycle for this scheme. Close it first.');
        return;
    }
    
    const cycle = storage.create('cycles', {
        scheme_id: schemeId,
        start_date: document.getElementById('cycle-start-date').value,
        end_date: document.getElementById('cycle-end-date').value,
        status: 'OPEN'
    });
    
    showNotification('Reading cycle opened successfully!');
    loadCycleStatus();
});

function loadCycleStatus() {
    const cycles = storage.getAll('cycles');
    const openCycle = cycles.find(c => c.status === 'OPEN');
    
    if (!openCycle) {
        document.getElementById('cycle-status').innerHTML = `
            <div class="cycle-status closed">
                <div class="status-badge">NO OPEN CYCLE</div>
                <p class="text-muted">Open a new reading cycle to start capturing readings.</p>
            </div>
        `;
        document.getElementById('open-cycle-section').style.display = 'block';
        document.getElementById('capture-section').style.display = 'none';
        return;
    }
    
    const scheme = storage.get('schemes', openCycle.scheme_id);
    document.getElementById('cycle-status').innerHTML = `
        <div class="cycle-status open">
            <div class="status-badge">OPEN</div>
            <div>
                <strong>${scheme ? scheme.name : 'Unknown Scheme'}</strong>
                <br>
                <span class="text-muted">${openCycle.start_date} to ${openCycle.end_date}</span>
            </div>
        </div>
    `;
    
    document.getElementById('open-cycle-section').style.display = 'none';
    document.getElementById('capture-section').style.display = 'block';
    
    loadReadingsList(openCycle.id);
    populateBuildingFilter(openCycle.scheme_id);
}

function populateBuildingFilter(schemeId) {
    const buildings = storage.getBuildings(schemeId);
    const select = document.getElementById('filter-building');
    select.innerHTML = '<option value="">All Buildings</option>' +
        buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

function loadReadingsList(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    const meters = storage.getMeters(cycle.scheme_id).filter(m => m.meter_type === 'UNIT');
    const readings = storage.getReadings(cycleId);
    
    const readingsMap = {};
    readings.forEach(r => {
        readingsMap[r.meter_id] = r;
    });
    
    const container = document.getElementById('readings-list');
    
    if (meters.length === 0) {
        container.innerHTML = '<p class="text-muted">No unit meters found for this scheme.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Building</th>
                    <th>Unit</th>
                    <th>Meter Number</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Consumption</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${meters.map(meter => {
                    const meterDetails = storage.getMeterWithDetails(meter.id);
                    const reading = readingsMap[meter.id];
                    const hasFlags = reading && reading.flags && reading.flags.length > 0;
                    
                    let statusBadge = '<span class="badge badge-warning">NOT READ</span>';
                    let currentReading = '-';
                    let consumption = '-';
                    
                    if (reading) {
                        currentReading = reading.reading_value;
                        consumption = reading.consumption != null ? reading.consumption.toFixed(2) + ' kWh' : 'N/A';
                        statusBadge = hasFlags ? 
                            '<span class="badge badge-danger">FLAGGED</span>' :
                            '<span class="badge badge-success">READ</span>';
                    }
                    
                    return `
                        <tr>
                            <td>${meterDetails.building_name || 'N/A'}</td>
                            <td><strong>${meterDetails.unit_name || 'N/A'}</strong></td>
                            <td>${meter.meter_number}</td>
                            <td>${meter.last_reading || 0}</td>
                            <td>${currentReading}</td>
                            <td>${consumption}</td>
                            <td>${statusBadge}</td>
                            <td>
                                <button class="btn btn-primary" onclick="openReadingModal('${meter.id}', '${cycleId}')">
                                    ${reading ? 'Edit' : 'Capture'}
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

window.filterReadings = function() {
    // Simple filter implementation
    const buildingId = document.getElementById('filter-building').value;
    const status = document.getElementById('filter-status').value;
    
    // For now, just reload (in production, filter the table rows)
    const openCycle = storage.getAll('cycles').find(c => c.status === 'OPEN');
    if (openCycle) {
        loadReadingsList(openCycle.id);
    }
};

window.openReadingModal = function(meterId, cycleId) {
    const meter = storage.getMeterWithDetails(meterId);
    const readings = storage.getReadings(cycleId);
    const existingReading = readings.find(r => r.meter_id === meterId);
    
    document.getElementById('reading-meter-id').value = meterId;
    document.getElementById('reading-cycle-id').value = cycleId;
    
    document.getElementById('meter-details').innerHTML = `
        <strong>Unit:</strong> ${meter.unit_name || 'N/A'}<br>
        <strong>Building:</strong> ${meter.building_name || 'N/A'}<br>
        <strong>Meter Number:</strong> ${meter.meter_number}<br>
        <strong>Previous Reading:</strong> ${meter.last_reading || 0} kWh
    `;
    
    if (existingReading) {
        document.getElementById('reading-modal-title').textContent = 'Edit Reading';
        document.getElementById('reading-value').value = existingReading.reading_value;
        document.getElementById('reading-date').value = existingReading.reading_date.substring(0, 16);
        document.getElementById('reading-photo').value = existingReading.photo || '';
        document.getElementById('reading-notes').value = existingReading.notes || '';
    } else {
        document.getElementById('reading-modal-title').textContent = 'Capture Reading';
        document.getElementById('reading-form').reset();
        document.getElementById('reading-date').value = getCurrentDateTime();
    }
    
    document.getElementById('reading-modal').style.display = 'flex';
};

window.closeReadingModal = function() {
    document.getElementById('reading-modal').style.display = 'none';
    document.getElementById('reading-form').reset();
};

document.getElementById('reading-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const meterId = document.getElementById('reading-meter-id').value;
    const cycleId = document.getElementById('reading-cycle-id').value;
    const readingValue = parseFloat(document.getElementById('reading-value').value);
    
    const meter = storage.get('meters', meterId);
    const consumption = validation.calculateConsumption(readingValue, meter.last_reading);
    
    const readingData = {
        meter_id: meterId,
        cycle_id: cycleId,
        reading_value: readingValue,
        reading_date: document.getElementById('reading-date').value,
        photo: document.getElementById('reading-photo').value,
        notes: document.getElementById('reading-notes').value,
        consumption: consumption,
        captured_by: 'Admin', // In production: actual user
        flags: [],
        review_status: 'pending'
    };
    
    // Validate and generate flags
    readingData.flags = validation.validateReading(readingData);
    
    // Check if reading already exists
    const readings = storage.getReadings(cycleId);
    const existingReading = readings.find(r => r.meter_id === meterId);
    
    if (existingReading) {
        storage.update('readings', existingReading.id, readingData);
        showNotification('Reading updated successfully');
    } else {
        storage.create('readings', readingData);
        showNotification('Reading captured successfully');
    }
    
    // Update meter's last reading (for next cycle reference)
    storage.update('meters', meterId, { last_reading: readingValue });
    
    closeReadingModal();
    loadReadingsList(cycleId);
});

window.closeCycle = function() {
    if (!confirmAction('Close this reading cycle? This will lock all readings for this period.')) {
        return;
    }
    
    const openCycle = storage.getAll('cycles').find(c => c.status === 'OPEN');
    if (!openCycle) return;
    
    storage.update('cycles', openCycle.id, { status: 'CLOSED' });
    showNotification('Cycle closed successfully');
    loadCycleStatus();
};

function populateSchemeSelect() {
    const schemes = storage.getSchemes();
    const select = document.getElementById('cycle-scheme');
    select.innerHTML = '<option value="">-- Select Scheme --</option>' +
        schemes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}
