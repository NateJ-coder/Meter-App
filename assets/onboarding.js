/**
 * onboarding.js - Guided First-Run Experience
 * Transforms fragmented setup into confidence-building sequence
 */

import { storage } from './storage.js';
import { validation } from './validation.js';

export const onboarding = {
    // Onboarding state management
    getState() {
        const state = localStorage.getItem('fuzio_onboarding_state');
        return state ? JSON.parse(state) : {
            started: false,
            completed: false,
            currentStep: 0,
            schemeCreated: false,
            buildingsAdded: false,
            unitsAdded: false,
            metersRegistered: false,
            firstCycleOpened: false,
            firstCycleClosed: false
        };
    },

    setState(state) {
        localStorage.setItem('fuzio_onboarding_state', JSON.stringify(state));
    },

    markComplete() {
        const state = this.getState();
        state.completed = true;
        this.setState(state);
    },

    // Check if onboarding should be shown
    shouldShowOnboarding() {
        const state = this.getState();
        const hasSchemes = storage.getAll('schemes').length > 0;
        
        // First run: no schemes and not completed
        if (!hasSchemes && !state.completed) {
            return true;
        }
        
        return false;
    },

    // Check onboarding progress
    getProgress() {
        const schemes = storage.getAll('schemes');
        const buildings = storage.getAll('buildings');
        const units = storage.getAll('units');
        const meters = storage.getAll('meters');
        const cycles = storage.getAll('cycles');

        return {
            schemeCreated: schemes.length > 0,
            buildingsAdded: buildings.length > 0,
            unitsAdded: units.length > 0,
            metersRegistered: meters.length > 0,
            firstCycleOpened: cycles.length > 0,
            firstCycleClosed: cycles.some(c => c.status === 'CLOSED')
        };
    },

    // Calculate completion percentage
    getCompletionPercentage() {
        const progress = this.getProgress();
        const completed = Object.values(progress).filter(Boolean).length;
        const total = Object.keys(progress).length;
        return Math.round((completed / total) * 100);
    },

    // Render onboarding wizard
    renderWizard(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const state = this.getState();
        
        container.innerHTML = `
            <div class="onboarding-wizard">
                <div class="onboarding-header">
                    <h1>Welcome to Fuzio Meter Readings</h1>
                    <p class="subtitle">Let's get you set up in minutes. We'll guide you step by step.</p>
                </div>

                <div class="onboarding-steps">
                    ${this.renderStep(1, 'Create Scheme', 'Where are the meters located?', state.currentStep)}
                    ${this.renderStep(2, 'Add Buildings', 'How is the property structured?', state.currentStep)}
                    ${this.renderStep(3, 'Add Units', 'Which spaces are being metered?', state.currentStep)}
                    ${this.renderStep(4, 'Register Meters', 'Link physical meters to units', state.currentStep)}
                    ${this.renderStep(5, 'Readiness Check', 'Verify everything is connected', state.currentStep)}
                    ${this.renderStep(6, 'Open First Cycle', 'Start capturing readings', state.currentStep)}
                </div>

                <div class="onboarding-content">
                    ${this.renderStepContent(state.currentStep)}
                </div>

                <div class="onboarding-navigation">
                    ${state.currentStep > 0 ? '<button class="btn btn-secondary" onclick="onboarding.previousStep()">← Previous</button>' : ''}
                    <button class="btn btn-primary" onclick="onboarding.handleNextClick()" id="next-step-btn">Next →</button>
                </div>
            </div>
        `;
    },

    renderStep(stepNumber, title, description, currentStep) {
        const isActive = currentStep === stepNumber;
        const isCompleted = currentStep > stepNumber;
        const statusClass = isCompleted ? 'completed' : (isActive ? 'active' : 'pending');

        return `
            <div class="onboarding-step ${statusClass}">
                <div class="step-number">${isCompleted ? '✓' : stepNumber}</div>
                <div class="step-info">
                    <div class="step-title">${title}</div>
                    <div class="step-description">${description}</div>
                </div>
            </div>
        `;
    },

    renderStepContent(step) {
        switch(step) {
            case 0:
                return this.renderIntro();
            case 1:
                return this.renderSchemeForm();
            case 2:
                return this.renderBuildingsForm();
            case 3:
                return this.renderUnitsForm();
            case 4:
                return this.renderMetersForm();
            case 5:
                return this.renderReadinessCheck();
            case 6:
                return this.renderFirstCycle();
            default:
                return '<p>Unknown step</p>';
        }
    },

    renderIntro() {
        return `
            <div class="onboarding-intro">
                <h2>Ready to set up your meter reading system?</h2>
                <p>This wizard will help you:</p>
                <ul>
                    <li>Define your property structure</li>
                    <li>Register all meters</li>
                    <li>Open your first reading cycle</li>
                    <li>Be ready to capture readings with confidence</li>
                </ul>
                <p class="text-muted">You can always modify these settings later from the Meter Register.</p>
            </div>
        `;
    },

    renderSchemeForm() {
        return `
            <div class="step-content">
                <h2>Create Your Scheme</h2>
                <p>A scheme represents a property or location where you manage meters.</p>
                
                <form id="scheme-form" onsubmit="return onboarding.handleSchemeSubmit(event)">
                    <div class="form-group">
                        <label for="scheme-name">Scheme Name *</label>
                        <input type="text" id="scheme-name" required placeholder="e.g., Oak Gardens Complex">
                    </div>
                    
                    <div class="form-group">
                        <label for="scheme-address">Physical Address *</label>
                        <textarea id="scheme-address" required rows="3" placeholder="123 Main Street, City, Postal Code"></textarea>
                    </div>

                    <div class="form-group">
                        <label for="scheme-notes">Notes (optional)</label>
                        <textarea id="scheme-notes" rows="2" placeholder="Any additional information..."></textarea>
                    </div>
                </form>
            </div>
        `;
    },

    renderBuildingsForm() {
        const schemeId = storage.getAll('schemes')[0]?.id;
        const buildings = storage.getAll('buildings').filter(b => b.scheme_id === schemeId);

        return `
            <div class="step-content">
                <h2>Add Buildings</h2>
                <p>Define the buildings or structures within your scheme.</p>

                ${buildings.length > 0 ? `
                    <div class="existing-items">
                        <h3>Buildings Added (${buildings.length})</h3>
                        <ul>
                            ${buildings.map(b => `<li>✓ ${b.name}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <form id="building-form" onsubmit="return onboarding.handleBuildingSubmit(event)">
                    <div class="form-group">
                        <label for="building-name">Building Name *</label>
                        <input type="text" id="building-name" required placeholder="e.g., Block A, Main Building">
                    </div>

                    <button type="submit" class="btn btn-secondary">+ Add Building</button>
                </form>

                ${buildings.length > 0 ? '<p class="text-muted">Click "Next" when you\'ve added all buildings.</p>' : ''}
            </div>
        `;
    },

    renderUnitsForm() {
        const schemeId = storage.getAll('schemes')[0]?.id;
        const buildings = storage.getAll('buildings').filter(b => b.scheme_id === schemeId);
        const units = storage.getAll('units').filter(u => buildings.some(b => b.id === u.building_id));

        if (buildings.length === 0) {
            return '<p class="text-danger">Please add at least one building first.</p>';
        }

        return `
            <div class="step-content">
                <h2>Add Units</h2>
                <p>Add units (apartments, shops, offices) within each building.</p>

                ${units.length > 0 ? `
                    <div class="existing-items">
                        <h3>Units Added (${units.length})</h3>
                        ${buildings.map(building => {
                            const buildingUnits = units.filter(u => u.building_id === building.id);
                            return buildingUnits.length > 0 ? `
                                <h4>${building.name}</h4>
                                <ul>
                                    ${buildingUnits.map(u => `<li>✓ Unit ${u.unit_number}</li>`).join('')}
                                </ul>
                            ` : '';
                        }).join('')}
                    </div>
                ` : ''}

                <form id="unit-form" onsubmit="return onboarding.handleUnitSubmit(event)">
                    <div class="form-group">
                        <label for="unit-building">Building *</label>
                        <select id="unit-building" required>
                            <option value="">Select building...</option>
                            ${buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="unit-number">Unit Number *</label>
                        <input type="text" id="unit-number" required placeholder="e.g., 101, Shop 5">
                    </div>

                    <button type="submit" class="btn btn-secondary">+ Add Unit</button>
                </form>

                ${units.length > 0 ? '<p class="text-muted">Click "Next" when you\'ve added all units.</p>' : ''}
            </div>
        `;
    },

    renderMetersForm() {
        const schemeId = storage.getAll('schemes')[0]?.id;
        const buildings = storage.getAll('buildings').filter(b => b.scheme_id === schemeId);
        const units = storage.getAll('units').filter(u => buildings.some(b => b.id === u.building_id));
        const meters = storage.getAll('meters').filter(m => m.scheme_id === schemeId);

        if (units.length === 0) {
            return '<p class="text-danger">Please add units first.</p>';
        }

        const bulkMeters = meters.filter(m => m.meter_type === 'BULK');
        const unitMeters = meters.filter(m => m.meter_type === 'UNIT');

        return `
            <div class="step-content">
                <h2>Register Meters</h2>
                <p>Link physical meters to your units. Start with the bulk meter, then add unit meters.</p>

                ${meters.length > 0 ? `
                    <div class="existing-items">
                        <h3>Meters Registered (${meters.length})</h3>
                        ${bulkMeters.length > 0 ? `
                            <h4>Bulk Meters (${bulkMeters.length})</h4>
                            <ul>
                                ${bulkMeters.map(m => `<li>✓ ${m.meter_number}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${unitMeters.length > 0 ? `
                            <h4>Unit Meters (${unitMeters.length})</h4>
                            <ul>
                                ${unitMeters.slice(0, 5).map(m => {
                                    const unit = storage.get('units', m.unit_id);
                                    return `<li>✓ ${m.meter_number} (Unit ${unit?.unit_number || 'Unknown'})</li>`;
                                }).join('')}
                                ${unitMeters.length > 5 ? `<li>... and ${unitMeters.length - 5} more</li>` : ''}
                            </ul>
                        ` : ''}
                    </div>
                ` : ''}

                <div class="meter-forms">
                    <div class="form-section">
                        <h3>Bulk Meter</h3>
                        <form id="bulk-meter-form" onsubmit="return onboarding.handleBulkMeterSubmit(event)">
                            <div class="form-group">
                                <label for="bulk-meter-number">Meter Number *</label>
                                <input type="text" id="bulk-meter-number" required placeholder="e.g., M-2024-001">
                            </div>
                            <div class="form-group">
                                <label for="bulk-meter-reading">Initial Reading</label>
                                <input type="number" id="bulk-meter-reading" step="0.01" placeholder="0">
                            </div>
                            <button type="submit" class="btn btn-secondary">+ Add Bulk Meter</button>
                        </form>
                    </div>

                    <div class="form-section">
                        <h3>Unit Meters</h3>
                        <form id="unit-meter-form" onsubmit="return onboarding.handleUnitMeterSubmit(event)">
                            <div class="form-group">
                                <label for="meter-building">Building *</label>
                                <select id="meter-building" required onchange="onboarding.updateUnitDropdown()">
                                    <option value="">Select building...</option>
                                    ${buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="meter-unit">Unit *</label>
                                <select id="meter-unit" required>
                                    <option value="">Select unit...</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="meter-number">Meter Number *</label>
                                <input type="text" id="meter-number" required placeholder="e.g., M-2024-101">
                            </div>
                            <div class="form-group">
                                <label for="meter-reading">Initial Reading</label>
                                <input type="number" id="meter-reading" step="0.01" placeholder="0">
                            </div>
                            <button type="submit" class="btn btn-secondary">+ Add Unit Meter</button>
                        </form>
                    </div>
                </div>

                ${meters.length > 0 ? '<p class="text-muted">Click "Next" when you\'ve added all meters.</p>' : ''}
            </div>
        `;
    },

    renderReadinessCheck() {
        const schemeId = storage.getAll('schemes')[0]?.id;
        const buildings = storage.getAll('buildings').filter(b => b.scheme_id === schemeId);
        const units = storage.getAll('units').filter(u => buildings.some(b => b.id === u.building_id));
        const meters = storage.getAll('meters').filter(m => m.scheme_id === schemeId);
        
        const bulkMeters = meters.filter(m => m.meter_type === 'BULK');
        const unitMeters = meters.filter(m => m.meter_type === 'UNIT');
        
        // Calculate setup health
        const unitsWithoutMeters = units.filter(unit => 
            !unitMeters.some(m => m.unit_id === unit.id)
        );
        const duplicates = validation.checkDuplicateMeters(schemeId);

        const isReady = unitsWithoutMeters.length === 0 && duplicates.length === 0 && bulkMeters.length > 0;

        return `
            <div class="step-content">
                <h2>Readiness Check</h2>
                <p>Let's verify your setup is complete and accurate.</p>

                <div class="readiness-summary">
                    <div class="readiness-item ${isReady ? 'success' : 'warning'}">
                        <div class="readiness-icon">${isReady ? '✓' : '⚠'}</div>
                        <div class="readiness-details">
                            <h3>Setup Status</h3>
                            <p>${isReady ? 'Everything looks good!' : 'Some issues need attention'}</p>
                        </div>
                    </div>

                    <div class="readiness-stats">
                        <div class="stat-item">
                            <div class="stat-value">${buildings.length}</div>
                            <div class="stat-label">Buildings</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${units.length}</div>
                            <div class="stat-label">Units</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${bulkMeters.length}</div>
                            <div class="stat-label">Bulk Meters</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${unitMeters.length}</div>
                            <div class="stat-label">Unit Meters</div>
                        </div>
                    </div>

                    ${unitsWithoutMeters.length > 0 ? `
                        <div class="readiness-issue warning">
                            <strong>⚠ ${unitsWithoutMeters.length} units without meters</strong>
                            <ul>
                                ${unitsWithoutMeters.slice(0, 5).map(unit => {
                                    const building = storage.get('buildings', unit.building_id);
                                    return `<li>Unit ${unit.unit_number} (${building?.name || 'Unknown Building'})</li>`;
                                }).join('')}
                                ${unitsWithoutMeters.length > 5 ? `<li>... and ${unitsWithoutMeters.length - 5} more</li>` : ''}
                            </ul>
                            <button class="btn btn-secondary" onclick="onboarding.goToStep(4)">← Go Back to Add Meters</button>
                        </div>
                    ` : `
                        <div class="readiness-issue success">
                            <strong>✓ All units have meters</strong>
                        </div>
                    `}

                    ${duplicates.length > 0 ? `
                        <div class="readiness-issue warning">
                            <strong>⚠ ${duplicates.length} duplicate meter numbers</strong>
                            <ul>
                                ${duplicates.map(d => `<li>Meter ${d.meter_number}</li>`).join('')}
                            </ul>
                            <button class="btn btn-secondary" onclick="onboarding.goToStep(4)">← Go Back to Fix Duplicates</button>
                        </div>
                    ` : `
                        <div class="readiness-issue success">
                            <strong>✓ No duplicate meter numbers</strong>
                        </div>
                    `}

                    ${bulkMeters.length === 0 ? `
                        <div class="readiness-issue warning">
                            <strong>⚠ No bulk meter registered</strong>
                            <p>You need at least one bulk meter to track total consumption.</p>
                            <button class="btn btn-secondary" onclick="onboarding.goToStep(4)">← Go Back to Add Bulk Meter</button>
                        </div>
                    ` : `
                        <div class="readiness-issue success">
                            <strong>✓ Bulk meter registered</strong>
                        </div>
                    `}
                </div>

                ${isReady ? '<p class="text-success">✓ Your setup is complete! Ready to open your first reading cycle.</p>' : '<p class="text-warning">⚠ Please resolve the issues above before proceeding.</p>'}
            </div>
        `;
    },

    renderFirstCycle() {
        const scheme = storage.getAll('schemes')[0];
        
        return `
            <div class="step-content">
                <h2>Open Your First Reading Cycle</h2>
                <p>A reading cycle represents a billing period (usually monthly). Let's open your first one.</p>

                <form id="first-cycle-form" onsubmit="return onboarding.handleFirstCycleSubmit(event)">
                    <div class="form-group">
                        <label for="cycle-start">Start Date *</label>
                        <input type="date" id="cycle-start" required value="${new Date().toISOString().split('T')[0]}">
                    </div>

                    <div class="form-group">
                        <label for="cycle-end">End Date *</label>
                        <input type="date" id="cycle-end" required>
                    </div>

                    <div class="onboarding-final-note">
                        <h3>What happens next?</h3>
                        <ul>
                            <li>✓ Your reading cycle will be opened</li>
                            <li>✓ You can start capturing meter readings</li>
                            <li>✓ The system will automatically validate readings</li>
                            <li>✓ You'll be able to review, export, and generate dispute packs</li>
                        </ul>
                    </div>
                </form>
            </div>
        `;
    },

    // Navigation
    handleNextClick() {
        const state = this.getState();
        
        // For steps with forms that need submission, trigger the form submit
        // The form handlers (handleSchemeSubmit, etc.) will call nextStep() after saving
        const formSelectors = {
            1: '#scheme-form',      // Create Scheme step
            2: null,                // Buildings - uses separate add form, Next just navigates
            3: null,                // Units - uses separate add form, Next just navigates
            4: null,                // Meters - uses separate add form, Next just navigates
        };
        
        const formSelector = formSelectors[state.currentStep];
        
        if (formSelector) {
            const form = document.querySelector(formSelector);
            if (form) {
                // Check if form is valid before submitting
                if (form.checkValidity()) {
                    form.requestSubmit(); // Trigger form submission
                } else {
                    form.reportValidity(); // Show validation errors
                }
                return; // Form handler will call nextStep()
            }
        }
        
        // For steps without forms, just navigate
        this.nextStep();
    },

    nextStep() {
        const state = this.getState();
        
        // Validate before moving forward
        if (!this.validateStep(state.currentStep)) {
            return;
        }

        state.currentStep++;
        
        if (state.currentStep > 6) {
            // Complete onboarding
            this.completeOnboarding();
            return;
        }

        this.setState(state);
        this.renderWizard('onboarding-container');
    },

    previousStep() {
        const state = this.getState();
        if (state.currentStep > 0) {
            state.currentStep--;
            this.setState(state);
            this.renderWizard('onboarding-container');
        }
    },

    goToStep(stepNumber) {
        const state = this.getState();
        state.currentStep = stepNumber;
        this.setState(state);
        this.renderWizard('onboarding-container');
    },

    validateStep(step) {
        switch(step) {
            case 0:
                return true; // Intro, always valid
            case 1:
                // Check if scheme exists
                if (storage.getAll('schemes').length === 0) {
                    alert('Please create a scheme before proceeding.');
                    return false;
                }
                return true;
            case 2:
                // Check if buildings exist
                if (storage.getAll('buildings').length === 0) {
                    alert('Please add at least one building before proceeding.');
                    return false;
                }
                return true;
            case 3:
                // Check if units exist
                if (storage.getAll('units').length === 0) {
                    alert('Please add at least one unit before proceeding.');
                    return false;
                }
                return true;
            case 4:
                // Check if meters exist
                if (storage.getAll('meters').length === 0) {
                    alert('Please add at least one meter before proceeding.');
                    return false;
                }
                return true;
            case 5:
                // Check readiness
                const schemeId = storage.getAll('schemes')[0]?.id;
                const units = storage.getAll('units');
                const meters = storage.getAll('meters').filter(m => m.scheme_id === schemeId);
                const unitMeters = meters.filter(m => m.meter_type === 'UNIT');
                const bulkMeters = meters.filter(m => m.meter_type === 'BULK');
                
                const unitsWithoutMeters = units.filter(unit => 
                    !unitMeters.some(m => m.unit_id === unit.id)
                );
                const duplicates = validation.checkDuplicateMeters(schemeId);

                if (unitsWithoutMeters.length > 0 || duplicates.length > 0 || bulkMeters.length === 0) {
                    alert('Please resolve all setup issues before proceeding.');
                    return false;
                }
                return true;
            default:
                return true;
        }
    },

    completeOnboarding() {
        this.markComplete();
        alert('🎉 Onboarding complete! Welcome to Fuzio Meter Readings.');
        window.location.href = 'index.html';
    },

    // Form handlers
    handleSchemeSubmit(event) {
        event.preventDefault();
        
        const scheme = {
            id: Date.now().toString(),
            name: document.getElementById('scheme-name').value,
            address: document.getElementById('scheme-address').value,
            notes: document.getElementById('scheme-notes').value,
            created_at: new Date().toISOString()
        };

        storage.save('schemes', scheme);
        
        const state = this.getState();
        state.schemeCreated = true;
        this.setState(state);
        
        this.nextStep();
        return false;
    },

    handleBuildingSubmit(event) {
        event.preventDefault();
        
        const schemeId = storage.getAll('schemes')[0].id;
        const building = {
            id: Date.now().toString(),
            scheme_id: schemeId,
            name: document.getElementById('building-name').value,
            created_at: new Date().toISOString()
        };

        storage.save('buildings', building);
        
        const state = this.getState();
        state.buildingsAdded = true;
        this.setState(state);
        
        // Re-render to show added building
        this.renderWizard('onboarding-container');
        
        // Clear form
        document.getElementById('building-name').value = '';
        
        return false;
    },

    handleUnitSubmit(event) {
        event.preventDefault();
        
        const unit = {
            id: Date.now().toString(),
            building_id: document.getElementById('unit-building').value,
            unit_number: document.getElementById('unit-number').value,
            created_at: new Date().toISOString()
        };

        storage.save('units', unit);
        
        const state = this.getState();
        state.unitsAdded = true;
        this.setState(state);
        
        // Re-render to show added unit
        this.renderWizard('onboarding-container');
        
        // Clear form
        document.getElementById('unit-number').value = '';
        
        return false;
    },

    handleBulkMeterSubmit(event) {
        event.preventDefault();
        
        const schemeId = storage.getAll('schemes')[0].id;
        const meter = {
            id: Date.now().toString(),
            scheme_id: schemeId,
            meter_number: document.getElementById('bulk-meter-number').value,
            meter_type: 'BULK',
            last_reading: parseFloat(document.getElementById('bulk-meter-reading').value) || 0,
            created_at: new Date().toISOString()
        };

        storage.save('meters', meter);
        
        const state = this.getState();
        state.metersRegistered = true;
        this.setState(state);
        
        // Re-render
        this.renderWizard('onboarding-container');
        
        // Clear form
        document.getElementById('bulk-meter-number').value = '';
        document.getElementById('bulk-meter-reading').value = '';
        
        return false;
    },

    handleUnitMeterSubmit(event) {
        event.preventDefault();
        
        const schemeId = storage.getAll('schemes')[0].id;
        const meter = {
            id: Date.now().toString(),
            scheme_id: schemeId,
            unit_id: document.getElementById('meter-unit').value,
            meter_number: document.getElementById('meter-number').value,
            meter_type: 'UNIT',
            last_reading: parseFloat(document.getElementById('meter-reading').value) || 0,
            created_at: new Date().toISOString()
        };

        storage.save('meters', meter);
        
        const state = this.getState();
        state.metersRegistered = true;
        this.setState(state);
        
        // Re-render
        this.renderWizard('onboarding-container');
        
        // Clear form
        document.getElementById('meter-number').value = '';
        document.getElementById('meter-reading').value = '';
        
        return false;
    },

    handleFirstCycleSubmit(event) {
        event.preventDefault();
        
        const schemeId = storage.getAll('schemes')[0].id;
        const cycle = {
            id: Date.now().toString(),
            scheme_id: schemeId,
            start_date: document.getElementById('cycle-start').value,
            end_date: document.getElementById('cycle-end').value,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };

        storage.save('cycles', cycle);
        
        const state = this.getState();
        state.firstCycleOpened = true;
        this.setState(state);
        
        this.completeOnboarding();
        return false;
    },

    updateUnitDropdown() {
        const buildingId = document.getElementById('meter-building').value;
        const unitSelect = document.getElementById('meter-unit');
        
        if (!buildingId) {
            unitSelect.innerHTML = '<option value="">Select unit...</option>';
            return;
        }

        const units = storage.getAll('units').filter(u => u.building_id === buildingId);
        unitSelect.innerHTML = '<option value="">Select unit...</option>' + 
            units.map(u => `<option value="${u.id}">Unit ${u.unit_number}</option>`).join('');
    }
};

// Make onboarding available globally for onclick handlers
window.onboarding = onboarding;
