/**
 * meters.js - Meters Index Page Logic
 */

import { storage } from './storage.js';
import { showNotification, confirmAction, parseDecimalInput } from './app.js';

const meterRegisterAdminMode = new URLSearchParams(window.location.search).get('mode') === 'admin';

initializeMeterRegisterMode();
loadMeterIndexPage();
renderDataSyncPanel();

function initializeMeterRegisterMode() {
    document.querySelectorAll('[data-admin-only]').forEach((element) => {
        if (!meterRegisterAdminMode) {
            element.style.display = 'none';
        }
    });

    const note = document.getElementById('meter-register-mode-note');
    if (note) {
        note.innerHTML = meterRegisterAdminMode
            ? '<div class="info-box"><strong>Developer mode</strong><br>Inventory editing is enabled on this page because it was opened in developer mode.</div>'
            : '<div class="info-box"><strong>Read-only index</strong><br>Inventory editing has been removed from the main app. This page is now a live index of the registered schemes, buildings, units, and meters. Developer-only inventory changes should be started from the Developer Console.</div>';
    }

    populateInventorySchemeOptions();
}

function renderDataSyncPanel(message = '') {
    const panel = document.getElementById('data-sync-panel');
    if (!panel) return;

    const schemes = storage.getAll('schemes').length;
    const buildings = storage.getAll('buildings').length;
    const units = storage.getAll('units').length;
    const meters = storage.getAll('meters').length;

    const syncMessage = storage.cloudSyncEnabled
        ? 'Cloud sync is active. This page hydrates from Firebase when the local cache is empty or incomplete.'
        : 'App data is stored locally in the browser. Firebase sync is not active in this runtime.';
    const modeMessage = meterRegisterAdminMode
        ? 'Developer inventory editing is enabled for this session.'
        : 'This page is read-only and shows the current registered inventory. Use the Developer Console if inventory changes are needed in future.';

    panel.innerHTML = `
        <div class="info-box">
            <strong>Current cache</strong><br>
            Schemes: ${schemes} | Buildings: ${buildings} | Units: ${units} | Meters: ${meters}<br>
            <span class="text-muted">${syncMessage}</span>
            <br><span class="text-muted">${modeMessage}</span>
            ${storage.cloudSyncEnabled ? '<div class="mt-2"><button class="btn btn-secondary" onclick="refreshMeterRegisterCache()">Refresh From Firebase</button></div>' : ''}
            ${message ? `<div class="mt-2">${message}</div>` : ''}
        </div>
    `;
}

function normalizeSearchValue(value) {
    return String(value || '').trim().toLowerCase();
}

function populateInventorySchemeOptions() {
    const select = document.getElementById('inventory-filter-scheme');
    if (!select) {
        return;
    }

    const previousValue = select.value;
    const schemes = storage.getSchemes()
        .slice()
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));

    select.innerHTML = '<option value="">All Schemes</option>' +
        schemes.map((scheme) => `<option value="${scheme.id}">${scheme.name}</option>`).join('');

    if (schemes.some((scheme) => scheme.id === previousValue)) {
        select.value = previousValue;
    }
}

function getInventoryFilters() {
    return {
        schemeId: document.getElementById('inventory-filter-scheme')?.value || '',
        unitSearch: normalizeSearchValue(document.getElementById('inventory-filter-unit')?.value || ''),
        meterType: (document.getElementById('inventory-filter-meter-type')?.value || '').toUpperCase()
    };
}

function buildInventoryViewModel() {
    const filters = getInventoryFilters();
    const units = storage.getUnits();
    const buildings = storage.getBuildings();
    const schemes = storage.getSchemes();
    const meters = storage.getMeters();

    const filteredUnits = units.filter((unit) => {
        const building = storage.get('buildings', unit.building_id);
        const scheme = building ? storage.get('schemes', building.scheme_id) : null;
        const unitSearchText = normalizeSearchValue(`${unit.unit_number} ${unit.owner_name || ''} ${building?.name || ''} ${scheme?.name || ''}`);

        if (filters.schemeId && building?.scheme_id !== filters.schemeId) {
            return false;
        }

        if (filters.unitSearch && !unitSearchText.includes(filters.unitSearch)) {
            return false;
        }

        return true;
    });

    const filteredBuildings = buildings.filter((building) => {
        if (filters.schemeId && building.scheme_id !== filters.schemeId) {
            return false;
        }

        if (filters.unitSearch) {
            return filteredUnits.some((unit) => unit.building_id === building.id);
        }

        return true;
    });

    const filteredSchemes = schemes.filter((scheme) => {
        if (filters.schemeId && scheme.id !== filters.schemeId) {
            return false;
        }

        if (filters.unitSearch) {
            return filteredBuildings.some((building) => building.scheme_id === scheme.id);
        }

        return true;
    });

    const filteredMeters = meters.filter((meter) => {
        const unit = meter.unit_id ? storage.get('units', meter.unit_id) : null;
        const building = unit?.building_id ? storage.get('buildings', unit.building_id) : null;
        const scheme = storage.get('schemes', meter.scheme_id);
        const searchText = normalizeSearchValue(`${meter.meter_number} ${unit?.unit_number || ''} ${building?.name || ''} ${scheme?.name || ''}`);
        const meterType = String(meter.meter_type || '').toUpperCase();

        if (filters.schemeId && meter.scheme_id !== filters.schemeId) {
            return false;
        }

        if (filters.meterType && meterType !== filters.meterType) {
            return false;
        }

        if (filters.unitSearch && !searchText.includes(filters.unitSearch)) {
            return false;
        }

        return true;
    });

    return {
        schemes: filteredSchemes,
        buildings: filteredBuildings,
        units: filteredUnits,
        meters: filteredMeters
    };
}

function loadMeterIndexPage() {
    populateInventorySchemeOptions();
    const viewModel = buildInventoryViewModel();
    loadSchemes(viewModel);
    loadBuildings(viewModel);
    loadUnits(viewModel);
    loadMeters(viewModel);
}

window.filterInventory = function() {
    loadMeterIndexPage();
};

window.clearInventoryFilters = function() {
    const schemeSelect = document.getElementById('inventory-filter-scheme');
    const unitSearchInput = document.getElementById('inventory-filter-unit');
    const meterTypeSelect = document.getElementById('inventory-filter-meter-type');

    if (schemeSelect) {
        schemeSelect.value = '';
    }

    if (unitSearchInput) {
        unitSearchInput.value = '';
    }

    if (meterTypeSelect) {
        meterTypeSelect.value = '';
    }

    loadMeterIndexPage();
};

window.refreshMeterRegisterCache = async function() {
    try {
        await storage.hydrateFromCloud();
        renderDataSyncPanel('<span class="text-success">App data refreshed from Firebase.</span>');
        loadMeterIndexPage();
    } catch (error) {
        console.error(error);
        renderDataSyncPanel('<span class="text-danger">Unable to refresh app data from Firebase.</span>');
    }
};

window.closeMeterHistoryModal = function() {
    const root = document.getElementById('meter-history-modal-root');
    if (root) {
        root.innerHTML = '';
    }
};

function getCycleHistoryLabel(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    if (!cycle) {
        return 'Ad hoc reading';
    }

    return cycle.name || `${cycle.start_date || 'Unknown start'} to ${cycle.end_date || 'Unknown end'}`;
}

function getReadingHistoryForMeter(meterId) {
    return storage.getAll('readings')
        .filter((reading) => reading.meter_id === meterId)
        .sort((readingA, readingB) => {
            const timestampA = new Date(
                readingA.reading_date || readingA.updated_at || readingA.created_at || 0
            ).getTime();
            const timestampB = new Date(
                readingB.reading_date || readingB.updated_at || readingB.created_at || 0
            ).getTime();

            return timestampB - timestampA;
        });
}

window.viewMeterHistory = async function(meterId) {
    const root = document.getElementById('meter-history-modal-root');
    const meter = storage.get('meters', meterId);
    if (!root || !meter) {
        return;
    }

    root.innerHTML = `
        <div class="modal-overlay" onclick="closeMeterHistoryModal()">
            <div class="modal-content reading-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>Meter History</h2>
                    <button class="close-btn" onclick="closeMeterHistoryModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="text-muted">Loading captured app readings for ${meter.meter_number}...</p>
                </div>
            </div>
        </div>
    `;

    try {
        const history = getReadingHistoryForMeter(meterId);
        const rows = history.slice(0, 24);

        root.innerHTML = `
            <div class="modal-overlay" onclick="closeMeterHistoryModal()">
                <div class="modal-content reading-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${meter.meter_number}</h2>
                        <button class="close-btn" onclick="closeMeterHistoryModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="info-box">
                            <strong>Meter</strong>: ${meter.meter_number}<br>
                            <strong>Last reading</strong>: ${meter.last_reading || 0} kWh<br>
                            <strong>Captured readings</strong>: ${history.length}
                        </div>
                        ${rows.length === 0 ? '<p class="text-muted mt-2">No app readings have been captured for this meter yet.</p>' : `
                            <table class="data-table mt-2">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Cycle</th>
                                        <th>Reading</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows.map((entry) => `
                                        <tr>
                                            <td>${entry.reading_date || entry.updated_at || entry.created_at || 'N/A'}</td>
                                            <td>${getCycleHistoryLabel(entry.cycle_id)}</td>
                                            <td>${entry.reading_value ?? 'N/A'}</td>
                                            <td>${entry.review_status || 'pending'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                            <p class="text-muted mt-2">Showing the latest ${rows.length} captured readings stored by this app.</p>
                        `}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error(error);
        root.innerHTML = `
            <div class="modal-overlay" onclick="closeMeterHistoryModal()">
                <div class="modal-content reading-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Meter History</h2>
                        <button class="close-btn" onclick="closeMeterHistoryModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="text-muted">Unable to load meter history from app records.</p>
                    </div>
                </div>
            </div>
        `;
    }
};

// ========== SCHEMES ==========
function loadSchemes(viewModel = buildInventoryViewModel()) {
    const schemes = viewModel.schemes
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name));
    const container = document.getElementById('schemes-list');
    
    if (schemes.length === 0) {
        container.innerHTML = '<p class="text-muted">No schemes match the current filters.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme Name</th>
                    ${meterRegisterAdminMode ? '<th>Actions</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${schemes.map(scheme => `
                    <tr>
                        <td><strong>${scheme.name}</strong></td>
                        ${meterRegisterAdminMode ? `
                        <td>
                            <button class="btn btn-secondary" onclick="editScheme('${scheme.id}')">Edit</button>
                            <button class="btn btn-danger" onclick="deleteScheme('${scheme.id}')">Delete</button>
                        </td>
                        ` : ''}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.showSchemeForm = function() {
    document.getElementById('scheme-form').style.display = 'block';
    document.getElementById('scheme-form-title').textContent = 'Add Scheme';
    document.getElementById('scheme-form-element').reset();
    document.getElementById('scheme-id').value = '';
};

window.cancelSchemeForm = function() {
    document.getElementById('scheme-form').style.display = 'none';
    document.getElementById('scheme-form-element').reset();
};

window.editScheme = function(id) {
    const scheme = storage.get('schemes', id);
    if (!scheme) {
        return;
    }
    document.getElementById('scheme-id').value = id;
    document.getElementById('scheme-name').value = scheme.name;
    document.getElementById('scheme-form-title').textContent = 'Edit Scheme';
    document.getElementById('scheme-form').style.display = 'block';
};

window.deleteScheme = function(id) {
    if (!confirmAction('Delete this scheme? This will also delete all related buildings, units, and meters.')) {
        return;
    }
    
    // Cascade delete: meters -> units -> buildings -> scheme
    const meters = storage.getMeters(id);
    meters.forEach(meter => storage.delete('meters', meter.id));
    
    const buildings = storage.getBuildings(id);
    buildings.forEach(building => {
        const units = storage.getUnits(building.id);
        units.forEach(unit => storage.delete('units', unit.id));
        storage.delete('buildings', building.id);
    });
    
    storage.delete('schemes', id);
    loadMeterIndexPage();
    showNotification('Scheme deleted successfully');
};

document.getElementById('scheme-form-element').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('scheme-id').value;
    const data = {
        name: document.getElementById('scheme-name').value
    };
    
    if (id) {
        storage.update('schemes', id, data);
        showNotification('Scheme updated successfully');
    } else {
        storage.create('schemes', data);
        showNotification('Scheme created successfully');
    }
    
    cancelSchemeForm();
    loadMeterIndexPage();
});

// ========== BUILDINGS ==========
function loadBuildings(viewModel = buildInventoryViewModel()) {
    const buildings = viewModel.buildings
        .slice()
        .sort((left, right) => {
            const schemeNameLeft = storage.get('schemes', left.scheme_id)?.name || '';
            const schemeNameRight = storage.get('schemes', right.scheme_id)?.name || '';
            return `${schemeNameLeft} ${left.name}`.localeCompare(`${schemeNameRight} ${right.name}`);
        });
    const container = document.getElementById('buildings-list');
    
    if (buildings.length === 0) {
        container.innerHTML = '<p class="text-muted">No buildings match the current filters.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme</th>
                    <th>Building Name</th>
                    ${meterRegisterAdminMode ? '<th>Actions</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${buildings.map(building => {
                    const scheme = storage.get('schemes', building.scheme_id);
                    return `
                        <tr>
                            <td>${scheme ? scheme.name : 'Unknown'}</td>
                            <td><strong>${building.name}</strong></td>
                            ${meterRegisterAdminMode ? `
                            <td>
                                <button class="btn btn-secondary" onclick="editBuilding('${building.id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteBuilding('${building.id}')">Delete</button>
                            </td>
                            ` : ''}
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

window.showBuildingForm = function() {
    document.getElementById('building-form').style.display = 'block';
    document.getElementById('building-form-title').textContent = 'Add Building';
    document.getElementById('building-form-element').reset();
    document.getElementById('building-id').value = '';
    populateSchemeSelect('building-scheme');
};

window.cancelBuildingForm = function() {
    document.getElementById('building-form').style.display = 'none';
};

window.editBuilding = function(id) {
    const building = storage.get('buildings', id);
    document.getElementById('building-id').value = id;
    populateSchemeSelect('building-scheme');
    document.getElementById('building-scheme').value = building.scheme_id;
    document.getElementById('building-name').value = building.name;
    document.getElementById('building-form-title').textContent = 'Edit Building';
    document.getElementById('building-form').style.display = 'block';
};

window.deleteBuilding = function(id) {
    if (!confirmAction('Delete this building? This will also delete all units and meters in this building.')) return;
    
    // Cascade delete: meters in units -> units -> building
    const units = storage.getUnits(id);
    units.forEach(unit => {
        const meters = storage.getAll('meters').filter(m => m.unit_id === unit.id);
        meters.forEach(meter => storage.delete('meters', meter.id));
        storage.delete('units', unit.id);
    });
    
    storage.delete('buildings', id);
    loadMeterIndexPage();
    showNotification('Building deleted');
};

document.getElementById('building-form-element').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('building-id').value;
    const data = {
        scheme_id: document.getElementById('building-scheme').value,
        name: document.getElementById('building-name').value
    };
    
    if (id) {
        storage.update('buildings', id, data);
        showNotification('Building updated');
    } else {
        storage.create('buildings', data);
        showNotification('Building created');
    }
    
    cancelBuildingForm();
    loadMeterIndexPage();
});

// ========== UNITS ==========
function loadUnits(viewModel = buildInventoryViewModel()) {
    const units = viewModel.units
        .slice()
        .sort((left, right) => {
            const buildingNameLeft = storage.get('buildings', left.building_id)?.name || '';
            const buildingNameRight = storage.get('buildings', right.building_id)?.name || '';
            return `${buildingNameLeft} ${left.unit_number}`.localeCompare(`${buildingNameRight} ${right.unit_number}`, undefined, { numeric: true, sensitivity: 'base' });
        });
    const container = document.getElementById('units-list');
    
    if (units.length === 0) {
        container.innerHTML = '<p class="text-muted">No units match the current filters.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Building</th>
                    <th>Unit Number</th>
                    <th>Owner</th>
                    <th>${meterRegisterAdminMode ? 'Actions' : 'Tools'}</th>
                </tr>
            </thead>
            <tbody>
                ${units.map(unit => {
                    const building = storage.get('buildings', unit.building_id);
                    return `
                        <tr>
                            <td>${building ? building.name : 'Unknown'}</td>
                            <td><strong>${unit.unit_number}</strong></td>
                            <td>${unit.owner_name || 'N/A'}</td>
                            <td>
                                ${meterRegisterAdminMode ? `<button class="btn btn-secondary" onclick="editUnit('${unit.id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteUnit('${unit.id}')">Delete</button>` : ''}
                                <button class="btn btn-primary" onclick="window.location.href='dispute.html?unit_id=${unit.id}'">📋 Dispute Pack</button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

window.showUnitForm = function() {
    document.getElementById('unit-form').style.display = 'block';
    document.getElementById('unit-form-title').textContent = 'Add Unit';
    document.getElementById('unit-form-element').reset();
    document.getElementById('unit-id').value = '';
    populateBuildingSelect('unit-building');
};

window.cancelUnitForm = function() {
    document.getElementById('unit-form').style.display = 'none';
};

window.editUnit = function(id) {
    const unit = storage.get('units', id);
    document.getElementById('unit-id').value = id;
    populateBuildingSelect('unit-building');
    document.getElementById('unit-building').value = unit.building_id;
    document.getElementById('unit-number').value = unit.unit_number;
    document.getElementById('unit-owner').value = unit.owner_name || '';
    document.getElementById('unit-form-title').textContent = 'Edit Unit';
    document.getElementById('unit-form').style.display = 'block';
};

window.deleteUnit = function(id) {
    if (!confirmAction('Delete this unit? This will also delete associated meters.')) return;
    
    // Cascade delete: meters -> unit
    const meters = storage.getAll('meters').filter(m => m.unit_id === id);
    meters.forEach(meter => storage.delete('meters', meter.id));
    
    storage.delete('units', id);
    loadMeterIndexPage();
    showNotification('Unit deleted');
};

document.getElementById('unit-form-element').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('unit-id').value;
    const data = {
        building_id: document.getElementById('unit-building').value,
        unit_number: document.getElementById('unit-number').value,
        owner_name: document.getElementById('unit-owner').value
    };
    
    if (id) {
        storage.update('units', id, data);
        showNotification('Unit updated');
    } else {
        storage.create('units', data);
        showNotification('Unit created');
    }
    
    cancelUnitForm();
    loadMeterIndexPage();
});

// ========== METERS ==========
function loadMeters(viewModel = buildInventoryViewModel()) {
    const meters = viewModel.meters
        .slice()
        .sort((left, right) => {
            const leftDetails = storage.getMeterWithDetails(left.id);
            const rightDetails = storage.getMeterWithDetails(right.id);
            const leftUnit = left.unit_id ? storage.get('units', left.unit_id) : null;
            const rightUnit = right.unit_id ? storage.get('units', right.unit_id) : null;
            const leftBuilding = leftUnit?.building_id ? storage.get('buildings', leftUnit.building_id) : null;
            const rightBuilding = rightUnit?.building_id ? storage.get('buildings', rightUnit.building_id) : null;
            const leftKey = `${leftBuilding?.name || ''} ${leftDetails?.unit_name || ''} ${left.meter_number || ''}`;
            const rightKey = `${rightBuilding?.name || ''} ${rightDetails?.unit_name || ''} ${right.meter_number || ''}`;
            return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: 'base' });
        });
    const container = document.getElementById('meters-list');
    
    if (meters.length === 0) {
        container.innerHTML = '<p class="text-muted">No meters match the current filters.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme</th>
                    <th>Building</th>
                    <th>Type</th>
                    <th>Meter Number</th>
                    <th>Unit</th>
                    <th>Last Reading</th>
                    <th>Last Reading Date</th>
                    <th>Status</th>
                    <th>${meterRegisterAdminMode ? 'Actions' : 'Tools'}</th>
                </tr>
            </thead>
            <tbody>
                ${meters.map(meter => {
                    const meterDetails = storage.getMeterWithDetails(meter.id);
                    const scheme = storage.get('schemes', meter.scheme_id);
                    const unit = meter.unit_id ? storage.get('units', meter.unit_id) : null;
                    const building = unit?.building_id ? storage.get('buildings', unit.building_id) : null;
                    const badgeClass = meter.meter_type === 'BULK'
                        ? 'danger'
                        : meter.meter_type === 'COMMON'
                            ? 'warning'
                            : 'success';
                    const location = meter.meter_type === 'BULK'
                        ? 'BULK SUPPLY'
                        : meter.meter_type === 'COMMON'
                            ? 'COMMON PROPERTY'
                            : (meterDetails.unit_name || 'N/A');
                    return `
                        <tr>
                            <td>${scheme?.name || 'Unknown'}</td>
                            <td>${building?.name || (meter.meter_type === 'UNIT' ? 'N/A' : 'Scheme-level')}</td>
                            <td><span class="badge badge-${badgeClass}">${meter.meter_type}</span></td>
                            <td><strong>${meter.meter_number}</strong></td>
                            <td>${location}</td>
                            <td>${meter.last_reading || 0} kWh</td>
                            <td>${meter.last_reading_date || 'N/A'}</td>
                            <td><span class="badge badge-secondary">${meter.status}</span></td>
                            <td>
                                <button class="btn btn-primary" onclick="viewMeterHistory('${meter.id}')">History</button>
                                ${meterRegisterAdminMode ? `
                                <button class="btn btn-secondary" onclick="editMeter('${meter.id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteMeter('${meter.id}')">Delete</button>
                                ` : ''}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

window.showMeterForm = function() {
    document.getElementById('meter-form').style.display = 'block';
    document.getElementById('meter-form-title').textContent = 'Add Meter';
    document.getElementById('meter-form-element').reset();
    document.getElementById('meter-id').value = '';
    populateSchemeSelect('meter-scheme');
    toggleUnitField();
};

window.cancelMeterForm = function() {
    document.getElementById('meter-form').style.display = 'none';
};

window.toggleUnitField = function() {
    const meterType = document.getElementById('meter-type').value;
    const unitGroup = document.getElementById('meter-unit-group');
    const unitSelect = document.getElementById('meter-unit');
    
    if (meterType === 'UNIT') {
        unitGroup.style.display = 'block';
        unitSelect.required = true;
    } else {
        unitGroup.style.display = 'none';
        unitSelect.required = false;
    }
};

window.updateMeterUnitOptions = function() {
    const schemeId = document.getElementById('meter-scheme').value;
    if (!schemeId) return;
    
    const buildings = storage.getBuildings(schemeId);
    const units = [];
    buildings.forEach(building => {
        const buildingUnits = storage.getUnits(building.id);
        buildingUnits.forEach(unit => {
            units.push({ ...unit, building_name: building.name });
        });
    });
    
    const unitSelect = document.getElementById('meter-unit');
    unitSelect.innerHTML = '<option value="">-- Select Unit --</option>' +
        units.map(unit => `<option value="${unit.id}">${unit.building_name} - ${unit.unit_number}</option>`).join('');
};

window.editMeter = function(id) {
    const meter = storage.get('meters', id);
    document.getElementById('meter-id').value = id;
    populateSchemeSelect('meter-scheme');
    document.getElementById('meter-scheme').value = meter.scheme_id;
    document.getElementById('meter-type').value = meter.meter_type;
    updateMeterUnitOptions();
    if (meter.unit_id) {
        document.getElementById('meter-unit').value = meter.unit_id;
    }
    document.getElementById('meter-number').value = meter.meter_number;
    document.getElementById('meter-last-reading').value = meter.last_reading || 0;
    document.getElementById('meter-status').value = meter.status;
    toggleUnitField();
    document.getElementById('meter-form-title').textContent = 'Edit Meter';
    document.getElementById('meter-form').style.display = 'block';
};

window.deleteMeter = function(id) {
    if (!confirmAction('Delete this meter?')) return;
    storage.delete('meters', id);
    loadMeters();
    showNotification('Meter deleted');
};

document.getElementById('meter-form-element').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('meter-id').value;
    const meterType = document.getElementById('meter-type').value;
    const lastReadingInput = document.getElementById('meter-last-reading');
    const lastReading = lastReadingInput.value.trim() === '' ? 0 : parseDecimalInput(lastReadingInput.value);

    if (Number.isNaN(lastReading)) {
        showNotification('Please enter a valid last reading. Decimals like 1450.5 or 1450,5 are accepted.');
        lastReadingInput.focus();
        return;
    }
    
    const data = {
        scheme_id: document.getElementById('meter-scheme').value,
        meter_type: meterType,
        meter_number: document.getElementById('meter-number').value,
        last_reading: lastReading,
        status: document.getElementById('meter-status').value,
        unit_id: null
    };
    
    if (meterType === 'UNIT') {
        data.unit_id = document.getElementById('meter-unit').value;
    }
    
    if (id) {
        storage.update('meters', id, data);
        showNotification('Meter updated');
    } else {
        storage.create('meters', data);
        showNotification('Meter created');
    }
    
    cancelMeterForm();
    loadMeterIndexPage();
});

// Helper functions
function populateSchemeSelect(selectId) {
    const schemes = storage.getSchemes();
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- Select Scheme --</option>' +
        schemes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function populateBuildingSelect(selectId) {
    const buildings = storage.getBuildings();
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- Select Building --</option>' +
        buildings.map(b => {
            const scheme = storage.get('schemes', b.scheme_id);
            return `<option value="${b.id}">${scheme ? scheme.name : ''} - ${b.name}</option>`;
        }).join('');
}
