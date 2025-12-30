/**
 * meters.js - Meter Register Page Logic
 */

import { storage } from './storage.js';
import { showNotification, confirmAction } from './app.js';

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

// ========== SCHEMES ==========
function loadSchemes() {
    const schemes = storage.getSchemes();
    const container = document.getElementById('schemes-list');
    
    if (schemes.length === 0) {
        container.innerHTML = '<p class="text-muted">No schemes found. Add your first scheme.</p>';
        return;
    }
    
    container.innerHTML = `
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
    document.getElementById('scheme-id').value = id;
    document.getElementById('scheme-name').value = scheme.name;
    document.getElementById('scheme-address').value = scheme.address || '';
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
    loadSchemes();
    showNotification('Scheme deleted successfully');
};

document.getElementById('scheme-form-element').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('scheme-id').value;
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
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${meters.map(meter => {
                    const meterDetails = storage.getMeterWithDetails(meter.id);
                    const location = meter.meter_type === 'BULK' ? 'BULK SUPPLY' : 
                                   (meterDetails.unit_name || 'N/A');
                    return `
                        <tr>
                            <td><span class="badge badge-${meter.meter_type === 'BULK' ? 'danger' : 'success'}">${meter.meter_type}</span></td>
                            <td><strong>${meter.meter_number}</strong></td>
                            <td>${location}</td>
                            <td>${meter.last_reading || 0} kWh</td>
                            <td><span class="badge badge-secondary">${meter.status}</span></td>
                            <td>
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
    
    const data = {
        scheme_id: document.getElementById('meter-scheme').value,
        meter_type: meterType,
        meter_number: document.getElementById('meter-number').value,
        last_reading: parseFloat(document.getElementById('meter-last-reading').value) || 0,
        status: document.getElementById('meter-status').value
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
