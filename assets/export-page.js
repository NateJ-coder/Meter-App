/**
 * export-page.js - Export Page Logic
 */

import { storage } from './storage.js';
import { csv } from './csv.js';
import { xlsxExport } from './xlsx-export.js';

// Load page
populateCycleSelect();

function populateCycleSelect() {
    const cycles = storage.getAll('cycles').sort((a, b) => 
        new Date(b.start_date) - new Date(a.start_date)
    );
    
    const select = document.getElementById('export-cycle');
    select.innerHTML = '<option value="">-- Select Cycle --</option>' +
        cycles.map(cycle => {
            const scheme = storage.get('schemes', cycle.scheme_id);
            return `<option value="${cycle.id}">${scheme ? scheme.name : 'Unknown'} - ${cycle.start_date} to ${cycle.end_date} (${cycle.status})</option>`;
        }).join('');
    
    // Auto-select first closed cycle or first cycle
    const closedCycle = cycles.find(c => c.status === 'CLOSED');
    if (closedCycle) {
        select.value = closedCycle.id;
        loadExportPreview();
    } else if (cycles.length > 0) {
        select.value = cycles[0].id;
        loadExportPreview();
    }
}

window.loadExportPreview = function() {
    const cycleId = document.getElementById('export-cycle').value;
    if (!cycleId) {
        document.getElementById('export-summary-section').style.display = 'none';
        document.getElementById('export-options-section').style.display = 'none';
        document.getElementById('preview-section').style.display = 'none';
        document.getElementById('summary-preview-section').style.display = 'none';
        return;
    }
    
    loadExportSummary(cycleId);
    loadUnitReadingsPreview(cycleId);
    loadSchemeSummaryPreview(cycleId);
    
    document.getElementById('export-summary-section').style.display = 'block';
    document.getElementById('export-options-section').style.display = 'block';
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('summary-preview-section').style.display = 'block';
};

function loadExportSummary(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    const scheme = storage.get('schemes', cycle.scheme_id);
    const readings = storage.getReadings(cycleId);
    const meters = storage.getMeters(cycle.scheme_id).filter(m => m.meter_type === 'UNIT');
    
    const flaggedCount = readings.filter(r => r.flags && r.flags.length > 0).length;
    const notReadCount = meters.length - readings.length;
    
    document.getElementById('export-summary').innerHTML = `
        <div class="info-box">
            <strong>Scheme:</strong> ${scheme.name}<br>
            <strong>Period:</strong> ${cycle.start_date} to ${cycle.end_date}<br>
            <strong>Status:</strong> <span class="badge badge-${cycle.status === 'CLOSED' ? 'secondary' : 'success'}">${cycle.status}</span><br>
            <strong>Total Unit Meters:</strong> ${meters.length}<br>
            <strong>Readings Captured:</strong> ${readings.length}<br>
            <strong>Not Read:</strong> ${notReadCount}<br>
            <strong>Flagged Readings:</strong> ${flaggedCount}
        </div>
        ${cycle.status === 'OPEN' ? '<p class="text-muted mt-2"><strong>Note:</strong> This cycle is still OPEN. Consider closing it before exporting final data.</p>' : ''}
    `;
}

function loadUnitReadingsPreview(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    const scheme = storage.get('schemes', cycle.scheme_id);
    const readings = storage.getReadings(cycleId);
    
    if (readings.length === 0) {
        document.getElementById('unit-readings-preview').innerHTML = '<p class="text-muted">No readings captured yet.</p>';
        return;
    }
    
    document.getElementById('unit-readings-preview').innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Building</th>
                    <th>Unit</th>
                    <th>Meter</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Consumption</th>
                    <th>Flags</th>
                    <th>Review</th>
                </tr>
            </thead>
            <tbody>
                ${readings.map(reading => {
                    const meter = storage.getMeterWithDetails(reading.meter_id);
                    if (!meter || meter.meter_type !== 'UNIT') return '';
                    
                    const flags = reading.flags && reading.flags.length > 0 
                        ? reading.flags.map(f => f.type).join(', ')
                        : '-';
                    
                    return `
                        <tr>
                            <td>${meter.building_name || 'N/A'}</td>
                            <td>${meter.unit_name || 'N/A'}</td>
                            <td>${meter.meter_number}</td>
                            <td>${meter.last_reading || 0}</td>
                            <td>${reading.reading_value}</td>
                            <td>${reading.consumption != null ? reading.consumption.toFixed(2) : 'N/A'}</td>
                            <td>${flags}</td>
                            <td><span class="badge badge-secondary">${reading.review_status || 'pending'}</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        <p class="text-muted mt-2">Showing first ${Math.min(readings.length, 50)} readings. Full data will be in CSV export.</p>
    `;
}

function loadSchemeSummaryPreview(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    const scheme = storage.get('schemes', cycle.scheme_id);
    const readings = storage.getReadings(cycleId);
    const meters = storage.getMeters(cycle.scheme_id);
    
    // Calculate totals
    let bulk_kWh = 0;
    let sum_units_kWh = 0;
    
    // Get bulk meter reading
    const bulkMeter = meters.find(m => m.meter_type === 'BULK');
    if (bulkMeter) {
        const bulkReading = readings.find(r => r.meter_id === bulkMeter.id);
        if (bulkReading && bulkReading.consumption != null) {
            bulk_kWh = bulkReading.consumption;
        }
    }
    
    // Sum unit consumptions
    readings.forEach(reading => {
        const meter = storage.get('meters', reading.meter_id);
        if (meter && meter.meter_type === 'UNIT' && reading.consumption != null) {
            sum_units_kWh += reading.consumption;
        }
    });
    
    const common_kWh = bulk_kWh - sum_units_kWh;
    const losses_percent = bulk_kWh > 0 ? (common_kWh / bulk_kWh) * 100 : 0;
    
    document.getElementById('scheme-summary-preview').innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Bulk Meter kWh</strong></td>
                    <td>${bulk_kWh.toFixed(2)} kWh</td>
                </tr>
                <tr>
                    <td><strong>Sum of Unit Meters kWh</strong></td>
                    <td>${sum_units_kWh.toFixed(2)} kWh</td>
                </tr>
                <tr>
                    <td><strong>Common Area kWh</strong></td>
                    <td>${common_kWh.toFixed(2)} kWh</td>
                </tr>
                <tr>
                    <td><strong>Losses %</strong></td>
                    <td>${losses_percent.toFixed(2)}%</td>
                </tr>
            </tbody>
        </table>
        <p class="text-muted mt-2">
            <strong>Common kWh</strong> = Bulk kWh - Sum of Units kWh<br>
            Represents common area consumption, electrical losses, meter drift, or missing/estimated reads.
        </p>
    `;
}

window.exportUnitReadings = function() {
    const cycleId = document.getElementById('export-cycle').value;
    if (!cycleId) {
        alert('Please select a cycle first');
        return;
    }
    csv.exportUnitReadings(cycleId);
};

window.exportSchemeSummary = function() {
    const cycleId = document.getElementById('export-cycle').value;
    if (!cycleId) {
        alert('Please select a cycle first');
        return;
    }
    csv.exportSchemeSummary(cycleId);
};

window.exportAllData = function() {
    const cycleId = document.getElementById('export-cycle').value;
    if (!cycleId) {
        alert('Please select a cycle first');
        return;
    }
    csv.exportAllData(cycleId);
};

// === XLSX EXPORTS ===

window.exportSchemeReportXLSX = function() {
    const cycleId = document.getElementById('export-cycle').value;
    if (!cycleId) {
        alert('Please select a cycle first');
        return;
    }
    xlsxExport.exportSchemeReport(cycleId);
};

window.exportMeterReportXLSX = function(meterId, cycleId) {
    if (!meterId || !cycleId) {
        alert('Invalid meter or cycle');
        return;
    }
    xlsxExport.exportMeterReport(meterId, cycleId);
};
