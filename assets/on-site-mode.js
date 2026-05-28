/**
 * on-site-mode.js - Guided On-Site Reading Mode
 * Transforms capture from navigation → conveyor belt
 * For field workers: "Here's the next meter. Capture it. Move on."
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { auth } from './auth.js';
import { preparePhotoForStorage } from './photo-utils.js';
import { persistReadingPhoto } from './firebase-media.js';
import { parseDecimalInput } from './app.js';
import { buildCaptureReadingRecord, getMeterDisplayDescriptor, saveCaptureReading } from './capture-shared.js';
import { getWorkbookCapturePolicyForMeter, preloadWorkbookCapturePolicy } from './workbook-capture-policy.js';

export const onSiteMode = {
    /**
     * Check if on-site mode is active
     */
    isActive() {
        return localStorage.getItem('fuzio_onsite_mode') === 'true';
    },

    /**
     * Activate on-site mode
     */
    activate() {
        localStorage.setItem('fuzio_onsite_mode', 'true');
    },

    /**
     * Deactivate on-site mode
     */
    deactivate() {
        localStorage.removeItem('fuzio_onsite_mode');
        localStorage.removeItem('fuzio_onsite_queue_position');
    },

    /**
     * Get reading queue for active cycle
     * Orders meters by: Building → Unit Number → Unread first
     */
    getReadingQueue(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        if (!cycle) return [];

        // Get all unit meters for this scheme
        const meters = storage.getMeters(cycle.scheme_id)
            .filter(m => m.meter_type === 'UNIT');

        // Get readings for this cycle
        const readings = storage.getReadings(cycleId);
        const readMeterIds = new Set(readings.map(r => r.meter_id));

        // Enrich meters with details and reading status
        const queue = meters.map(meter => {
            const unit = storage.get('units', meter.unit_id);
            const building = unit ? storage.get('buildings', unit.building_id) : null;
            const reading = readings.find(r => r.meter_id === meter.id);

            return {
                ...meter,
                unit_number: unit?.unit_number || 'Unknown',
                building_name: building?.name || 'Unknown Building',
                building_id: building?.id,
                is_read: readMeterIds.has(meter.id),
                reading: reading,
                has_flags: reading?.flags && reading.flags.length > 0
            };
        });

        // Sort: Building → Unit Number → Unread first → Flagged last
        queue.sort((a, b) => {
            // First by building
            if (a.building_name !== b.building_name) {
                return a.building_name.localeCompare(b.building_name);
            }
            
            // Then by unit number
            const unitA = String(a.unit_number);
            const unitB = String(b.unit_number);
            if (unitA !== unitB) {
                return unitA.localeCompare(unitB, undefined, { numeric: true });
            }

            // Unread before read
            if (a.is_read !== b.is_read) {
                return a.is_read ? 1 : -1;
            }

            // Unflagged before flagged
            if (a.has_flags !== b.has_flags) {
                return a.has_flags ? 1 : -1;
            }

            return 0;
        });

        return queue;
    },

    /**
     * Get current queue position
     */
    getQueuePosition() {
        const position = localStorage.getItem('fuzio_onsite_queue_position');
        return position ? parseInt(position) : 0;
    },

    /**
     * Set queue position
     */
    setQueuePosition(position) {
        localStorage.setItem('fuzio_onsite_queue_position', position.toString());
    },

    /**
     * Get next meter to read
     */
    getNextMeter(cycleId) {
        const queue = this.getReadingQueue(cycleId);
        const unreadQueue = queue.filter(m => !m.is_read);
        
        if (unreadQueue.length === 0) {
            return null; // All done
        }

        return unreadQueue[0];
    },

    /**
     * Get current meter based on queue position
     */
    getCurrentMeter(cycleId) {
        const queue = this.getReadingQueue(cycleId);
        const position = this.getQueuePosition();
        
        if (position >= queue.length) {
            return null;
        }

        return queue[position];
    },

    /**
     * Advance to next meter in queue
     */
    advanceQueue(cycleId) {
        const queue = this.getReadingQueue(cycleId);
        const currentPosition = this.getQueuePosition();
        
        // Find next unread meter
        for (let i = currentPosition + 1; i < queue.length; i++) {
            if (!queue[i].is_read) {
                this.setQueuePosition(i);
                return queue[i];
            }
        }

        // No more unread meters
        return null;
    },

    /**
     * Get progress statistics
     */
    getProgress(cycleId) {
        const queue = this.getReadingQueue(cycleId);
        const totalMeters = queue.length;
        const readMeters = queue.filter(m => m.is_read).length;
        const unreadMeters = totalMeters - readMeters;
        const completionPercent = totalMeters > 0 ? Math.round((readMeters / totalMeters) * 100) : 0;

        // Building-level progress
        const buildingProgress = {};
        queue.forEach(meter => {
            if (!buildingProgress[meter.building_name]) {
                buildingProgress[meter.building_name] = {
                    total: 0,
                    read: 0
                };
            }
            buildingProgress[meter.building_name].total++;
            if (meter.is_read) {
                buildingProgress[meter.building_name].read++;
            }
        });

        return {
            totalMeters,
            readMeters,
            unreadMeters,
            completionPercent,
            buildingProgress,
            isComplete: unreadMeters === 0
        };
    },

    /**
     * Flag a meter as having an issue
     */
    flagMeterIssue(meterId, cycleId, issueType, notes) {
        const meter = storage.get('meters', meterId);
        if (!meter) return null;

        // Create a special reading with issue flag
        const currentUser = auth.getCurrentUser();
        const reading = {
            cycle_id: cycleId,
            meter_id: meterId,
            reading_value: meter.last_reading || 0, // Use last reading as placeholder
            reading_date: new Date().toISOString().split('T')[0],
            previous_reading: meter.last_reading,
            consumption: 0,
            notes: notes || '',
            captured_at: new Date().toISOString(),
            captured_by: currentUser ? currentUser.name : 'Unknown User',
            captured_by_id: currentUser ? currentUser.id : null,
            review_status: 'pending',
            is_issue: true,
            issue_type: issueType,
            flags: [{
                type: 'issue',
                severity: 'high',
                message: `Meter issue: ${issueType}`
            }]
        };

        storage.create('readings', reading);
        return reading;
    },

    /**
     * Render on-site mode UI
     */
    renderOnSiteCapture(containerId, cycleId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const meter = this.getNextMeter(cycleId);
        if (!meter) {
            this.renderCompletionScreen(containerId, cycleId);
            return;
        }
        const meterDescriptor = getMeterDisplayDescriptor(meter);
        preloadWorkbookCapturePolicy();
        const capturePolicyHint = getWorkbookCapturePolicyForMeter(meter, { buildingName: meter.building_name });
        const policyHintHtml = this.renderCapturePolicyHint(capturePolicyHint);

        const progress = this.getProgress(cycleId);
        const cycle = storage.get('cycles', cycleId);
        const scheme = cycle ? storage.get('schemes', cycle.scheme_id) : null;

        container.innerHTML = `
            <div class="onsite-capture-screen">
                <!-- Progress Bar -->
                <div class="onsite-progress-bar">
                    <div class="progress-fill" style="width: ${progress.completionPercent}%"></div>
                </div>

                <!-- Progress Text -->
                <div class="onsite-progress-text">
                    ${progress.readMeters} of ${progress.totalMeters} meters completed
                </div>

                <!-- Scheme Context -->
                <div class="onsite-context-card">
                    <div class="context-label">Scheme</div>
                    <div class="context-value">${scheme?.name || 'Unknown Scheme'}</div>
                </div>

                <!-- Meter Details -->
                <div class="onsite-meter-card">
                    <div class="meter-location">
                        <span class="building-badge">${meter.building_name}</span>
                        <span class="unit-badge">Unit ${meter.unit_number}</span>
                    </div>
                    <div class="meter-number">
                        Meter: ${meter.meter_number}
                    </div>
                    ${meter.last_reading ? `
                        <div class="meter-last-reading">
                            Previous: ${meter.last_reading.toFixed(2)} kWh
                        </div>
                    ` : ''}
                    ${meterDescriptor.label ? `
                        <div class="meter-last-reading">
                            Label: ${meterDescriptor.label}
                        </div>
                    ` : ''}
                    ${meterDescriptor.serial ? `
                        <div class="meter-last-reading">
                            Serial: ${meterDescriptor.serial}
                        </div>
                    ` : ''}
                </div>

                ${policyHintHtml}

                ${meter.last_reading != null ? `
                    <details class="onsite-confirm-details" id="onsite-previous-reading-section">
                        <summary class="onsite-confirm-summary">Adjust previous reading baseline</summary>
                        <div class="onsite-confirm-body">
                            <p class="onsite-confirm-hint">Use this only when the stored previous reading is wrong or the meter was replaced.</p>
                            <div class="form-group" style="margin-bottom:0.65rem;">
                                <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;">
                                    <input type="checkbox" id="onsite-meter-replaced-toggle" style="width:auto;margin:0;">
                                    Meter replaced - calculate from 0
                                </label>
                            </div>
                            <div class="form-group" id="onsite-override-previous-group" style="margin-bottom:0;">
                                <label for="onsite-previous-reading-override">Correct previous reading (kWh)</label>
                                <input
                                    type="text"
                                    id="onsite-previous-reading-override"
                                    inputmode="decimal"
                                    autocomplete="off"
                                    value="${meter.last_reading}"
                                    class="onsite-input"
                                >
                            </div>
                        </div>
                    </details>
                ` : ''}

                <!-- Capture Form -->
                <form id="onsite-capture-form" class="onsite-capture-form">
                    <!-- Reading input -->
                    <div class="form-group">
                        <label for="onsite-reading">Meter Reading (kWh) *</label>
                        <input 
                            type="text" 
                            id="onsite-reading" 
                            required 
                            autofocus
                            inputmode="decimal"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="Enter exact digits shown on meter display"
                            class="onsite-input-large"
                        >
                    </div>

                    <!-- Live Feedback -->
                    <div id="onsite-feedback" class="onsite-feedback"></div>

                    <!-- Meter type confirmation -->
                    <div class="form-group">
                        <label>Meter type</label>
                        <div class="meter-type-selector" id="onsite-meter-type-selector" role="group" aria-label="Confirm meter type">
                            <button type="button" class="meter-type-btn${meter.meter_type === 'UNIT' ? ' active' : ''}" data-type="UNIT">Unit</button>
                            <button type="button" class="meter-type-btn${meter.meter_type === 'COMMON' ? ' active' : ''}" data-type="COMMON">Common Property</button>
                            <button type="button" class="meter-type-btn${meter.meter_type === 'BULK' ? ' active' : ''}" data-type="BULK">Bulk</button>
                        </div>
                        <small class="form-help">Confirm or correct what this meter serves. Corrections are applied when the cycle closes.</small>
                    </div>

                    <!-- Confirm/correct meter info (collapsible) -->
                    <details class="onsite-confirm-details" id="onsite-confirm-section">
                        <summary class="onsite-confirm-summary">Correct meter info</summary>
                        <div class="onsite-confirm-body">
                            <p class="onsite-confirm-hint">If the meter number or unit label on the physical device is different from what's shown above, update it here. Your correction will be saved.</p>
                            <div class="form-group">
                                <label for="onsite-meter-number">Meter number (on device)</label>
                                <input 
                                    type="text" 
                                    id="onsite-meter-number" 
                                    value="${meter.meter_number || ''}"
                                    placeholder="e.g. 12345678"
                                    autocomplete="off"
                                    class="onsite-input"
                                >
                            </div>
                            <div class="form-group">
                                <label for="onsite-unit-label">Unit label (on door/wall)</label>
                                <input 
                                    type="text" 
                                    id="onsite-unit-label" 
                                    value="${meter.location_description || ''}"
                                    placeholder="e.g. Unit 7, Flat 12B"
                                    autocomplete="off"
                                    class="onsite-input"
                                >
                            </div>
                        </div>
                    </details>

                    <div class="form-group">
                        <label for="onsite-notes">Notes (optional)</label>
                        <textarea 
                            id="onsite-notes" 
                            rows="2" 
                            placeholder="Any observations about this meter (e.g. 'display slightly faded but legible', 'meter in locked room B')"
                            class="onsite-textarea"
                        ></textarea>
                    </div>

                    <div class="form-group">
                        <label for="onsite-photo">Meter Photo</label>
                        <input 
                            type="file"
                            id="onsite-photo"
                            accept="image/*"
                            capture="environment"
                            class="reader-input"
                        >
                        <small class="form-help">Take a clear photo of the meter display. If no photo is possible, confirm below and explain in notes.</small>
                    </div>

                    <div id="onsite-photo-warning" class="onsite-feedback-message warning" style="display:none; margin-bottom:0.75rem;">
                        No photo selected. Tick "Proceed without photo" and add a note to continue.
                    </div>

                    <div class="form-group" style="margin-top:-0.25rem;">
                        <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;">
                            <input type="checkbox" id="onsite-no-photo-confirm" style="width:auto;margin:0;">
                            Proceed without photo for this meter
                        </label>
                    </div>

                    <!-- Primary Actions -->
                    <div class="onsite-actions-primary">
                        <button type="submit" class="btn btn-primary btn-large onsite-submit">
                            Save & Next →
                        </button>
                    </div>

                    <!-- Secondary Actions -->
                    <div class="onsite-actions-secondary">
                        <button type="button" class="btn btn-secondary btn-outline" onclick="onSiteMode.showSkipMeterDialog('${meter.id}', '${cycleId}')">
                            Skip meter
                        </button>
                        <button type="button" class="btn btn-secondary btn-outline" onclick="onSiteMode.showIssueDialog('${meter.id}', '${cycleId}')">
                            ⚠ Flag an Issue
                        </button>
                        <button type="button" class="btn btn-secondary btn-outline" onclick="onSiteMode.showAddUnlistedMeterDialog('${cycleId}')">
                            + Add unlisted meter
                        </button>
                    </div>
                </form>
            </div>
        `;

        // Attach form handler
        document.getElementById('onsite-capture-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleOnsiteSubmit(meter.id, cycleId);
        });

        // Meter type toggle
        document.querySelectorAll('.meter-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.meter-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Attach real-time validation
        document.getElementById('onsite-reading').addEventListener('input', () => {
            this.validateOnsiteReading(meter.id);
        });

        const meterReplacedToggle = document.getElementById('onsite-meter-replaced-toggle');
        const overrideInput = document.getElementById('onsite-previous-reading-override');
        const overrideGroup = document.getElementById('onsite-override-previous-group');

        if (meterReplacedToggle && overrideInput && overrideGroup) {
            meterReplacedToggle.addEventListener('change', () => {
                overrideInput.disabled = meterReplacedToggle.checked;
                overrideGroup.style.opacity = meterReplacedToggle.checked ? '0.45' : '1';
                this.validateOnsiteReading(meter.id);
            });
            overrideInput.addEventListener('input', () => this.validateOnsiteReading(meter.id));
        }

        const photoInput = document.getElementById('onsite-photo');
        const noPhotoConfirm = document.getElementById('onsite-no-photo-confirm');
        const photoWarning = document.getElementById('onsite-photo-warning');

        if (photoInput && noPhotoConfirm && photoWarning) {
            photoInput.addEventListener('change', () => {
                if (photoInput.files && photoInput.files[0]) {
                    noPhotoConfirm.checked = false;
                    photoWarning.style.display = 'none';
                }
            });
            noPhotoConfirm.addEventListener('change', () => {
                if (noPhotoConfirm.checked) {
                    photoWarning.style.display = 'none';
                }
            });
        }
    },

    getEffectivePreviousReadingForOnsite(meter) {
        if (!meter) return 0;
        const meterReplacedToggle = document.getElementById('onsite-meter-replaced-toggle');
        if (meterReplacedToggle?.checked) {
            return 0;
        }

        const overrideInput = document.getElementById('onsite-previous-reading-override');
        if (overrideInput && overrideInput.value !== '') {
            const overrideValue = parseDecimalInput(overrideInput.value);
            if (!Number.isNaN(overrideValue)) {
                return overrideValue;
            }
        }

        return meter.last_reading || 0;
    },

    renderCapturePolicyHint(policyHint) {
        if (!policyHint || policyHint.capturePolicy === 'unknown') {
            return '';
        }

        const policyTextByType = {
            capture_required: 'Capture required',
            skip_allowed: 'Skip allowed',
            client_submitted: 'Client-submitted reading expected'
        };

        const policyText = policyTextByType[policyHint.capturePolicy] || 'Policy available';
        const className = policyHint.capturePolicy === 'capture_required' ? 'success' : 'warning';
        const reasonText = policyHint.skipReason
            ? `<div style="margin-top:0.35rem;"><strong>Workbook note:</strong> ${policyHint.skipReason}</div>`
            : '';
        const rationaleText = policyHint.rationale
            ? `<div style="margin-top:0.35rem;">${policyHint.rationale}</div>`
            : '';

        return `
            <div class="onsite-feedback-message ${className}" style="margin-bottom:0.75rem;">
                <strong>Capture policy:</strong> ${policyText}
                ${reasonText}
                ${rationaleText}
            </div>
        `;
    },

    /**
     * Validate reading in real-time (on-site friendly)
     */
    validateOnsiteReading(meterId) {
        const input = document.getElementById('onsite-reading');
        const feedback = document.getElementById('onsite-feedback');
        
        if (!input || !feedback) return;

        const value = input.value;
        if (!value) {
            feedback.innerHTML = '';
            return;
        }

        const meter = storage.get('meters', meterId);
        const reading = parseDecimalInput(value);
        
        if (isNaN(reading)) {
            feedback.innerHTML = '';
            return;
        }

        const lastReading = this.getEffectivePreviousReadingForOnsite(meter);
        const consumption = reading - lastReading;

        // Calculate expected range if history exists
        const avgConsumption = validation.getAverageConsumption(meterId, 3);
        
        let message = '';
        let className = 'info';

        let anomalyActive = false;

        if (reading < lastReading) {
            message = `⚠ Lower than last reading (${lastReading.toFixed(2)} kWh) — re-check the meter display now. If the number is correct, add a note below explaining why (e.g. meter replaced, rollover).`;
            className = 'warning';
            anomalyActive = true;
        } else if (consumption === 0 && lastReading > 0) {
            message = `ℹ No consumption detected. Confirm the meter display shows exactly this value, then add a note below (e.g. unit was vacant all month, meter disconnected).`;
            className = 'info';
            anomalyActive = true;
        } else if (avgConsumption > 0 && consumption > avgConsumption * 3) {
            message = `⚠ Much higher than usual — re-check the meter display now. If the number is correct, add a note below explaining why (e.g. estimated last cycle, known high-usage period).`;
            className = 'warning';
            anomalyActive = true;
        } else if (avgConsumption > 0) {
            const typicalLow = Math.round(avgConsumption * 0.7);
            const typicalHigh = Math.round(avgConsumption * 1.3);
            message = `✓ Consumption: ${consumption.toFixed(2)} kWh (typical: ${typicalLow}–${typicalHigh} kWh)`;
            className = 'success';
        } else {
            message = `✓ Consumption: ${consumption.toFixed(2)} kWh`;
            className = 'success';
        }

        onSiteMode._anomalyActive = anomalyActive;

        // Update notes field to signal that a note is required
        const notesEl = document.getElementById('onsite-notes');
        if (notesEl) {
            notesEl.placeholder = anomalyActive
                ? 'Required: Explain the unusual reading — e.g. "Meter display clearly shows 4821.7" or "Unit was vacant all month"'
                : 'Any observations about this meter...';
            notesEl.style.borderColor = anomalyActive ? '#ffc107' : '';
        }

        feedback.innerHTML = `<div class="onsite-feedback-message ${className}">${message}</div>`;
    },

    /**
     * Handle on-site reading submission
     */
    async handleOnsiteSubmit(meterId, cycleId) {
        const readingInput = document.getElementById('onsite-reading');
        const readingValue = parseDecimalInput(readingInput.value);
        const notes = document.getElementById('onsite-notes').value;
        const photoInput = document.getElementById('onsite-photo');
        const noPhotoConfirm = document.getElementById('onsite-no-photo-confirm');
        const photoWarning = document.getElementById('onsite-photo-warning');
        const meterReplacedToggle = document.getElementById('onsite-meter-replaced-toggle');
        const overrideInput = document.getElementById('onsite-previous-reading-override');

        // Optional meter corrections
        const correctedMeterNumber = (document.getElementById('onsite-meter-number')?.value || '').trim();
        const correctedUnitLabel = (document.getElementById('onsite-unit-label')?.value || '').trim();

        // Meter type identification (reader confirmation)
        const activeTypeBtn = document.querySelector('.meter-type-btn.active');
        const identifiedType = activeTypeBtn ? activeTypeBtn.dataset.type : null;

        if (Number.isNaN(readingValue)) {
            alert('Please enter a valid meter reading. Decimals like 1450.5 or 1450,5 are accepted.');
            readingInput.focus();
            return;
        }

        const hasPhoto = Boolean(photoInput && photoInput.files && photoInput.files[0]);
        if (!hasPhoto && !noPhotoConfirm?.checked) {
            if (photoWarning) {
                photoWarning.style.display = 'block';
            }
            return;
        }

        if (!hasPhoto && !notes.trim()) {
            alert('Please add a note when skipping photo capture.');
            const notesEl = document.getElementById('onsite-notes');
            if (notesEl) {
                notesEl.focus();
                notesEl.style.borderColor = '#dc3545';
            }
            return;
        }

        const meterReplaced = Boolean(meterReplacedToggle?.checked);
        if (!meterReplaced && overrideInput && overrideInput.value !== '') {
            const overrideValue = parseDecimalInput(overrideInput.value);
            if (Number.isNaN(overrideValue)) {
                alert('Please enter a valid previous reading override.');
                overrideInput.focus();
                return;
            }
        }

        // If the reading triggered an anomaly warning, a note is required before saving
        if (onSiteMode._anomalyActive && !notes.trim()) {
            const notesEl = document.getElementById('onsite-notes');
            if (notesEl) {
                notesEl.placeholder = 'Required: Explain the unusual reading — e.g. "Meter display clearly shows 4821.7" or "Unit was vacant all month"';
                notesEl.style.borderColor = '#dc3545';
                notesEl.focus();
            }
            alert('Please add a note explaining the unusual reading before saving.');
            return;
        }

        const meter = storage.get('meters', meterId);
        if (!meter) {
            alert('Meter not found');
            return;
        }

        const capturePolicyHint = getWorkbookCapturePolicyForMeter(meter, {
            buildingName: meter.building_name || ''
        });

        if (
            capturePolicyHint
            && (capturePolicyHint.capturePolicy === 'skip_allowed' || capturePolicyHint.capturePolicy === 'client_submitted')
            && !notes.trim()
        ) {
            alert('Please add a note when overriding the workbook capture policy with a manual reading.');
            const notesEl = document.getElementById('onsite-notes');
            if (notesEl) {
                notesEl.focus();
                notesEl.style.borderColor = '#dc3545';
            }
            return;
        }

        // Persist any corrections the reader made to the meter record
        const meterUpdates = {};
        if (correctedMeterNumber && correctedMeterNumber !== (meter.meter_number || '')) {
            meterUpdates.meter_number = correctedMeterNumber;
        }
        if (correctedUnitLabel && correctedUnitLabel !== (meter.location_description || '')) {
            meterUpdates.location_description = correctedUnitLabel;
        }
        if (Object.keys(meterUpdates).length > 0) {
            storage.update('meters', meterId, meterUpdates);
        }

        // Get current user
        const currentUser = window.auth ? window.auth.getCurrentUser() : null;
        const capturedBy = currentUser ? currentUser.name : 'Unknown User';
        const preparedPhoto = hasPhoto
            ? await preparePhotoForStorage(photoInput.files[0])
            : null;
        const photoPayload = preparedPhoto
            ? await persistReadingPhoto(preparedPhoto, {
                cycleId,
                meterId,
                readingId: `${cycleId}-${meterId}-${Date.now()}`,
                capturedAt: new Date().toISOString()
            })
            : { photo: '', photo_name: '', photo_storage_mode: '', photo_storage_path: '' };

        const overrideValue = overrideInput && overrideInput.value !== ''
            ? parseDecimalInput(overrideInput.value)
            : null;

        const policyFlags = [];
        const policyFields = {};
        if (capturePolicyHint) {
            policyFields.workbook_capture_policy = capturePolicyHint.capturePolicy;
            policyFields.workbook_policy_match_type = capturePolicyHint.matchType;
            policyFields.workbook_policy_confidence = capturePolicyHint.confidence;
            policyFields.workbook_policy_skip_reason = capturePolicyHint.skipReason || '';
            policyFields.workbook_policy_rationale = capturePolicyHint.rationale || '';
            policyFields.workbook_policy_source_row = capturePolicyHint.sourceRowIndex;

            if (capturePolicyHint.capturePolicy !== 'capture_required') {
                policyFlags.push({
                    type: 'policy-override',
                    severity: 'medium',
                    message: `Manual reading captured despite workbook policy: ${capturePolicyHint.capturePolicy}`,
                    description: capturePolicyHint.skipReason || 'Reader intentionally captured a reading for this meter.'
                });
            }
        }

        const readingBuildResult = buildCaptureReadingRecord({
            meter,
            cycleId,
            readingValue,
            readingDate: new Date().toISOString().split('T')[0],
            notes,
            capturedBy,
            capturedById: currentUser ? currentUser.id : null,
            photoPayload,
            hasPhoto,
            hadExistingPhoto: false,
            photoStorageFailed: false,
            meterReplaced,
            previousOverrideValue: Number.isNaN(overrideValue) ? null : overrideValue,
            previousOverrideSource: 'onsite_override',
            additionalFlags: policyFlags,
            additionalFields: {
                captured_at: new Date().toISOString(),
                ...policyFields
            }
        });

        const reading = readingBuildResult.reading;

        // Record meter type identification from reader
        if (identifiedType) {
            reading.meter_type_identified = identifiedType;
            if (identifiedType !== (meter.meter_type || 'UNIT')) {
                reading.flags.push({
                    type: 'meter_type_identified',
                    severity: 'info',
                    identified_type: identifiedType,
                    previous_type: meter.meter_type || null,
                    message: `Reader updated meter type: ${meter.meter_type || 'unknown'} → ${identifiedType}`
                });
            }
        }

        saveCaptureReading({
            existingReading: null,
            reading,
            meter,
            meterUpdateExtras: meterReplaced ? { meter_replaced_at: reading.reading_date } : {}
        });

        // Wait for all in-flight Firestore writes to land before re-rendering.
        // This ensures the reading is in Firestore before we move to the next meter,
        // so a lost connection or closed tab cannot silently drop a submitted reading.
        const submitBtn = document.querySelector('#onsite-capture-form [type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
        await storage.awaitSync();
        if (submitBtn) { submitBtn.disabled = false; }

        // Move to next meter
        const nextMeter = this.advanceQueue(cycleId);
        
        // Re-render
        this.renderOnSiteCapture('onsite-container', cycleId);
    },

    async skipMeter(meterId, cycleId, reason, notes) {
        const meter = storage.get('meters', meterId);
        if (!meter) return;

        const existingReading = storage.getReadings(cycleId).find((entry) => entry.meter_id === meterId);
        const currentUser = auth.getCurrentUser();
        const capturePolicyHint = getWorkbookCapturePolicyForMeter(meter, { buildingName: meter.building_name || '' });
        const policyConflict = capturePolicyHint && capturePolicyHint.capturePolicy === 'capture_required';
        const reading = {
            cycle_id: cycleId,
            meter_id: meterId,
            reading_value: meter.last_reading ?? null,
            reading_date: new Date().toISOString().split('T')[0],
            previous_reading: meter.last_reading ?? null,
            consumption: 0,
            notes,
            captured_by: currentUser ? currentUser.name : 'Unknown User',
            captured_by_id: currentUser ? currentUser.id : null,
            captured_at: new Date().toISOString(),
            review_status: 'pending',
            is_issue: true,
            is_skipped: true,
            issue_type: 'skipped',
            skipped_reason: reason,
            workbook_capture_policy: capturePolicyHint?.capturePolicy || null,
            workbook_policy_skip_reason: capturePolicyHint?.skipReason || '',
            workbook_policy_match_type: capturePolicyHint?.matchType || null,
            photo: existingReading?.photo || '',
            photo_name: existingReading?.photo_name || '',
            photo_storage_mode: existingReading?.photo_storage_mode || '',
            photo_storage_path: existingReading?.photo_storage_path || '',
            flags: [{
                type: 'skipped-meter',
                severity: 'medium',
                message: `Meter skipped: ${reason}`,
                description: notes
            }, ...(policyConflict ? [{
                type: 'capture-policy-conflict',
                severity: 'high',
                message: 'Meter skipped even though workbook policy expected capture_required',
                description: capturePolicyHint.skipReason || ''
            }] : [])]
        };

        if (existingReading) {
            storage.update('readings', existingReading.id, reading);
        } else {
            storage.create('readings', reading);
        }

        await storage.awaitSync();
        this.advanceQueue(cycleId);
        this.renderOnSiteCapture('onsite-container', cycleId);
    },

    showSkipMeterDialog(meterId, cycleId) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content onsite-issue-modal">
                <div class="modal-header">
                    <h3>Skip Meter</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Select why this meter is being skipped for this cycle.</p>
                    <form id="onsite-skip-form">
                        <div class="issue-options">
                            <label class="issue-option">
                                <input type="radio" name="skip-reason" value="known_blank" required>
                                <span>Known blank/no reading for this meter</span>
                            </label>
                            <label class="issue-option">
                                <input type="radio" name="skip-reason" value="client_submitted" required>
                                <span>Client/building provides this reading separately</span>
                            </label>
                            <label class="issue-option">
                                <input type="radio" name="skip-reason" value="inactive" required>
                                <span>Meter inactive/decommissioned</span>
                            </label>
                            <label class="issue-option">
                                <input type="radio" name="skip-reason" value="other" required>
                                <span>Other reason</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label for="skip-notes">Notes *</label>
                            <textarea id="skip-notes" rows="3" required placeholder="State exactly why this meter was skipped."></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                            <button type="submit" class="btn btn-warning">Skip Meter</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('onsite-skip-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const reason = document.querySelector('input[name="skip-reason"]:checked')?.value;
            const notes = (document.getElementById('skip-notes')?.value || '').trim();
            if (!reason) {
                alert('Select a skip reason.');
                return;
            }
            if (!notes) {
                alert('Please add notes for the skipped meter.');
                return;
            }

            modal.remove();
            await this.skipMeter(meterId, cycleId, reason, notes);
        });
    },

    /**
     * Show dialog to add a meter that isn't in the database
     */
    showAddUnlistedMeterDialog(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        if (!cycle) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content onsite-issue-modal">
                <div class="modal-header">
                    <h3>Add Unlisted Meter</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Fill in what you can see. At minimum, give us the unit label.</p>
                    <form id="add-meter-form">
                        <div class="form-group">
                            <label for="new-unit-label">Unit label (door / wall) *</label>
                            <input type="text" id="new-unit-label" required placeholder="e.g. Unit 7, Flat 12B, Shop 3" autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label for="new-meter-number">Meter number (on device)</label>
                            <input type="text" id="new-meter-number" placeholder="e.g. 87654321 — leave blank if not visible" autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label for="new-meter-reading">Meter reading (kWh) *</label>
                            <input type="text" id="new-meter-reading" required inputmode="decimal" autocomplete="off" placeholder="Enter reading">
                        </div>
                        <div class="form-group">
                            <label for="new-meter-notes">Notes (optional)</label>
                            <textarea id="new-meter-notes" rows="2" placeholder="Anything unusual about this meter..."></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Reading</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('add-meter-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const unitLabel = document.getElementById('new-unit-label').value.trim();
            const meterNumber = document.getElementById('new-meter-number').value.trim();
            const readingValue = parseDecimalInput(document.getElementById('new-meter-reading').value);
            const notes = document.getElementById('new-meter-notes').value.trim();

            if (!unitLabel) {
                alert('Unit label is required.');
                return;
            }
            if (Number.isNaN(readingValue)) {
                alert('Please enter a valid number for the meter reading.');
                return;
            }

            const currentUser = window.auth ? window.auth.getCurrentUser() : null;
            const slug = unitLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

            // Create a provisional meter under the scheme
            const provisionalMeter = {
                id: `meter-${cycle.scheme_id}-provisional-${slug}-${Date.now()}`,
                scheme_id: cycle.scheme_id,
                unit_id: null,
                meter_number: meterNumber || null,
                meter_type: 'UNIT',
                meter_role: 'unit',
                service_type: 'electricity',
                location_description: unitLabel,
                last_reading: readingValue,
                last_reading_date: new Date().toISOString().split('T')[0],
                provisional: true,
                provisional_added_by: currentUser ? currentUser.name : 'Unknown',
                provisional_added_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            storage.create('meters', provisionalMeter);

            // Create reading for it
            const reading = {
                cycle_id: cycleId,
                meter_id: provisionalMeter.id,
                reading_value: readingValue,
                reading_date: new Date().toISOString().split('T')[0],
                previous_reading: null,
                consumption: null,
                notes: notes,
                captured_by: currentUser ? currentUser.name : 'Unknown User',
                captured_by_id: currentUser ? currentUser.id : null,
                captured_at: new Date().toISOString(),
                review_status: 'pending',
                provisional: true,
                flags: [{
                    type: 'provisional_meter',
                    severity: 'medium',
                    message: `Provisional meter added on-site: ${unitLabel}`
                }]
            };
            storage.create('readings', reading);

            // Wait for Firestore writes before proceeding
            await storage.awaitSync();

            modal.remove();
            // Re-render to stay on current meter (unlisted meter doesn't advance the queue)
            this.renderOnSiteCapture('onsite-container', cycleId);
            // Brief confirmation
            const toast = document.createElement('div');
            toast.className = 'onsite-toast';
            toast.textContent = `✓ Unlisted meter saved (${unitLabel})`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        });
    },

    /**
     * Show issue dialog
     */
    showIssueDialog(meterId, cycleId) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content onsite-issue-modal">
                <div class="modal-header">
                    <h3>Flag an Issue</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Select the issue with this meter:</p>
                    <form id="issue-form">
                        <div class="issue-options">
                            <label class="issue-option">
                                <input type="radio" name="issue" value="inaccessible" required>
                                <span>Meter inaccessible</span>
                            </label>
                            <label class="issue-option">
                                <input type="radio" name="issue" value="damaged" required>
                                <span>Meter damaged</span>
                            </label>
                            <label class="issue-option">
                                <input type="radio" name="issue" value="unclear" required>
                                <span>Reading unclear</span>
                            </label>
                            <label class="issue-option">
                                <input type="radio" name="issue" value="other" required>
                                <span>Other issue</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label for="issue-notes">Notes *</label>
                            <textarea id="issue-notes" rows="3" required placeholder="Be specific — e.g. 'Meter box locked, no key on site' or 'Display cracked, digits 2–4 unreadable'"></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                            <button type="submit" class="btn btn-warning">Flag & Skip</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('issue-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const issueType = document.querySelector('input[name="issue"]:checked').value;
            const notes = document.getElementById('issue-notes').value;
            
            this.flagMeterIssue(meterId, cycleId, issueType, notes);
            modal.remove();

            // Wait for Firestore write before advancing
            await storage.awaitSync();
            
            // Move to next meter
            this.advanceQueue(cycleId);
            this.renderOnSiteCapture('onsite-container', cycleId);
        });
    },

    /**
     * Render completion screen
     */
    renderCompletionScreen(containerId, cycleId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const progress = this.getProgress(cycleId);
        const cycle = storage.get('cycles', cycleId);
        const scheme = cycle ? storage.get('schemes', cycle.scheme_id) : null;
        const queue = this.getReadingQueue(cycleId);
        const readings = storage.getReadings(cycleId);

        container.innerHTML = `
            <div class="onsite-completion-screen">
                <div class="completion-icon">✓</div>
                <h2>All Readings Captured</h2>
                <p class="completion-subtitle">You're done for this cycle.</p>

                <div class="completion-stats">
                    <div class="stat-item">
                        <div class="stat-value">${progress.readMeters}</div>
                        <div class="stat-label">Meters Read</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${scheme?.name || 'N/A'}</div>
                        <div class="stat-label">Scheme</div>
                    </div>
                </div>

                <div class="completion-buildings">
                    <h3>Buildings Completed</h3>
                    ${Object.entries(progress.buildingProgress).map(([building, stats]) => `
                        <div class="building-complete-item">
                            <span class="building-name">${building}</span>
                            <span class="building-stats">${stats.read} / ${stats.total} meters</span>
                        </div>
                    `).join('')}
                </div>

                <div class="completion-buildings">
                    <h3>Reading Summary</h3>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Meter Number</th>
                                    <th>Meter Name</th>
                                    <th>Reading</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${queue.map(meter => {
                                    const reading = readings.find(entry => entry.meter_id === meter.id);
                                    return `
                                        <tr>
                                            <td>${meter.meter_number}</td>
                                            <td>${meter.building_name} - Unit ${meter.unit_number}</td>
                                            <td>${reading ? reading.reading_value : '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="completion-actions">
                    <button class="btn btn-primary btn-large" onclick="onSiteMode.exitOnsiteMode()">
                        Exit On-Site Mode
                    </button>
                    <a href="reading-cycle.html" class="btn btn-secondary">
                        Edit Captured Readings
                    </a>
                    <a href="review.html" class="btn btn-secondary">
                        Review Flagged Readings
                    </a>
                </div>
            </div>
        `;
    },

    /**
     * Exit on-site mode
     */
    exitOnsiteMode() {
        if (confirm('Exit on-site reading mode?')) {
            this.deactivate();
            window.location.href = 'index.html';
        }
    }
};

// Make available globally
window.onSiteMode = onSiteMode;
