/**
 * on-site-mode.js - Guided On-Site Reading Mode
 * Transforms capture from navigation → conveyor belt
 * For field workers: "Here's the next meter. Capture it. Move on."
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { auth } from './auth.js';

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
        const reading = {
            id: Date.now().toString(),
            cycle_id: cycleId,
            meter_id: meterId,
            reading_value: meter.last_reading || 0, // Use last reading as placeholder
            reading_date: new Date().toISOString().split('T')[0],
            previous_reading: meter.last_reading,
            consumption: 0,
            notes: notes || '',
            captured_at: new Date().toISOString(),
            review_status: 'ATTENTION',
            is_issue: true,
            issue_type: issueType,
            flags: [{
                type: 'issue',
                severity: 'high',
                message: `Meter issue: ${issueType}`
            }]
        };

        storage.save('readings', reading);
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

                <!-- Instructions -->
                <div class="onsite-instructions">
                    <h3>What to do</h3>
                    <ol>
                        <li>Confirm the meter number matches: <strong>${meter.meter_number}</strong></li>
                        <li>Read the number displayed on the meter</li>
                        <li>Take a photo of the meter display (optional but encouraged)</li>
                        <li>Enter the reading below</li>
                    </ol>
                </div>

                <!-- Capture Form -->
                <form id="onsite-capture-form" class="onsite-capture-form">
                    <div class="form-group">
                        <label for="onsite-reading">Meter Reading (kWh) *</label>
                        <input 
                            type="number" 
                            id="onsite-reading" 
                            step="0.01" 
                            required 
                            autofocus
                            inputmode="decimal"
                            placeholder="${meter.last_reading ? `Greater than ${meter.last_reading.toFixed(2)}` : 'Enter reading'}"
                            class="onsite-input-large"
                        >
                    </div>

                    <!-- Live Feedback -->
                    <div id="onsite-feedback" class="onsite-feedback"></div>

                    <div class="form-group">
                        <label for="onsite-notes">Notes (optional)</label>
                        <textarea 
                            id="onsite-notes" 
                            rows="2" 
                            placeholder="Any observations about this meter..."
                            class="onsite-textarea"
                        ></textarea>
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
        const reading = parseFloat(value);
        
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
    handleOnsiteSubmit(meterId, cycleId) {
        const readingValue = parseFloat(document.getElementById('onsite-reading').value);
        const notes = document.getElementById('onsite-notes').value;

        const meter = storage.get('meters', meterId);
        if (!meter) {
            alert('Meter not found');
            return;
        }

        // Get current user
        const currentUser = window.auth ? window.auth.getCurrentUser() : null;
        const capturedBy = currentUser ? currentUser.name : 'Unknown User';

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
            photo: 'On-site capture',
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

                <div class="completion-actions">
                    <button class="btn btn-primary btn-large" onclick="onSiteMode.exitOnsiteMode()">
                        Exit On-Site Mode
                    </button>
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
