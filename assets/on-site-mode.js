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
                </div>

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
                            placeholder="${meter.last_reading ? `Greater than ${meter.last_reading.toFixed(2)}` : 'Enter reading'}"
                            class="onsite-input-large"
                        >
                    </div>

                    <!-- Live Feedback -->
                    <div id="onsite-feedback" class="onsite-feedback"></div>

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
                            placeholder="Any observations about this meter..."
                            class="onsite-textarea"
                        ></textarea>
                    </div>

                    <div class="form-group">
                        <label for="onsite-photo">Meter Photo (optional)</label>
                        <input 
                            type="file"
                            id="onsite-photo"
                            accept="image/*"
                            capture="environment"
                            class="reader-input"
                        >
                    </div>

                    <!-- Primary Actions -->
                    <div class="onsite-actions-primary">
                        <button type="submit" class="btn btn-primary btn-large onsite-submit">
                            Save & Next →
                        </button>
                    </div>

                    <!-- Secondary Actions -->
                    <div class="onsite-actions-secondary">
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

        // Attach real-time validation
        document.getElementById('onsite-reading').addEventListener('input', () => {
            this.validateOnsiteReading(meter.id);
        });
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

        const lastReading = meter.last_reading || 0;
        const consumption = reading - lastReading;

        // Calculate expected range if history exists
        const avgConsumption = validation.getAverageConsumption(meterId, 3);
        
        let message = '';
        let className = 'info';

        if (reading < lastReading) {
            message = `⚠ This reading is lower than the previous (${lastReading.toFixed(2)} kWh). That's okay — it will be reviewed.`;
            className = 'warning';
        } else if (consumption === 0 && lastReading > 0) {
            message = `ℹ No consumption detected. That's okay — it will be reviewed.`;
            className = 'info';
        } else if (avgConsumption > 0 && consumption > avgConsumption * 3) {
            message = `⚠ This reading is much higher than usual. That's okay — it will be reviewed.`;
            className = 'warning';
        } else if (avgConsumption > 0) {
            const typicalLow = Math.round(avgConsumption * 0.7);
            const typicalHigh = Math.round(avgConsumption * 1.3);
            message = `✓ Consumption: ${consumption.toFixed(2)} kWh (typical range: ${typicalLow}–${typicalHigh} kWh)`;
            className = 'success';
        } else {
            message = `✓ Consumption: ${consumption.toFixed(2)} kWh`;
            className = 'success';
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

        // Optional meter corrections
        const correctedMeterNumber = (document.getElementById('onsite-meter-number')?.value || '').trim();
        const correctedUnitLabel = (document.getElementById('onsite-unit-label')?.value || '').trim();

        if (Number.isNaN(readingValue)) {
            alert('Please enter a valid meter reading. Decimals like 1450.5 or 1450,5 are accepted.');
            readingInput.focus();
            return;
        }

        const meter = storage.get('meters', meterId);
        if (!meter) {
            alert('Meter not found');
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
        const preparedPhoto = photoInput && photoInput.files && photoInput.files[0]
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

        // Create reading
        const reading = {
            cycle_id: cycleId,
            meter_id: meterId,
            reading_value: readingValue,
            reading_date: new Date().toISOString().split('T')[0],
            previous_reading: meter.last_reading,
            consumption: readingValue - (meter.last_reading || 0),
            notes: notes,
            captured_by: capturedBy,
            captured_by_id: currentUser ? currentUser.id : null,
            photo: photoPayload.photo,
            photo_name: photoPayload.photo_name,
            photo_storage_mode: photoPayload.photo_storage_mode,
            photo_storage_path: photoPayload.photo_storage_path,
            captured_at: new Date().toISOString(),
            review_status: 'pending'
        };

        // Validate and add flags
        reading.flags = validation.validateReading(reading);

        // Save reading
        storage.create('readings', reading);

        // Update meter
        storage.update('meters', meter.id, {
            last_reading: readingValue,
            last_reading_date: reading.reading_date
        });

        // Move to next meter
        const nextMeter = this.advanceQueue(cycleId);
        
        // Re-render
        this.renderOnSiteCapture('onsite-container', cycleId);
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

        document.getElementById('add-meter-form').addEventListener('submit', (e) => {
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
                            <textarea id="issue-notes" rows="3" required placeholder="Describe the issue..."></textarea>
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

        document.getElementById('issue-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const issueType = document.querySelector('input[name="issue"]:checked').value;
            const notes = document.getElementById('issue-notes').value;
            
            this.flagMeterIssue(meterId, cycleId, issueType, notes);
            modal.remove();
            
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
