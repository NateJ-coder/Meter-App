/**
 * reading-capture-enhanced.js - Enhanced Reading Capture with Expected Ranges
 * Reduces interpretation stress, increases confidence
 */

import { storage } from './storage.js';
import { validation } from './validation.js';

export const readingCaptureEnhanced = {
    /**
     * Get expected consumption range for a meter
     */
    getExpectedRange(meterId) {
        const meter = storage.get('meters', meterId);
        if (!meter) return null;

        // Calculate average from last 3 cycles
        const avgConsumption = validation.getAverageConsumption(meterId, 3);
        
        if (avgConsumption === 0) {
            // No history - provide generic guidance
            return {
                hasHistory: false,
                typicalLow: null,
                typicalHigh: null,
                message: 'No historical data yet'
            };
        }

        // Expected range: ±30% of average
        const typicalLow = Math.round(avgConsumption * 0.7);
        const typicalHigh = Math.round(avgConsumption * 1.3);

        return {
            hasHistory: true,
            average: Math.round(avgConsumption),
            typicalLow,
            typicalHigh,
            message: `Typical usage: ${typicalLow}–${typicalHigh} kWh`
        };
    },

    /**
     * Get expected reading value (last reading + typical consumption)
     */
    getExpectedReading(meterId) {
        const meter = storage.get('meters', meterId);
        if (!meter || !meter.last_reading) return null;

        const range = this.getExpectedRange(meterId);
        if (!range || !range.hasHistory) return null;

        return {
            expectedLow: Math.round(meter.last_reading + range.typicalLow),
            expectedHigh: Math.round(meter.last_reading + range.typicalHigh),
            message: `Expected reading: ${Math.round(meter.last_reading + range.typicalLow)}–${Math.round(meter.last_reading + range.typicalHigh)}`
        };
    },

    /**
     * Validate reading in real-time and provide contextual feedback
     */
    validateInRealTime(meterId, readingValue) {
        const meter = storage.get('meters', meterId);
        if (!meter) return { valid: false, message: 'Meter not found' };

        const reading = parseFloat(readingValue);
        if (isNaN(reading)) {
            return { 
                valid: false, 
                severity: 'error',
                message: 'Please enter a valid number' 
            };
        }

        const lastReading = meter.last_reading || 0;
        const consumption = reading - lastReading;
        const range = this.getExpectedRange(meterId);

        // Backward reading
        if (reading < lastReading) {
            return {
                valid: true, // Still allow submission
                severity: 'high',
                flag: 'backward',
                message: 'Lower than previous reading. This will be flagged for review.',
                context: `Previous: ${lastReading.toFixed(2)} → Current: ${reading.toFixed(2)}`
            };
        }

        // Zero consumption
        if (consumption === 0 && lastReading > 0) {
            return {
                valid: true,
                severity: 'medium',
                flag: 'zero-consumption',
                message: 'No consumption detected. That\'s okay — it\'ll be reviewed.',
                context: 'Reading unchanged from last month'
            };
        }

        // Same as last reading
        if (reading === lastReading) {
            return {
                valid: true,
                severity: 'medium',
                flag: 'unchanged',
                message: 'Same as last reading. That\'s okay — it\'ll be reviewed.',
                context: 'No change detected'
            };
        }

        // Check against expected range
        if (range && range.hasHistory) {
            // Very high consumption (>3x average)
            if (consumption > range.average * 3) {
                return {
                    valid: true,
                    severity: 'high',
                    flag: 'spike',
                    message: 'Much higher than usual. That\'s okay — it\'ll be reviewed.',
                    context: `Consumption: ${consumption.toFixed(2)} kWh (usual: ~${range.average} kWh)`
                };
            }

            // High but within 3x
            if (consumption > range.typicalHigh) {
                return {
                    valid: true,
                    severity: 'low',
                    flag: 'above-typical',
                    message: 'Higher than typical usage',
                    context: `Consumption: ${consumption.toFixed(2)} kWh (typical: ${range.typicalLow}–${range.typicalHigh} kWh)`
                };
            }

            // Low consumption
            if (consumption < range.typicalLow && consumption > 0) {
                return {
                    valid: true,
                    severity: 'low',
                    flag: 'below-typical',
                    message: 'Lower than typical usage',
                    context: `Consumption: ${consumption.toFixed(2)} kWh (typical: ${range.typicalLow}–${range.typicalHigh} kWh)`
                };
            }

            // Within expected range
            return {
                valid: true,
                severity: 'none',
                flag: null,
                message: '✓ Within typical range',
                context: `Consumption: ${consumption.toFixed(2)} kWh`
            };
        }

        // No history - just accept it
        return {
            valid: true,
            severity: 'none',
            flag: null,
            message: '✓ Reading accepted',
            context: `Consumption: ${consumption.toFixed(2)} kWh`
        };
    },

    /**
     * Render enhanced reading capture modal
     */
    renderCaptureModal(meterId, cycleId) {
        const meter = storage.get('meters', meterId);
        if (!meter) return null;

        const unit = storage.get('units', meter.unit_id);
        const building = unit ? storage.get('buildings', unit.building_id) : null;
        const range = this.getExpectedRange(meterId);
        const expectedReading = this.getExpectedReading(meterId);

        // Check if already captured
        const existingReading = storage.getReadings(cycleId)
            .find(r => r.meter_id === meterId);

        return `
            <div class="modal-overlay" onclick="closeReadingModal(event)">
                <div class="modal-content reading-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Capture Reading</h2>
                        <button class="close-btn" onclick="closeReadingModal()">&times;</button>
                    </div>

                    <div class="modal-body">
                        <!-- Meter Info -->
                        <div class="meter-info-card">
                            <div class="meter-details">
                                <div class="meter-number">${meter.meter_number}</div>
                                <div class="meter-location">
                                    ${building ? building.name : ''} 
                                    ${unit ? `• Unit ${unit.unit_number}` : ''}
                                </div>
                            </div>
                            ${meter.last_reading != null ? `
                                <div class="last-reading-badge">
                                    Last: ${meter.last_reading.toFixed(2)} kWh
                                </div>
                            ` : ''}
                        </div>

                        <!-- Expected Range -->
                        ${range && range.hasHistory ? `
                            <div class="expected-range-card">
                                <div class="range-icon">📊</div>
                                <div class="range-info">
                                    <div class="range-title">Expected Usage</div>
                                    <div class="range-value">${range.typicalLow}–${range.typicalHigh} kWh</div>
                                </div>
                            </div>
                        ` : `
                            <div class="expected-range-card no-history">
                                <div class="range-icon">💡</div>
                                <div class="range-info">
                                    <div class="range-title">First Reading</div>
                                    <div class="range-value">No historical data yet</div>
                                </div>
                            </div>
                        `}

                        ${expectedReading ? `
                            <div class="expected-reading-hint">
                                <span class="hint-icon">💡</span>
                                ${expectedReading.message}
                            </div>
                        ` : ''}

                        <!-- Reading Input -->
                        <form id="capture-reading-form" onsubmit="return submitEnhancedReading(event, '${meterId}', '${cycleId}')">
                            <div class="form-group">
                                <label for="reading-value">Meter Reading (kWh) *</label>
                                <input 
                                    type="number" 
                                    id="reading-value" 
                                    step="0.01" 
                                    required 
                                    autofocus
                                    ${existingReading ? `value="${existingReading.reading_value}"` : ''}
                                    oninput="validateReadingInRealTime('${meterId}')"
                                    placeholder="${meter.last_reading != null ? `> ${meter.last_reading.toFixed(2)}` : 'Enter reading'}"
                                >
                            </div>

                            <!-- Real-time Validation Feedback -->
                            <div id="validation-feedback" class="validation-feedback"></div>

                            <div class="form-group">
                                <label for="reading-date">Reading Date *</label>
                                <input 
                                    type="date" 
                                    id="reading-date" 
                                    required
                                    value="${existingReading ? existingReading.reading_date : new Date().toISOString().split('T')[0]}"
                                >
                            </div>

                            <div class="form-group">
                                <label for="reading-notes">Notes (optional)</label>
                                <textarea 
                                    id="reading-notes" 
                                    rows="2" 
                                    placeholder="Any observations..."
                                >${existingReading ? (existingReading.notes || '') : ''}</textarea>
                            </div>

                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="closeReadingModal()">Cancel</button>
                                <button type="submit" class="btn btn-primary">
                                    ${existingReading ? 'Update Reading' : 'Save Reading'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Get visual status for a reading (for list views)
     */
    getReadingStatus(reading) {
        if (!reading) {
            return {
                class: 'not-captured',
                icon: '○',
                label: 'Not captured',
                color: '#999'
            };
        }

        if (!reading.flags || reading.flags.length === 0) {
            return {
                class: 'captured',
                icon: '●',
                label: 'Captured',
                color: '#4CAF50'
            };
        }

        const hasHighSeverity = reading.flags.some(f => f.severity === 'high');
        
        if (hasHighSeverity) {
            return {
                class: 'needs-attention',
                icon: '●',
                label: 'Needs attention',
                color: '#f44336'
            };
        }

        return {
            class: 'needs-review',
            icon: '●',
            label: 'Needs review',
            color: '#ff9800'
        };
    },

    /**
     * Render status indicator
     */
    renderStatusIndicator(reading) {
        const status = this.getReadingStatus(reading);
        return `
            <span class="reading-status ${status.class}" title="${status.label}">
                <span class="status-icon" style="color: ${status.color}">${status.icon}</span>
                <span class="status-label">${status.label}</span>
            </span>
        `;
    }
};

// Make functions available globally
window.readingCaptureEnhanced = readingCaptureEnhanced;

window.validateReadingInRealTime = function(meterId) {
    const input = document.getElementById('reading-value');
    const feedback = document.getElementById('validation-feedback');
    
    if (!input || !feedback) return;

    const value = input.value;
    if (!value) {
        feedback.innerHTML = '';
        return;
    }

    const result = readingCaptureEnhanced.validateInRealTime(meterId, value);
    
    const severityClass = {
        'error': 'error',
        'high': 'warning',
        'medium': 'info',
        'low': 'info',
        'none': 'success'
    }[result.severity] || 'info';

    feedback.innerHTML = `
        <div class="feedback-message ${severityClass}">
            <div class="feedback-icon">
                ${result.severity === 'error' ? '✗' : 
                  result.severity === 'high' ? '⚠' : 
                  result.severity === 'medium' ? 'ℹ' : 
                  result.severity === 'none' ? '✓' : 'ℹ'}
            </div>
            <div class="feedback-content">
                <div class="feedback-main">${result.message}</div>
                ${result.context ? `<div class="feedback-context">${result.context}</div>` : ''}
            </div>
        </div>
    `;
};

window.submitEnhancedReading = function(event, meterId, cycleId) {
    event.preventDefault();
    
    const readingValue = parseFloat(document.getElementById('reading-value').value);
    const readingDate = document.getElementById('reading-date').value;
    const notes = document.getElementById('reading-notes').value;

    // Validate
    const validation = readingCaptureEnhanced.validateInRealTime(meterId, readingValue);
    if (!validation.valid) {
        alert(validation.message);
        return false;
    }

    // Create reading object
    const meter = storage.get('meters', meterId);
    const reading = {
        id: Date.now().toString(),
        cycle_id: cycleId,
        meter_id: meterId,
        reading_value: readingValue,
        reading_date: readingDate,
        previous_reading: meter.last_reading,
        consumption: readingValue - (meter.last_reading || 0),
        notes: notes,
        captured_at: new Date().toISOString(),
        review_status: 'PENDING'
    };

    // Add flags based on validation
    reading.flags = [];
    
    // Run full validation
    const fullFlags = window.validation.validateReading(reading);
    reading.flags = fullFlags;

    // Determine review status
    if (fullFlags.some(f => f.severity === 'high')) {
        reading.review_status = 'ATTENTION';
    } else if (fullFlags.length > 0) {
        reading.review_status = 'REVIEW';
    } else {
        reading.review_status = 'OK';
    }

    // Save reading
    storage.save('readings', reading);

    // Update meter's last reading
    meter.last_reading = readingValue;
    meter.last_reading_date = readingDate;
    storage.save('meters', meter);

    // Close modal and reload page
    window.closeReadingModal();
    location.reload();

    return false;
};

window.closeReadingModal = function(event) {
    if (event && event.target.className !== 'modal-overlay') {
        return;
    }
    
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
};
