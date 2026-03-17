/**
 * reading-cycle.js - Reading Cycle Page Logic
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { preparePhotoForStorage } from './photo-utils.js';
import { showNotification, confirmAction, getCurrentDateTime, parseDecimalInput } from './app.js';

const cyclePageState = {
    selectedCycleId: null,
    activeTabId: 'cycle-control-tab'
};

initializePage();

function initializePage() {
    setDefaultDates();
    populateSchemeSelect('cycle-scheme');
    populateSchemeSelect('schedule-scheme');

    document.getElementById('cycle-form').addEventListener('submit', handleCycleSubmit);
    document.getElementById('schedule-form').addEventListener('submit', handleScheduleSubmit);

    loadCyclePage();
}

function setDefaultDates() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const firstDayValue = formatDateForInput(firstDay);
    const lastDayValue = formatDateForInput(lastDay);

    document.getElementById('cycle-start-date').value = firstDayValue;
    document.getElementById('cycle-end-date').value = lastDayValue;
    document.getElementById('schedule-start-date').value = firstDayValue;
    document.getElementById('schedule-end-date').value = lastDayValue;
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
    return formatDateForInput(new Date());
}

function getOpenCycles() {
    return storage.getAll('cycles')
        .filter(cycle => cycle.status === 'OPEN')
        .sort((cycleA, cycleB) => {
            const schemeA = storage.get('schemes', cycleA.scheme_id)?.name || '';
            const schemeB = storage.get('schemes', cycleB.scheme_id)?.name || '';

            if (schemeA !== schemeB) {
                return schemeA.localeCompare(schemeB);
            }

            return String(cycleA.start_date).localeCompare(String(cycleB.start_date));
        });
}

function getSchedules() {
    return storage.getAll('cycle_schedules')
        .sort((scheduleA, scheduleB) => String(scheduleA.start_date).localeCompare(String(scheduleB.start_date)));
}

function handleCycleSubmit(event) {
    event.preventDefault();

    const schemeId = document.getElementById('cycle-scheme').value;
    const startDate = document.getElementById('cycle-start-date').value;
    const endDate = document.getElementById('cycle-end-date').value;

    if (endDate < startDate) {
        showNotification('The end date cannot be earlier than the start date.');
        return;
    }

    const existingCycle = storage.getOpenCycle(schemeId);
    if (existingCycle) {
        showNotification('This scheme already has an open cycle. Close it first or select another scheme.');
        return;
    }

    const cycle = storage.create('cycles', {
        scheme_id: schemeId,
        start_date: startDate,
        end_date: endDate,
        status: 'OPEN',
        opened_via: 'manual'
    });

    cyclePageState.selectedCycleId = cycle.id;
    showNotification('Reading cycle opened successfully.');
    loadCyclePage();
}

function handleScheduleSubmit(event) {
    event.preventDefault();

    const scheduleData = {
        scheme_id: document.getElementById('schedule-scheme').value,
        name: document.getElementById('schedule-name').value.trim(),
        start_date: document.getElementById('schedule-start-date').value,
        end_date: document.getElementById('schedule-end-date').value,
        enabled: document.getElementById('schedule-enabled').checked
    };

    if (scheduleData.end_date < scheduleData.start_date) {
        showNotification('The auto-close date cannot be earlier than the auto-open date.');
        return;
    }

    storage.create('cycle_schedules', scheduleData);
    document.getElementById('schedule-form').reset();
    document.getElementById('schedule-enabled').checked = true;
    setDefaultDates();

    applyScheduledCycles();
    showNotification('Reading cycle schedule saved.');
    loadCyclePage();
}

function applyScheduledCycles() {
    const today = getTodayDateKey();
    const schedules = getSchedules();

    schedules.forEach(schedule => {
        if (!schedule.enabled) {
            return;
        }

        const existingCyclesForSchedule = storage.getCycles(schedule.scheme_id)
            .filter(cycle => cycle.schedule_id === schedule.id);
        const openCyclesForSchedule = storage.getCycles(schedule.scheme_id)
            .filter(cycle => cycle.status === 'OPEN' && cycle.schedule_id === schedule.id);

        if (today > schedule.end_date) {
            openCyclesForSchedule.forEach(cycle => {
                storage.update('cycles', cycle.id, {
                    status: 'CLOSED',
                    closed_at: new Date().toISOString(),
                    closed_via: 'schedule'
                });
            });
            return;
        }

        if (today < schedule.start_date || today > schedule.end_date) {
            return;
        }

        if (existingCyclesForSchedule.length > 0) {
            return;
        }

        if (storage.getOpenCycle(schedule.scheme_id)) {
            return;
        }

        storage.create('cycles', {
            scheme_id: schedule.scheme_id,
            start_date: schedule.start_date,
            end_date: schedule.end_date,
            status: 'OPEN',
            schedule_id: schedule.id,
            opened_via: 'schedule'
        });
    });
}

function loadCyclePage() {
    applyScheduledCycles();
    renderOpenCycles();
    renderSchedules();
}

function renderOpenCycles() {
    const openCycles = getOpenCycles();
    const cycleStatus = document.getElementById('cycle-status');

    if (!openCycles.some(cycle => cycle.id === cyclePageState.selectedCycleId)) {
        cyclePageState.selectedCycleId = openCycles[0]?.id || null;
    }

    if (openCycles.length === 0) {
        cycleStatus.innerHTML = `
            <div class="cycle-status closed">
                <div class="status-badge">NO OPEN CYCLE</div>
                <p class="text-muted">Open a manual cycle or create a schedule to start capturing readings.</p>
            </div>
        `;
        document.getElementById('capture-section').style.display = 'none';
        document.getElementById('active-cycle-summary').innerHTML = '';
        document.getElementById('readings-list').innerHTML = '';
        document.getElementById('active-cycle-select').innerHTML = '';
        populateBuildingFilter(null);
        return;
    }

    cycleStatus.innerHTML = `
        <div class="cycle-list">
            ${openCycles.map(cycle => {
                const scheme = storage.get('schemes', cycle.scheme_id);
                const isSelected = cycle.id === cyclePageState.selectedCycleId;
                const sourceBadge = cycle.opened_via === 'schedule'
                    ? '<span class="badge badge-secondary">Scheduled</span>'
                    : '<span class="badge badge-success">Manual</span>';

                return `
                    <div class="cycle-list-item ${isSelected ? 'selected' : ''}">
                        <div>
                            <div class="cycle-list-title">
                                <strong>${scheme?.name || 'Unknown Scheme'}</strong>
                                <span class="status-badge-inline">OPEN</span>
                                ${sourceBadge}
                            </div>
                            <div class="text-muted">${cycle.start_date} to ${cycle.end_date}</div>
                        </div>
                        <div class="action-buttons">
                            <button class="btn btn-secondary" onclick="selectCycle('${cycle.id}')">Manage</button>
                            <button class="btn btn-danger" onclick="closeCycleFromList('${cycle.id}')">Close</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    updateActiveCycleSelect(openCycles);
    renderSelectedCycle();
}

function updateActiveCycleSelect(openCycles) {
    const select = document.getElementById('active-cycle-select');
    select.innerHTML = openCycles.map(cycle => {
        const scheme = storage.get('schemes', cycle.scheme_id);
        const sourceLabel = cycle.opened_via === 'schedule' ? 'scheduled' : 'manual';
        return `<option value="${cycle.id}">${scheme?.name || 'Unknown Scheme'} • ${cycle.start_date} to ${cycle.end_date} • ${sourceLabel}</option>`;
    }).join('');

    if (cyclePageState.selectedCycleId) {
        select.value = cyclePageState.selectedCycleId;
    }
}

function renderSelectedCycle() {
    const cycleId = cyclePageState.selectedCycleId;
    const captureSection = document.getElementById('capture-section');

    if (!cycleId) {
        captureSection.style.display = 'none';
        return;
    }

    const cycle = storage.get('cycles', cycleId);
    if (!cycle || cycle.status !== 'OPEN') {
        captureSection.style.display = 'none';
        return;
    }

    captureSection.style.display = 'block';

    const scheme = storage.get('schemes', cycle.scheme_id);
    const sourceLabel = cycle.opened_via === 'schedule' ? 'Scheduled cycle' : 'Manual cycle';
    document.getElementById('active-cycle-summary').innerHTML = `
        <strong>${scheme?.name || 'Unknown Scheme'}</strong><br>
        ${sourceLabel} • ${cycle.start_date} to ${cycle.end_date}<br>
        Only this scheme's meters are shown below. Use the selector above to switch cycles.
    `;

    populateBuildingFilter(cycle.scheme_id);
    loadReadingsList(cycle.id);
}

function populateBuildingFilter(schemeId) {
    const select = document.getElementById('filter-building');

    if (!schemeId) {
        select.innerHTML = '<option value="">All Buildings</option>';
        return;
    }

    const previousValue = select.value;
    const buildings = storage.getBuildings(schemeId);
    select.innerHTML = '<option value="">All Buildings</option>' +
        buildings.map(building => `<option value="${building.id}">${building.name}</option>`).join('');

    if (buildings.some(building => building.id === previousValue)) {
        select.value = previousValue;
    }
}

function loadReadingsList(cycleId) {
    const cycle = storage.get('cycles', cycleId);
    const container = document.getElementById('readings-list');

    if (!cycle) {
        container.innerHTML = '<p class="text-muted">Select an open cycle to manage readings.</p>';
        return;
    }

    const buildingFilter = document.getElementById('filter-building').value;
    const statusFilter = document.getElementById('filter-status').value;
    const meters = storage.getMeters(cycle.scheme_id).filter(meter => meter.meter_type === 'UNIT');
    const readings = storage.getReadings(cycleId);
    const readingsMap = new Map(readings.map(reading => [reading.meter_id, reading]));

    const filteredMeters = meters.filter(meter => {
        const unit = meter.unit_id ? storage.get('units', meter.unit_id) : null;
        const reading = readingsMap.get(meter.id);
        const hasFlags = Boolean(reading?.flags?.length);

        if (buildingFilter && unit?.building_id !== buildingFilter) {
            return false;
        }

        if (statusFilter === 'not-read' && reading) {
            return false;
        }

        if (statusFilter === 'read' && !reading) {
            return false;
        }

        if (statusFilter === 'flagged' && !hasFlags) {
            return false;
        }

        return true;
    });

    if (meters.length === 0) {
        container.innerHTML = '<p class="text-muted">No unit meters found for this scheme.</p>';
        return;
    }

    if (filteredMeters.length === 0) {
        container.innerHTML = '<p class="text-muted">No meters match the current filters.</p>';
        return;
    }

    container.innerHTML = `
        <div class="table-wrapper">
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
                    ${filteredMeters.map(meter => {
                        const meterDetails = storage.getMeterWithDetails(meter.id);
                        const reading = readingsMap.get(meter.id);
                        const hasFlags = Boolean(reading?.flags?.length);

                        let statusBadge = '<span class="badge badge-warning">NOT READ</span>';
                        let currentReading = '-';
                        let consumption = '-';

                        if (reading) {
                            currentReading = reading.reading_value;
                            consumption = reading.consumption != null ? `${reading.consumption.toFixed(2)} kWh` : 'N/A';
                            statusBadge = hasFlags
                                ? '<span class="badge badge-danger">FLAGGED</span>'
                                : '<span class="badge badge-success">READ</span>';
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
        </div>
    `;
}

function renderSchedules() {
    const scheduleList = document.getElementById('schedule-list');
    const schedules = getSchedules();

    if (schedules.length === 0) {
        scheduleList.innerHTML = '<p class="text-muted">No schedules created yet.</p>';
        return;
    }

    scheduleList.innerHTML = `
        <div class="schedule-list">
            ${schedules.map(schedule => {
                const scheme = storage.get('schemes', schedule.scheme_id);
                const isLive = getTodayDateKey() >= schedule.start_date && getTodayDateKey() <= schedule.end_date;
                return `
                    <div class="schedule-list-item">
                        <div>
                            <div class="cycle-list-title">
                                <strong>${schedule.name || scheme?.name || 'Unnamed Schedule'}</strong>
                                <span class="badge ${schedule.enabled ? 'badge-success' : 'badge-secondary'}">${schedule.enabled ? 'Enabled' : 'Disabled'}</span>
                                ${isLive && schedule.enabled ? '<span class="badge badge-warning">Active Window</span>' : ''}
                            </div>
                            <div class="text-muted">${scheme?.name || 'Unknown Scheme'} • ${schedule.start_date} to ${schedule.end_date}</div>
                        </div>
                        <div class="schedule-actions">
                            <label class="schedule-toggle">
                                <input type="checkbox" id="schedule-enabled-${schedule.id}" ${schedule.enabled ? 'checked' : ''} onchange="toggleScheduleEnabled('${schedule.id}')">
                                Enabled
                            </label>
                            <button class="btn btn-danger" onclick="deleteSchedule('${schedule.id}')">Delete</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

window.switchCycleTab = function(tabId, event) {
    cyclePageState.activeTabId = tabId;

    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.toggle('active', tab.id === tabId);
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.remove('active');
    });

    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
};

window.selectActiveCycle = function() {
    cyclePageState.selectedCycleId = document.getElementById('active-cycle-select').value || null;
    renderOpenCycles();
};

window.selectCycle = function(cycleId) {
    cyclePageState.selectedCycleId = cycleId;
    renderOpenCycles();
};

window.closeCycleFromList = function(cycleId) {
    cyclePageState.selectedCycleId = cycleId;
    renderOpenCycles();
    if (window.showCloseCycleRitual) {
        window.showCloseCycleRitual();
    }
};

window.filterReadings = function() {
    if (cyclePageState.selectedCycleId) {
        loadReadingsList(cyclePageState.selectedCycleId);
    }
};

window.deleteSchedule = function(scheduleId) {
    if (!confirmAction('Delete this schedule? Existing cycles will stay as they are.')) {
        return;
    }

    storage.delete('cycle_schedules', scheduleId);
    showNotification('Schedule deleted.');
    loadCyclePage();
};

window.toggleScheduleEnabled = function(scheduleId) {
    const checkbox = document.getElementById(`schedule-enabled-${scheduleId}`);
    storage.update('cycle_schedules', scheduleId, { enabled: checkbox.checked });
    loadCyclePage();
};

window.getSelectedCycleId = function() {
    return cyclePageState.selectedCycleId;
};

window.openReadingModal = function(meterId, cycleId) {
    // Use enhanced reading capture modal
    if (window.readingCaptureEnhanced) {
        const modalHTML = window.readingCaptureEnhanced.renderCaptureModal(meterId, cycleId);
        if (modalHTML) {
            // Remove existing modal if any
            const existingModal = document.querySelector('.modal-overlay');
            if (existingModal) {
                existingModal.remove();
            }
            // Insert new modal
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
        return;
    }
    
    // Fallback to original modal (if enhanced module not loaded)
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

document.getElementById('reading-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const meterId = document.getElementById('reading-meter-id').value;
    const cycleId = document.getElementById('reading-cycle-id').value;
    const readingValueInput = document.getElementById('reading-value');
    const readingValue = parseDecimalInput(readingValueInput.value);

    if (Number.isNaN(readingValue)) {
        showNotification('Please enter a valid meter reading. Decimals like 1450.5 or 1450,5 are accepted.');
        readingValueInput.focus();
        return;
    }

    const readings = storage.getReadings(cycleId);
    const existingReading = readings.find(r => r.meter_id === meterId);
    
    const meter = storage.get('meters', meterId);
    const consumption = validation.calculateConsumption(readingValue, meter.last_reading);
    const photoInput = document.getElementById('reading-photo');
    const preparedPhoto = photoInput && photoInput.files && photoInput.files[0]
        ? await preparePhotoForStorage(photoInput.files[0])
        : null;
    
    // Get current user from auth
    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const capturedBy = currentUser ? currentUser.name : 'Unknown User';
    
    const readingData = {
        meter_id: meterId,
        cycle_id: cycleId,
        reading_value: readingValue,
        reading_date: document.getElementById('reading-date').value,
        photo: preparedPhoto ? preparedPhoto.dataUrl : (existingReading?.photo || ''),
        photo_name: preparedPhoto ? preparedPhoto.name : (existingReading?.photo_name || ''),
        notes: document.getElementById('reading-notes').value,
        consumption: consumption,
        captured_by: capturedBy,
        captured_by_id: currentUser ? currentUser.id : null,
        flags: [],
        review_status: 'pending'
    };
    
    // Validate and generate flags
    readingData.flags = validation.validateReading(readingData);
    
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

function populateSchemeSelect(selectId) {
    const schemes = storage.getSchemes();
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- Select Scheme --</option>' +
        schemes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}
