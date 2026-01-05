/**
 * cycle-close-ritual.js - Pre-close Validation Summary
 * Makes closing a cycle feel like sealing an envelope
 */

import { storage } from './storage.js';
import { validation } from './validation.js';

export const cycleCloseRitual = {
    /**
     * Get comprehensive cycle closure readiness
     */
    getClosureReadiness(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        if (!cycle) return null;

        const scheme = storage.get('schemes', cycle.scheme_id);
        const meters = storage.getMeters(cycle.scheme_id).filter(m => m.meter_type === 'UNIT');
        const readings = storage.getReadings(cycleId);
        const missingReadings = validation.getMissingReadings(cycleId);
        const flagsSummary = validation.getCycleFlagsSummary(cycleId);

        // Calculate readiness
        const totalUnits = meters.length;
        const unitsRead = readings.length;
        const completionRate = totalUnits > 0 ? (unitsRead / totalUnits) * 100 : 0;

        // Determine if ready to close
        const isComplete = unitsRead === totalUnits;
        const hasHighFlags = readings.some(r => 
            r.flags && r.flags.some(f => f.severity === 'high')
        );

        const unreviewedFlags = readings.filter(r => 
            r.flags && r.flags.length > 0 && r.review_status === 'PENDING'
        );

        return {
            cycle,
            scheme,
            totalUnits,
            unitsRead,
            unitsNotRead: totalUnits - unitsRead,
            completionRate: Math.round(completionRate),
            isComplete,
            missingReadings,
            flaggedReadings: flagsSummary.flagged,
            flagsByType: flagsSummary.by_type,
            hasHighFlags,
            unreviewedFlags: unreviewedFlags.length,
            canClose: true, // Can always close, but with warnings
            shouldWarn: !isComplete || hasHighFlags || unreviewedFlags.length > 0
        };
    },

    /**
     * Render cycle closure modal
     */
    renderClosureModal(cycleId) {
        const readiness = this.getClosureReadiness(cycleId);
        if (!readiness) return null;

        const statusIcon = readiness.isComplete ? '✓' : '⚠';
        const statusClass = readiness.isComplete ? 'complete' : 'incomplete';

        return `
            <div class="modal-overlay" onclick="closeCycleModal(event)">
                <div class="modal-content cycle-close-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Close Reading Cycle</h2>
                        <button class="close-btn" onclick="closeCycleModal()">&times;</button>
                    </div>

                    <div class="modal-body">
                        <!-- Cycle Info -->
                        <div class="cycle-info-header">
                            <div class="cycle-details">
                                <h3>${readiness.scheme.name}</h3>
                                <p class="text-muted">${readiness.cycle.start_date} to ${readiness.cycle.end_date}</p>
                            </div>
                        </div>

                        <!-- Completion Status -->
                        <div class="closure-status ${statusClass}">
                            <div class="status-icon-large">${statusIcon}</div>
                            <div class="status-content">
                                <h3>${readiness.isComplete ? 'Cycle Complete' : 'Cycle Incomplete'}</h3>
                                <p>${readiness.unitsRead} of ${readiness.totalUnits} units read (${readiness.completionRate}%)</p>
                            </div>
                        </div>

                        <!-- Progress Bar -->
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${readiness.completionRate}%"></div>
                        </div>

                        <!-- Closure Summary -->
                        <div class="closure-summary">
                            <h4>Summary</h4>
                            
                            <!-- Units Read -->
                            <div class="summary-item ${readiness.isComplete ? 'success' : 'warning'}">
                                <div class="summary-icon">
                                    ${readiness.isComplete ? '✓' : '⚠'}
                                </div>
                                <div class="summary-content">
                                    <div class="summary-label">Units Read</div>
                                    <div class="summary-value">${readiness.unitsRead} / ${readiness.totalUnits}</div>
                                </div>
                            </div>

                            <!-- Missing Readings -->
                            ${readiness.unitsNotRead > 0 ? `
                                <div class="summary-item warning expandable">
                                    <div class="summary-icon">⚠</div>
                                    <div class="summary-content">
                                        <div class="summary-label">Missing Readings</div>
                                        <div class="summary-value">${readiness.unitsNotRead} units</div>
                                        <button 
                                            class="expand-btn" 
                                            onclick="toggleMissingReadings()"
                                        >
                                            Show details ▼
                                        </button>
                                    </div>
                                </div>
                                <div id="missing-readings-list" class="expandable-content" style="display: none;">
                                    <ul>
                                        ${readiness.missingReadings.slice(0, 10).map(meter => {
                                            const unit = storage.get('units', meter.unit_id);
                                            const building = unit ? storage.get('buildings', unit.building_id) : null;
                                            return `
                                                <li>
                                                    ${meter.meter_number} 
                                                    ${unit ? `• Unit ${unit.unit_number}` : ''}
                                                    ${building ? `• ${building.name}` : ''}
                                                </li>
                                            `;
                                        }).join('')}
                                        ${readiness.missingReadings.length > 10 ? 
                                            `<li class="text-muted">... and ${readiness.missingReadings.length - 10} more</li>` 
                                        : ''}
                                    </ul>
                                    <p class="text-muted">These readings can still be added after closing (marked as late).</p>
                                </div>
                            ` : `
                                <div class="summary-item success">
                                    <div class="summary-icon">✓</div>
                                    <div class="summary-content">
                                        <div class="summary-label">Missing Readings</div>
                                        <div class="summary-value">None</div>
                                    </div>
                                </div>
                            `}

                            <!-- Flagged Readings -->
                            ${readiness.flaggedReadings > 0 ? `
                                <div class="summary-item ${readiness.hasHighFlags ? 'warning' : 'info'} expandable">
                                    <div class="summary-icon">
                                        ${readiness.hasHighFlags ? '⚠' : 'ℹ'}
                                    </div>
                                    <div class="summary-content">
                                        <div class="summary-label">Flagged Readings</div>
                                        <div class="summary-value">${readiness.flaggedReadings} readings</div>
                                        <button 
                                            class="expand-btn" 
                                            onclick="toggleFlaggedReadings()"
                                        >
                                            Show details ▼
                                        </button>
                                    </div>
                                </div>
                                <div id="flagged-readings-list" class="expandable-content" style="display: none;">
                                    <ul>
                                        ${Object.entries(readiness.flagsByType).map(([type, count]) => `
                                            <li>${count} × ${type.replace(/-/g, ' ')}</li>
                                        `).join('')}
                                    </ul>
                                    ${readiness.unreviewedFlags > 0 ? `
                                        <p class="text-warning">
                                            <strong>${readiness.unreviewedFlags} flagged readings need review.</strong><br>
                                            You can review them in the <a href="review.html">Review page</a>.
                                        </p>
                                    ` : `
                                        <p class="text-success">All flagged readings have been reviewed.</p>
                                    `}
                                </div>
                            ` : `
                                <div class="summary-item success">
                                    <div class="summary-icon">✓</div>
                                    <div class="summary-content">
                                        <div class="summary-label">Flagged Readings</div>
                                        <div class="summary-value">None</div>
                                    </div>
                                </div>
                            `}
                        </div>

                        <!-- Warnings -->
                        ${readiness.shouldWarn ? `
                            <div class="closure-warnings">
                                <h4>⚠ Before You Close</h4>
                                <ul>
                                    ${!readiness.isComplete ? `
                                        <li>This cycle has ${readiness.unitsNotRead} missing readings. They can still be added later, but will be marked as late.</li>
                                    ` : ''}
                                    ${readiness.hasHighFlags ? `
                                        <li>Some readings have high-severity flags that may need attention.</li>
                                    ` : ''}
                                    ${readiness.unreviewedFlags > 0 ? `
                                        <li>${readiness.unreviewedFlags} flagged readings haven't been reviewed yet.</li>
                                    ` : ''}
                                </ul>
                                <p class="text-muted">You can still close the cycle — these are just reminders.</p>
                            </div>
                        ` : `
                            <div class="closure-ready">
                                <h4>✓ Ready to Close</h4>
                                <p>This cycle is complete and all readings have been captured.</p>
                            </div>
                        `}

                        <!-- Confirmation -->
                        <div class="closure-confirmation">
                            <p><strong>Closing this cycle will:</strong></p>
                            <ul>
                                <li>✓ Lock all readings (no more changes)</li>
                                <li>✓ Make data available for export</li>
                                <li>✓ Allow you to open the next cycle</li>
                            </ul>
                        </div>

                        <!-- Actions -->
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeCycleModal()">
                                Cancel
                            </button>
                            ${!readiness.isComplete ? `
                                <button type="button" class="btn btn-secondary" onclick="goToCaptureReadings()">
                                    ← Capture Missing Readings
                                </button>
                            ` : ''}
                            ${readiness.unreviewedFlags > 0 ? `
                                <button type="button" class="btn btn-secondary" onclick="goToReview()">
                                    Review Flags
                                </button>
                            ` : ''}
                            <button 
                                type="button" 
                                class="btn ${readiness.shouldWarn ? 'btn-warning' : 'btn-primary'}"
                                onclick="confirmCloseCycle('${cycleId}')"
                            >
                                ${readiness.shouldWarn ? 'Close Anyway' : 'Close Cycle'} →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Show closure modal
     */
    showClosureModal(cycleId) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        // Create and show new modal
        const modalHTML = this.renderClosureModal(cycleId);
        if (modalHTML) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    }
};

// Make functions available globally
window.cycleCloseRitual = cycleCloseRitual;

window.closeCycleModal = function(event) {
    if (event && event.target.className !== 'modal-overlay') {
        return;
    }
    
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
};

window.toggleMissingReadings = function() {
    const list = document.getElementById('missing-readings-list');
    const btn = event.target;
    
    if (list.style.display === 'none') {
        list.style.display = 'block';
        btn.textContent = 'Hide details ▲';
    } else {
        list.style.display = 'none';
        btn.textContent = 'Show details ▼';
    }
};

window.toggleFlaggedReadings = function() {
    const list = document.getElementById('flagged-readings-list');
    const btn = event.target;
    
    if (list.style.display === 'none') {
        list.style.display = 'block';
        btn.textContent = 'Hide details ▲';
    } else {
        list.style.display = 'none';
        btn.textContent = 'Show details ▼';
    }
};

window.goToCaptureReadings = function() {
    window.location.href = 'reading-cycle.html#capture';
};

window.goToReview = function() {
    window.location.href = 'review.html';
};

window.confirmCloseCycle = function(cycleId) {
    const readiness = cycleCloseRitual.getClosureReadiness(cycleId);
    
    let confirmMessage = 'Are you sure you want to close this reading cycle?';
    
    if (readiness.shouldWarn) {
        confirmMessage = `⚠ This cycle is incomplete or has unreviewed flags.\n\n`;
        if (readiness.unitsNotRead > 0) {
            confirmMessage += `• ${readiness.unitsNotRead} missing readings\n`;
        }
        if (readiness.unreviewedFlags > 0) {
            confirmMessage += `• ${readiness.unreviewedFlags} unreviewed flags\n`;
        }
        confirmMessage += `\nAre you sure you want to close it?`;
    }
    
    if (confirm(confirmMessage)) {
        // Close the cycle
        const cycle = storage.get('cycles', cycleId);
        cycle.status = 'CLOSED';
        cycle.closed_at = new Date().toISOString();
        storage.save('cycles', cycle);
        
        // Update onboarding state if this is first cycle
        if (window.onboarding) {
            const state = window.onboarding.getState();
            state.firstCycleClosed = true;
            window.onboarding.setState(state);
        }
        
        alert('✓ Cycle closed successfully!');
        window.closeCycleModal();
        location.reload();
    }
};
