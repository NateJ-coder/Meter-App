/**
 * export-page.js - Export Page Logic with Cascading Filters
 */

import { storage } from './storage.js';
import { csv } from './csv.js';
import { xlsxExport } from './xlsx-export.js';
import { getCycleExportLayout } from './export-layout.js';

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

    const layout = getVisibleExportLayout();
    if (!layout) {
        hideExportOptions();
        return;
    }
    
    // Show export section
    document.getElementById('export-options-section').style.display = 'block';
    document.getElementById('export-summary-section').style.display = 'block';
    document.getElementById('layout-preview-section').style.display = 'block';
    
    // Load summary
    loadExportSummary();
    loadOutputLayoutPreview();
    
    // Load preview (if needed)
    loadPreviewTables();

    loadBuildingReportList();
    loadUnitReportList();

    document.getElementById('building-exports').style.display = layout.buildings.length > 0 ? 'block' : 'none';
    document.getElementById('unit-exports').style.display = layout.units.length > 0 ? 'block' : 'none';
}

function hideExportOptions() {
    document.getElementById('export-options-section').style.display = 'none';
    document.getElementById('export-summary-section').style.display = 'none';
    document.getElementById('layout-preview-section').style.display = 'none';
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('summary-preview-section').style.display = 'none';
}

function getVisibleExportLayout() {
    if (!currentFilters.cycleId) {
        return null;
    }

    return getCycleExportLayout(currentFilters.cycleId, {
        meterType: currentFilters.meterType,
        unitId: currentFilters.unitId
    });
}

function loadBuildingReportList() {
    const layout = getVisibleExportLayout();
    const container = document.getElementById('building-list');

    if (!layout || layout.buildings.length === 0) {
        container.innerHTML = '<p class="text-muted">No building outputs match the current filters.</p>';
        return;
    }

    container.innerHTML = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Building</th>
                        <th>Units</th>
                        <th>Readings</th>
                        <th>Flags</th>
                        <th>Consumption</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${layout.buildings.map(building => `
                        <tr>
                            <td>${building.buildingName}</td>
                            <td>${building.unitCount}</td>
                            <td>${building.readCount} / ${building.meterCount}</td>
                            <td>${building.flaggedCount}</td>
                            <td>${building.totalConsumption.toFixed(2)} kWh</td>
                            <td>
                                <button class="btn btn-sm btn-primary" onclick="exportBuildingReport('${building.buildingId}')">
                                    📄 Export
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <button class="btn btn-secondary mt-1" onclick="exportAllBuildingReports()">
            🏢 Export All ${layout.buildings.length} Building Reports
        </button>
    `;
}

function loadUnitReportList() {
    const layout = getVisibleExportLayout();
    const container = document.getElementById('unit-list');

    if (!layout || layout.units.length === 0) {
        container.innerHTML = '<p class="text-muted">No unit outputs match the current filters.</p>';
        return;
    }

    container.innerHTML = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Building</th>
                        <th>Unit</th>
                        <th>Meters</th>
                        <th>Consumption</th>
                        <th>Review</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${layout.units.map(unit => `
                        <tr>
                            <td>${unit.buildingName}</td>
                            <td>${unit.unitNumber}</td>
                            <td>${unit.meterCount}</td>
                            <td>${unit.totalConsumption.toFixed(2)} kWh</td>
                            <td>${unit.reviewStatuses.length > 0 ? unit.reviewStatuses.join(', ') : 'missing'}</td>
                            <td>
                                <button class="btn btn-sm btn-primary" onclick="exportUnitReport('${unit.unitId}')">
                                    📄 Export
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <button class="btn btn-secondary mt-1" onclick="exportAllUnitReports()">
            📦 Export All ${layout.units.length} Unit Reports
        </button>
    `;
}

function loadExportSummary() {
    const layout = getVisibleExportLayout();
    if (!layout) {
        return;
    }

    const { cycle, scheme, schemeStats } = layout;
    
    document.getElementById('export-summary').innerHTML = `
        <div class="info-box">
            <strong>Scheme:</strong> ${scheme.name}<br>
            <strong>Period:</strong> ${cycle.start_date} to ${cycle.end_date}<br>
            <strong>Status:</strong> <span class="badge badge-${cycle.status === 'CLOSED' ? 'secondary' : 'success'}">${cycle.status}</span><br>
            <strong>Total Buildings:</strong> ${schemeStats.totalBuildings}<br>
            <strong>Total Units:</strong> ${schemeStats.totalUnits}<br>
            <strong>Total Unit Meters:</strong> ${schemeStats.totalUnitMeters}<br>
            <strong>Readings Captured:</strong> ${schemeStats.readingsCaptured}<br>
            <strong>Not Read:</strong> ${schemeStats.notRead}<br>
            <strong>Flagged Readings:</strong> ${schemeStats.flaggedReadings}
        </div>
        ${cycle.status === 'OPEN' ? '<p class="text-muted mt-2"><strong>Note:</strong> This cycle is still OPEN. Consider closing it before exporting final data.</p>' : ''}
    `;
}

function loadOutputLayoutPreview() {
    const layout = getVisibleExportLayout();
    const container = document.getElementById('layout-preview');

    if (!layout) {
        container.innerHTML = '<p class="text-muted">Select a cycle to prepare the output layout.</p>';
        return;
    }

    const fileRows = layout.outputFiles.map(file => `
        <tr>
            <td>${file.scope}</td>
            <td>${file.entityName}</td>
            <td><span class="text-muted">${file.relativePath}</span></td>
            <td>${file.readCount} / ${file.totalCount}</td>
            <td>${file.flaggedCount}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="info-box" style="margin-bottom: 1rem;">
            <strong>Layout version:</strong> ${layout.layoutVersion}<br>
            <strong>Output root:</strong> ${layout.outputRoot}<br>
            <strong>Prepared files:</strong> ${layout.outputFiles.length}
        </div>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scope</th>
                    <th>Report</th>
                    <th>Planned Path</th>
                    <th>Coverage</th>
                    <th>Flags</th>
                </tr>
            </thead>
            <tbody>${fileRows}</tbody>
        </table>
        <p class="text-muted mt-2">This manifest locks the per-scheme, per-building, and per-unit output structure before the reference workbook styling is applied.</p>
    `;
}

function loadPreviewTables() {
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('summary-preview-section').style.display = 'block';
    
    loadUnitReadingsPreview();
    loadSchemeSummaryPreview();
}

function loadUnitReadingsPreview() {
    const layout = getVisibleExportLayout();
    const rows = layout ? layout.units.flatMap(unit => unit.meters.map(meter => ({ unit, meter }))) : [];

    if (rows.length === 0) {
        document.getElementById('unit-readings-preview').innerHTML = '<p class="text-muted">No readings captured yet.</p>';
        return;
    }

    const previewRows = rows.slice(0, 50);
    
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
                    <th>Captured By</th>
                    <th>Flags</th>
                    <th>Review</th>
                </tr>
            </thead>
            <tbody>
                ${previewRows.map(({ unit, meter }) => {
                    const flags = meter.flags.length > 0
                        ? meter.flags.map(flag => flag.type).join(', ')
                        : '-';
                    
                    return `
                        <tr>
                            <td>${unit.buildingName}</td>
                            <td>${unit.unitNumber}</td>
                            <td>${meter.meterNumber}</td>
                            <td>${meter.previousReading}</td>
                            <td>${meter.currentReading ?? 'Not read'}</td>
                            <td>${meter.consumption != null ? Number(meter.consumption).toFixed(2) : 'N/A'}</td>
                            <td>${meter.capturedBy || 'Unknown'}${meter.contactDetails ? `<br><span class="text-muted">${meter.contactDetails}</span>` : ''}</td>
                            <td>${flags}</td>
                            <td><span class="badge ${meter.reviewStatus === 'approved' ? 'badge-success' : meter.reviewStatus === 'site-visit' ? 'badge-danger' : 'badge-secondary'}">${meter.reviewStatus}</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        <p class="text-muted mt-2">Showing first ${previewRows.length} of ${rows.length} unit-meter rows. Full data will be in the Excel and CSV exports.</p>
    `;
}

function loadSchemeSummaryPreview() {
    const layout = getVisibleExportLayout();
    if (!layout) {
        document.getElementById('scheme-summary-preview').innerHTML = '<p class="text-muted">No cycle selected.</p>';
        return;
    }
    const { schemeStats } = layout;
    
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
                    <td>${schemeStats.bulkKWh.toFixed(2)} kWh</td>
                </tr>
                <tr>
                    <td><strong>Sum of Unit Meters kWh</strong></td>
                    <td>${schemeStats.sumUnitsKWh.toFixed(2)} kWh</td>
                </tr>
                <tr>
                    <td><strong>Common Area kWh</strong></td>
                    <td>${schemeStats.commonKWh.toFixed(2)} kWh</td>
                </tr>
                <tr>
                    <td><strong>Losses %</strong></td>
                    <td>${schemeStats.lossesPercent.toFixed(2)}%</td>
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

window.exportBuildingReport = function(buildingId) {
    if (!currentFilters.cycleId || !buildingId) {
        alert('Please select a cycle and building first');
        return;
    }

    xlsxExport.exportBuildingReport(currentFilters.cycleId, buildingId);
};

window.exportUnitReport = function(unitId) {
    if (!currentFilters.cycleId || !unitId) {
        alert('Please select a cycle and unit first');
        return;
    }

    xlsxExport.exportUnitReport(currentFilters.cycleId, unitId);
};

window.exportOutputManifest = function() {
    if (!currentFilters.cycleId) {
        alert('Please select a cycle first');
        return;
    }

    xlsxExport.exportOutputManifest(currentFilters.cycleId, {
        meterType: currentFilters.meterType,
        unitId: currentFilters.unitId
    });
};

window.exportSingleMeterReport = function(meterId, cycleId) {
    if (!meterId || !cycleId) {
        alert('Invalid meter or cycle');
        return;
    }
    xlsxExport.exportMeterReport(meterId, cycleId);
};

window.exportAllBuildingReports = async function() {
    const layout = getVisibleExportLayout();
    if (!layout || layout.buildings.length === 0) {
        alert('No buildings to export');
        return;
    }

    const confirmExport = confirm(`Export ${layout.buildings.length} building reports?\n\nThis will download ${layout.buildings.length} Excel files.`);
    if (!confirmExport) {
        return;
    }

    for (let index = 0; index < layout.buildings.length; index++) {
        await xlsxExport.exportBuildingReport(currentFilters.cycleId, layout.buildings[index].buildingId);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    alert(`✅ Exported ${layout.buildings.length} building reports successfully!`);
};

window.exportAllUnitReports = async function() {
    const layout = getVisibleExportLayout();
    if (!layout || layout.units.length === 0) {
        alert('No units to export');
        return;
    }

    const confirmExport = confirm(`Export ${layout.units.length} unit reports?\n\nThis will download ${layout.units.length} Excel files.`);
    if (!confirmExport) {
        return;
    }

    for (let index = 0; index < layout.units.length; index++) {
        await xlsxExport.exportUnitReport(currentFilters.cycleId, layout.units[index].unitId);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    alert(`✅ Exported ${layout.units.length} unit reports successfully!`);
};
