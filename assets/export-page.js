/**
 * export-page.js - Export Page Logic with Cascading Filters
 */

import { storage } from './storage.js';
import { csv } from './csv.js';
import { xlsxExport } from './xlsx-export.js';

// State management
let currentFilters = {
    schemeId: null,
    cycleId: null,
    meterType: null,
    unitId: null
};

// Initialize page
initializeExportPage();

function initializeExportPage() {
    populateSchemeFilter();
    updateFilterSummary();
}

// === FILTER CASCADE ===

function populateSchemeFilter() {
    const schemes = storage.getAll('schemes');
    const select = document.getElementById('filter-scheme');
    
    select.innerHTML = '<option value="">-- All Schemes --</option>' +
        schemes.map(scheme => 
            `<option value="${scheme.id}">${scheme.name}</option>`
        ).join('');
}

window.onSchemeChange = function() {
    const schemeId = document.getElementById('filter-scheme').value;
    currentFilters.schemeId = schemeId || null;
    currentFilters.cycleId = null;
    currentFilters.meterType = null;
    currentFilters.unitId = null;
    
    // Reset dependent filters
    document.getElementById('filter-cycle').value = '';
    document.getElementById('filter-meter-type').value = '';
    document.getElementById('filter-unit').value = '';
    
    if (schemeId) {
        populateCycleFilter(schemeId);
        populateUnitFilter(schemeId);
        document.getElementById('filter-cycle').disabled = false;
        document.getElementById('filter-meter-type').disabled = false;
        document.getElementById('filter-unit').disabled = false;
    } else {
        document.getElementById('filter-cycle').disabled = true;
        document.getElementById('filter-cycle').innerHTML = '<option value="">-- Select scheme first --</option>';
        document.getElementById('filter-meter-type').disabled = true;
        document.getElementById('filter-unit').disabled = true;
        document.getElementById('filter-unit').innerHTML = '<option value="">-- Select scheme first --</option>';
        hideExportOptions();
    }
    
    updateFilterSummary();
};

function populateCycleFilter(schemeId) {
    const cycles = storage.getAll('cycles')
        .filter(c => c.scheme_id === schemeId)
        .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    
    const select = document.getElementById('filter-cycle');
    select.innerHTML = '<option value="">-- Select Cycle --</option>' +
        cycles.map(cycle => {
            const statusBadge = cycle.status === 'OPEN' ? '🟢' : '🔵';
            return `<option value="${cycle.id}">${statusBadge} ${cycle.start_date} to ${cycle.end_date} (${cycle.status})</option>`;
        }).join('');
    
    // Auto-select first closed cycle
    const closedCycle = cycles.find(c => c.status === 'CLOSED');
    if (closedCycle) {
        select.value = closedCycle.id;
        currentFilters.cycleId = closedCycle.id;
        loadExportOptions();
    }
}

function populateUnitFilter(schemeId) {
    const buildings = storage.getAll('buildings').filter(b => b.scheme_id === schemeId);
    const units = storage.getAll('units').filter(u => {
        const building = buildings.find(b => b.id === u.building_id);
        return building !== undefined;
    });
    
    // Sort units by building and unit number
    units.sort((a, b) => {
        const buildingA = buildings.find(bld => bld.id === a.building_id);
        const buildingB = buildings.find(bld => bld.id === b.building_id);
        if (buildingA.name !== buildingB.name) {
            return buildingA.name.localeCompare(buildingB.name);
        }
        return a.unit_number.localeCompare(b.unit_number);
    });
    
    const select = document.getElementById('filter-unit');
    select.innerHTML = '<option value="">-- All Units --</option>' +
        units.map(unit => {
            const building = buildings.find(b => b.id === unit.building_id);
            return `<option value="${unit.id}">${building?.name} - ${unit.unit_number}</option>`;
        }).join('');
}

window.onCycleChange = function() {
    const cycleId = document.getElementById('filter-cycle').value;
    currentFilters.cycleId = cycleId || null;
    
    if (cycleId) {
        loadExportOptions();
    } else {
        hideExportOptions();
    }
    
    updateFilterSummary();
};

window.onMeterTypeChange = function() {
    const meterType = document.getElementById('filter-meter-type').value;
    currentFilters.meterType = meterType || null;
    
    if (currentFilters.cycleId) {
        loadExportOptions();
    }
    
    updateFilterSummary();
};

window.onUnitChange = function() {
    const unitId = document.getElementById('filter-unit').value;
    currentFilters.unitId = unitId || null;
    
    if (currentFilters.cycleId) {
        loadExportOptions();
    }
    
    updateFilterSummary();
};

window.resetFilters = function() {
    document.getElementById('filter-scheme').value = '';
    document.getElementById('filter-cycle').value = '';
    document.getElementById('filter-meter-type').value = '';
    document.getElementById('filter-unit').value = '';
    
    currentFilters = {
        schemeId: null,
        cycleId: null,
        meterType: null,
        unitId: null
    };
    
    document.getElementById('filter-cycle').disabled = true;
    document.getElementById('filter-meter-type').disabled = true;
    document.getElementById('filter-unit').disabled = true;
    
    hideExportOptions();
    updateFilterSummary();
};

function updateFilterSummary() {
    const summary = document.getElementById('filter-summary');
    
    if (!currentFilters.schemeId) {
        summary.textContent = 'Select a scheme to begin';
        return;
    }
    
    const scheme = storage.get('schemes', currentFilters.schemeId);
    let text = `📍 ${scheme.name}`;
    
    if (currentFilters.cycleId) {
        const cycle = storage.get('cycles', currentFilters.cycleId);
        text += ` → 📅 ${cycle.start_date} to ${cycle.end_date}`;
    }
    
    if (currentFilters.meterType) {
        text += ` → 🔌 ${currentFilters.meterType} meters`;
    }
    
    if (currentFilters.unitId) {
        const unit = storage.get('units', currentFilters.unitId);
        text += ` → 🏠 Unit ${unit.unit_number}`;
    }
    
    summary.textContent = text;
}

// === EXPORT OPTIONS DISPLAY ===

function loadExportOptions() {
    if (!currentFilters.cycleId) {
        hideExportOptions();
        return;
    }
    
    const cycle = storage.get('cycles', currentFilters.cycleId);
    const scheme = storage.get('schemes', cycle.scheme_id);
    
    // Show export section
    document.getElementById('export-options-section').style.display = 'block';
    document.getElementById('export-summary-section').style.display = 'block';
    
    // Load summary
    loadExportSummary();
    
    // Load preview (if needed)
    loadPreviewTables();
    
    // Show/hide individual meter exports based on filters
    if (currentFilters.unitId || currentFilters.meterType === 'UNIT') {
        loadIndividualMeterList();
        document.getElementById('meter-exports').style.display = 'block';
    } else {
        document.getElementById('meter-exports').style.display = 'none';
    }
}

function hideExportOptions() {
    document.getElementById('export-options-section').style.display = 'none';
    document.getElementById('export-summary-section').style.display = 'none';
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('summary-preview-section').style.display = 'none';
}

function loadIndividualMeterList() {
    const cycle = storage.get('cycles', currentFilters.cycleId);
    const readings = storage.getReadings(currentFilters.cycleId);
    
    // Filter meters based on current filters
    let meters = storage.getMeters(cycle.scheme_id);
    
    if (currentFilters.meterType) {
        meters = meters.filter(m => m.meter_type === currentFilters.meterType);
    }
    
    if (currentFilters.unitId) {
        meters = meters.filter(m => m.unit_id === currentFilters.unitId);
    }
    
    // Only show UNIT meters for individual reports
    meters = meters.filter(m => m.meter_type === 'UNIT');
    
    const container = document.getElementById('meter-list');
    
    if (meters.length === 0) {
        container.innerHTML = '<p class="text-muted">No unit meters match your filters.</p>';
        return;
    }
    
    container.innerHTML = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Unit</th>
                        <th>Meter Number</th>
                        <th>Consumption</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${meters.map(meter => {
                        const meterDetails = storage.getMeterWithDetails(meter.id);
                        const reading = readings.find(r => r.meter_id === meter.id);
                        const consumption = reading?.consumption != null ? reading.consumption.toFixed(2) + ' kWh' : 'Not read';
                        
                        return `
                            <tr>
                                <td>${meterDetails.unit_name || 'N/A'}</td>
                                <td>${meter.meter_number}</td>
                                <td>${consumption}</td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="exportSingleMeterReport('${meter.id}', '${currentFilters.cycleId}')">
                                        📄 Export
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <button class="btn btn-secondary mt-1" onclick="exportAllFilteredMeters()">
            📦 Export All ${meters.length} Meter Reports (Batch)
        </button>
    `;
}

function loadExportSummary() {
    const cycle = storage.get('cycles', currentFilters.cycleId);
    const scheme = storage.get('schemes', cycle.scheme_id);
    const readings = storage.getReadings(currentFilters.cycleId);
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

function loadPreviewTables() {
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('summary-preview-section').style.display = 'block';
    
    loadUnitReadingsPreview();
    loadSchemeSummaryPreview();
}

function loadUnitReadingsPreview() {
    const cycle = storage.get('cycles', currentFilters.cycleId);
    const readings = storage.getReadings(currentFilters.cycleId);
    
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

function loadSchemeSummaryPreview() {
    const cycle = storage.get('cycles', currentFilters.cycleId);
    const scheme = storage.get('schemes', cycle.scheme_id);
    const readings = storage.getReadings(currentFilters.cycleId);
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

// === EXPORT FUNCTIONS ===

window.exportUnitReadings = function() {
    if (!currentFilters.cycleId) {
        alert('Please select a cycle first');
        return;
    }
    csv.exportUnitReadings(currentFilters.cycleId);
};

window.exportSchemeSummary = function() {
    if (!currentFilters.cycleId) {
        alert('Please select a cycle first');
        return;
    }
    csv.exportSchemeSummary(currentFilters.cycleId);
};

window.exportAllData = function() {
    if (!currentFilters.cycleId) {
        alert('Please select a cycle first');
        return;
    }
    csv.exportAllData(currentFilters.cycleId);
};

// === XLSX EXPORTS ===

window.exportSchemeReportXLSX = function() {
    if (!currentFilters.cycleId) {
        alert('Please select a cycle first');
        return;
    }
    xlsxExport.exportSchemeReport(currentFilters.cycleId);
};

window.exportSingleMeterReport = function(meterId, cycleId) {
    if (!meterId || !cycleId) {
        alert('Invalid meter or cycle');
        return;
    }
    xlsxExport.exportMeterReport(meterId, cycleId);
};

window.exportAllFilteredMeters = async function() {
    if (!currentFilters.cycleId) {
        alert('Please select a cycle first');
        return;
    }
    
    const cycle = storage.get('cycles', currentFilters.cycleId);
    let meters = storage.getMeters(cycle.scheme_id);
    
    if (currentFilters.meterType) {
        meters = meters.filter(m => m.meter_type === currentFilters.meterType);
    }
    
    if (currentFilters.unitId) {
        meters = meters.filter(m => m.unit_id === currentFilters.unitId);
    }
    
    meters = meters.filter(m => m.meter_type === 'UNIT');
    
    if (meters.length === 0) {
        alert('No meters to export');
        return;
    }
    
    const confirm_export = confirm(`Export ${meters.length} individual meter reports?\n\nThis will download ${meters.length} Excel files.`);
    if (!confirm_export) return;
    
    for (let i = 0; i < meters.length; i++) {
        await xlsxExport.exportMeterReport(meters[i].id, currentFilters.cycleId);
        // Small delay to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    alert(`✅ Exported ${meters.length} meter reports successfully!`);
};
