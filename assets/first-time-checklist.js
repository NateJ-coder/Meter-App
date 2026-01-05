/**
 * first-time-checklist.js - Progress Tracker for First-Time Setup
 * Turns onboarding into momentum, disappears when complete
 */

import { storage } from './storage.js';
import { onboarding } from './onboarding.js';

export const firstTimeChecklist = {
    /**
     * Check if checklist should be shown
     */
    shouldShow() {
        const state = onboarding.getState();
        if (state.completed) return false;

        // Show if onboarding has been started
        const hasAnyData = storage.getAll('schemes').length > 0 ||
                          storage.getAll('buildings').length > 0 ||
                          storage.getAll('units').length > 0 ||
                          storage.getAll('meters').length > 0 ||
                          storage.getAll('cycles').length > 0;

        return hasAnyData;
    },

    /**
     * Get checklist progress
     */
    getProgress() {
        return onboarding.getProgress();
    },

    /**
     * Render checklist widget
     */
    renderChecklist(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!this.shouldShow()) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        const progress = this.getProgress();
        const percentage = onboarding.getCompletionPercentage();
        const isComplete = percentage === 100;

        container.style.display = 'block';
        container.innerHTML = `
            <div class="first-time-checklist">
                <div class="checklist-header">
                    <h3>🚀 Getting Started</h3>
                    <div class="checklist-progress">
                        <span class="progress-text">${percentage}% Complete</span>
                        ${isComplete ? `
                            <button class="dismiss-btn" onclick="dismissChecklist()" title="Dismiss checklist">
                                ✕
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                </div>

                <ul class="checklist-items">
                    ${this.renderChecklistItem(
                        progress.schemeCreated,
                        'Create Scheme',
                        'Define your property or location',
                        'meters.html'
                    )}
                    ${this.renderChecklistItem(
                        progress.buildingsAdded,
                        'Add Buildings',
                        'Set up building structure',
                        'meters.html'
                    )}
                    ${this.renderChecklistItem(
                        progress.unitsAdded,
                        'Add Units',
                        'Define units (apartments, shops, etc.)',
                        'meters.html'
                    )}
                    ${this.renderChecklistItem(
                        progress.metersRegistered,
                        'Register Meters',
                        'Link physical meters to units',
                        'meters.html'
                    )}
                    ${this.renderChecklistItem(
                        progress.firstCycleOpened,
                        'Open First Cycle',
                        'Start your first reading period',
                        'reading-cycle.html'
                    )}
                    ${this.renderChecklistItem(
                        progress.firstCycleClosed,
                        'Close First Cycle',
                        'Complete your first reading cycle',
                        'reading-cycle.html'
                    )}
                </ul>

                ${isComplete ? `
                    <div class="checklist-complete">
                        <p class="success-message">
                            🎉 Setup complete! You're ready to manage meter readings.
                        </p>
                        <button class="btn btn-primary btn-sm" onclick="dismissChecklist()">
                            Got it! Dismiss this checklist
                        </button>
                    </div>
                ` : `
                    <div class="checklist-tip">
                        <span class="tip-icon">💡</span>
                        <span class="tip-text">Complete all steps to unlock the full experience</span>
                    </div>
                `}
            </div>
        `;
    },

    renderChecklistItem(completed, title, description, link) {
        return `
            <li class="checklist-item ${completed ? 'completed' : 'pending'}">
                <div class="item-status">
                    <span class="status-icon">${completed ? '✓' : '○'}</span>
                </div>
                <div class="item-content">
                    <div class="item-title">
                        ${completed ? title : `<a href="${link}">${title}</a>`}
                    </div>
                    <div class="item-description">${description}</div>
                </div>
            </li>
        `;
    },

    /**
     * Dismiss checklist permanently
     */
    dismiss() {
        onboarding.markComplete();
        
        const container = document.getElementById('first-time-checklist-container');
        if (container) {
            container.style.display = 'none';
        }
    }
};

// Make functions available globally
window.firstTimeChecklist = firstTimeChecklist;

window.dismissChecklist = function() {
    if (confirm('Are you sure you want to dismiss this checklist? It won\'t be shown again.')) {
        firstTimeChecklist.dismiss();
    }
};
