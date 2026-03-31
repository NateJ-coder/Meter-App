/**
 * meters.js - Meter Register Page Logic
 */

import { storage } from './storage.js';
import { showNotification, confirmAction, parseDecimalInput } from './app.js';

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        // Load tab data
        loadTabData(tab);
    });
});

// Load initial tab
loadTabData('schemes');
renderDataSyncPanel();

function loadTabData(tab) {
    switch(tab) {
        case 'schemes':
            loadSchemes();
            break;
        case 'buildings':
            loadBuildings();
            break;
        case 'units':
            loadUnits();
            break;
        case 'meters':
            loadMeters();
            break;
    }
}

function renderDataSyncPanel(message = '') {
    const panel = document.getElementById('data-sync-panel');
    if (!panel) {
        return;
    }

    const schemes = storage.getSchemes().length;
    const buildings = storage.getBuildings().length;
    const units = storage.getUnits().length;
    const meters = storage.getMeters().length;
    const importedSchemes = storage.getSchemes().filter((scheme) => scheme.imported_from === 'utility_dash').length;
    const importedMeters = storage.getMeters().filter((meter) => meter.imported_from === 'utility_dash').length;

    panel.innerHTML = `
        <div class="info-box">
            <strong>Current cache</strong><br>
            Schemes: ${schemes} | Buildings: ${buildings} | Units: ${units} | Meters: ${meters}<br>
            <span class="text-muted">App data is mirrored locally for fast page loads and synced with Firebase when available. Utility Dash exports stay in source-documents as reference material and are not imported into app storage.</span>
            ${importedSchemes > 0 || importedMeters > 0 ? `
                <div class="mt-2">
                    <strong>Reference import residue detected</strong><br>
                    Schemes from Utility Dash: ${importedSchemes} | Meters from Utility Dash: ${importedMeters}<br>
                    <button class="btn btn-danger mt-2" type="button" onclick="purgeUtilityDashImports()">Remove Utility Dash From App Data</button>
                </div>
            ` : ''}
            ${message ? `<div class="mt-2">${message}</div>` : ''}
        </div>
    `;
}

window.refreshCloudMasterData = async function() {
    try {
        const counts = await storage.hydrateFromCloud({ clearMissing: false });
        loadTabData(document.querySelector('.tab-btn.active')?.dataset.tab || 'schemes');
        renderDataSyncPanel(`Refreshed from Firebase. Schemes: ${counts.schemes || 0}, Meters: ${counts.meters || 0}.`);
        showNotification('Master data refreshed from Firebase');
    } catch (error) {
        console.error(error);
        const isPermissionError = String(error?.message || '').toLowerCase().includes('firestore read denied');
        renderDataSyncPanel(
            isPermissionError
                ? 'Refresh failed because Firestore denied collection reads. Check the users/{uid} profile and deploy the Firestore rules that include cycle_schedules.'
                : 'Refresh failed. Check Firebase connectivity and permissions.'
        );
        showNotification(`Refresh failed: ${error.message}`);
    }
};

window.purgeUtilityDashImports = async function() {
    if (!confirmAction('Remove all Utility Dash-imported schemes, buildings, units, and meters from app storage and Firebase?')) {
        return;
    }

    try {
        await storage.replaceOperationalData({
            schemes: storage.getSchemes().filter((scheme) => scheme.imported_from !== 'utility_dash'),
            buildings: storage.getBuildings().filter((building) => building.imported_from !== 'utility_dash'),
            units: storage.getUnits().filter((unit) => unit.imported_from !== 'utility_dash'),
            meters: storage.getMeters().filter((meter) => meter.imported_from !== 'utility_dash'),
            cycles: storage.getAll('cycles'),
            readings: storage.getAll('readings'),
            cycle_schedules: storage.getAll('cycle_schedules')
        }, { pushToCloud: true });

        loadTabData(document.querySelector('.tab-btn.active')?.dataset.tab || 'schemes');
        renderDataSyncPanel('Utility Dash imported records were removed from app storage. Reference files in source-documents were left untouched.');
        showNotification('Utility Dash app data removed');
    } catch (error) {
        console.error(error);
        renderDataSyncPanel('Failed to remove Utility Dash imported records. Check Firebase permissions and retry.');
        showNotification(`Cleanup failed: ${error.message}`);
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
const schemeAddressPassState = {
    active: false
};

function getSchemesMissingAddresses() {
    return storage.getSchemes()
        .filter((scheme) => !String(scheme.address || '').trim())
        .sort((left, right) => left.name.localeCompare(right.name));
}

function setSchemeFormMode({ addressOnly = false } = {}) {
    const nameInput = document.getElementById('scheme-name');
    const title = document.getElementById('scheme-form-title');

    nameInput.readOnly = addressOnly;
    if (addressOnly) {
        title.textContent = 'Add Scheme Address';
        nameInput.title = 'Scheme name is preloaded from the Buildings folder list.';
    } else {
        nameInput.title = '';
    }
}

function loadSchemes() {
    const schemes = storage.getSchemes()
        .slice()
        .sort((left, right) => {
            const leftMissing = !String(left.address || '').trim();
            const rightMissing = !String(right.address || '').trim();

            if (leftMissing !== rightMissing) {
                return leftMissing ? -1 : 1;
            }

            return left.name.localeCompare(right.name);
        });
    const container = document.getElementById('schemes-list');
    const missingAddresses = getSchemesMissingAddresses();
    
    if (schemes.length === 0) {
        container.innerHTML = '<p class="text-muted">No schemes found. Add your first scheme.</p>';
        return;
    }
    
    container.innerHTML = `
        ${missingAddresses.length > 0 ? `
            <div class="info-box mb-2">
                <strong>${missingAddresses.length} scheme address${missingAddresses.length === 1 ? '' : 'es'} still need${missingAddresses.length === 1 ? 's' : ''} to be filled in.</strong><br>
                The scheme names are already preloaded. Complete the physical addresses now so manual onboarding can continue cleanly.
                <div class="mt-2">
                    <button class="btn btn-secondary" type="button" onclick="startSchemeAddressPass()">Fill Missing Addresses</button>
                </div>
            </div>
        ` : ''}
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme Name</th>
                    <th>Address</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${schemes.map(scheme => `
                    <tr>
                        <td><strong>${scheme.name}</strong></td>
                        <td>${scheme.address || 'N/A'}</td>
                        <td>
                            <button class="btn btn-secondary" onclick="editScheme('${scheme.id}')">Edit</button>
                            <button class="btn btn-danger" onclick="deleteScheme('${scheme.id}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.showSchemeForm = function() {
    schemeAddressPassState.active = false;
    document.getElementById('scheme-form').style.display = 'block';
    document.getElementById('scheme-form-title').textContent = 'Add Scheme';
    document.getElementById('scheme-form-element').reset();
    document.getElementById('scheme-id').value = '';
    setSchemeFormMode({ addressOnly: false });
};

window.cancelSchemeForm = function() {
    document.getElementById('scheme-form').style.display = 'none';
    document.getElementById('scheme-form-element').reset();
    setSchemeFormMode({ addressOnly: false });
    schemeAddressPassState.active = false;
};

window.editScheme = function(id, options = {}) {
    const scheme = storage.get('schemes', id);
    if (!scheme) {
        return;
    }

    const addressOnly = Boolean(options.addressOnly);
    schemeAddressPassState.active = addressOnly;
    document.getElementById('scheme-id').value = id;
    document.getElementById('scheme-name').value = scheme.name;
    document.getElementById('scheme-address').value = scheme.address || '';
    document.getElementById('scheme-form-title').textContent = addressOnly ? 'Add Scheme Address' : 'Edit Scheme';
    document.getElementById('scheme-form').style.display = 'block';
    setSchemeFormMode({ addressOnly });
    document.getElementById('scheme-address').focus();
};

window.startSchemeAddressPass = function() {
    const nextScheme = getSchemesMissingAddresses()[0];
    if (!nextScheme) {
        showNotification('All scheme addresses are already filled in.');
        return;
    }

    window.editScheme(nextScheme.id, { addressOnly: true });
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
    loadSchemes();
    showNotification('Scheme deleted successfully');
};

document.getElementById('scheme-form-element').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('scheme-id').value;
    const wasAddressPass = schemeAddressPassState.active;
    const data = {
        name: document.getElementById('scheme-name').value,
        address: document.getElementById('scheme-address').value
    };
    
    if (id) {
        storage.update('schemes', id, data);
        showNotification('Scheme updated successfully');
    } else {
        storage.create('schemes', data);
        showNotification('Scheme created successfully');
    }
    
    cancelSchemeForm();
    loadSchemes();

    if (wasAddressPass) {
        const remaining = getSchemesMissingAddresses();
        if (remaining.length > 0) {
            showNotification(`${remaining.length} scheme address${remaining.length === 1 ? '' : 'es'} still need to be completed.`);
            window.editScheme(remaining[0].id, { addressOnly: true });
            return;
        }

        showNotification('All preloaded scheme addresses are now complete.');
    }
});

// ========== BUILDINGS ==========
function loadBuildings() {
    const buildings = storage.getBuildings();
    const container = document.getElementById('buildings-list');
    
    if (buildings.length === 0) {
        container.innerHTML = '<p class="text-muted">No buildings found. Add your first building.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Scheme</th>
                    <th>Building Name</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${buildings.map(building => {
                    const scheme = storage.get('schemes', building.scheme_id);
                    return `
                        <tr>
                            <td>${scheme ? scheme.name : 'Unknown'}</td>
                            <td><strong>${building.name}</strong></td>
                            <td>
                                <button class="btn btn-secondary" onclick="editBuilding('${building.id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteBuilding('${building.id}')">Delete</button>
                            </td>
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
    loadBuildings();
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
    loadBuildings();
});

// ========== UNITS ==========
function loadUnits() {
    const units = storage.getUnits();
    const container = document.getElementById('units-list');
    
    if (units.length === 0) {
        container.innerHTML = '<p class="text-muted">No units found. Add your first unit.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Building</th>
                    <th>Unit Number</th>
                    <th>Owner</th>
                    <th>Actions</th>
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
                                <button class="btn btn-secondary" onclick="editUnit('${unit.id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteUnit('${unit.id}')">Delete</button>
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
    loadUnits();
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
    loadUnits();
});

// ========== METERS ==========
function loadMeters() {
    const meters = storage.getMeters();
    const container = document.getElementById('meters-list');
    
    if (meters.length === 0) {
        container.innerHTML = '<p class="text-muted">No meters found. Add your first meter.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Meter Number</th>
                    <th>Unit</th>
                    <th>Last Reading</th>
                    <th>Last Reading Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${meters.map(meter => {
                    const meterDetails = storage.getMeterWithDetails(meter.id);
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
                            <td><span class="badge badge-${badgeClass}">${meter.meter_type}</span></td>
                            <td><strong>${meter.meter_number}</strong></td>
                            <td>${location}</td>
                            <td>${meter.last_reading || 0} kWh</td>
                            <td>${meter.last_reading_date || 'N/A'}</td>
                            <td><span class="badge badge-secondary">${meter.status}</span></td>
                            <td>
                                <button class="btn btn-primary" onclick="viewMeterHistory('${meter.id}')">History</button>
                                <button class="btn btn-secondary" onclick="editMeter('${meter.id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteMeter('${meter.id}')">Delete</button>
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
    loadMeters();
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
