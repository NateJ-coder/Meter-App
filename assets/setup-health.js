/**
 * setup-health.js - Proactive Setup Validation
 * Surfaces issues before they become problems
 */

import { storage } from './storage.js';
import { validation } from './validation.js';

export const setupHealth = {
    /**
     * Get comprehensive setup health status
     */
    getHealthStatus(schemeId = null) {
        // If no schemeId provided, use the first scheme
        if (!schemeId) {
            const schemes = storage.getAll('schemes');
            if (schemes.length === 0) {
                return {
                    overall: 'none',
                    issues: [],
                    warnings: [],
                    successes: [],
                    stats: { schemes: 0, buildings: 0, units: 0, meters: 0 }
                };
            }
            schemeId = schemes[0].id;
        }

        const issues = [];
        const warnings = [];
        const successes = [];

        // Get all data
        const scheme = storage.get('schemes', schemeId);
        const buildings = storage.getAll('buildings').filter(b => b.scheme_id === schemeId);
        const units = storage.getAll('units').filter(u => 
            buildings.some(b => b.id === u.building_id)
        );
        const meters = storage.getAll('meters').filter(m => m.scheme_id === schemeId);
        const bulkMeters = meters.filter(m => m.meter_type === 'BULK');
        const unitMeters = meters.filter(m => m.meter_type === 'UNIT');

        // Check 1: Units without meters
        const unitsWithoutMeters = units.filter(unit => 
            !unitMeters.some(m => m.unit_id === unit.id)
        );

        if (unitsWithoutMeters.length > 0) {
            issues.push({
                type: 'units-without-meters',
                severity: 'high',
                message: `${unitsWithoutMeters.length} unit${unitsWithoutMeters.length > 1 ? 's have' : ' has'} no meters`,
                count: unitsWithoutMeters.length,
                action: 'Add meters to these units',
                link: 'meters.html'
            });
        } else if (units.length > 0) {
            successes.push({
                type: 'all-units-metered',
                message: 'All units have meters'
            });
        }

        // Check 2: Duplicate meter numbers
        const duplicates = validation.checkDuplicateMeters(schemeId);
        if (duplicates.length > 0) {
            issues.push({
                type: 'duplicate-meters',
                severity: 'high',
                message: `${duplicates.length} duplicate meter number${duplicates.length > 1 ? 's' : ''}`,
                count: duplicates.length,
                details: duplicates.map(d => d.meter_number),
                action: 'Fix duplicate meter numbers',
                link: 'meters.html'
            });
        } else if (meters.length > 0) {
            successes.push({
                type: 'no-duplicates',
                message: 'No duplicate meter numbers'
            });
        }

        // Check 3: Bulk meter presence
        if (bulkMeters.length === 0) {
            warnings.push({
                type: 'no-bulk-meter',
                severity: 'medium',
                message: 'No bulk meter registered',
                action: 'Add a bulk meter to track total consumption',
                link: 'meters.html'
            });
        } else {
            successes.push({
                type: 'bulk-meter-exists',
                message: `${bulkMeters.length} bulk meter${bulkMeters.length > 1 ? 's' : ''} registered`
            });
        }

        // Check 4: Buildings without units
        const buildingsWithoutUnits = buildings.filter(building =>
            !units.some(u => u.building_id === building.id)
        );

        if (buildingsWithoutUnits.length > 0) {
            warnings.push({
                type: 'buildings-without-units',
                severity: 'medium',
                message: `${buildingsWithoutUnits.length} building${buildingsWithoutUnits.length > 1 ? 's have' : ' has'} no units`,
                count: buildingsWithoutUnits.length,
                details: buildingsWithoutUnits.map(b => b.name),
                action: 'Add units to these buildings',
                link: 'meters.html'
            });
        }

        // Check 5: Open cycle readiness
        const cycles = storage.getAll('cycles').filter(c => c.scheme_id === schemeId);
        const openCycle = cycles.find(c => c.status === 'OPEN');

        if (openCycle && issues.length > 0) {
            warnings.push({
                type: 'open-cycle-with-issues',
                severity: 'medium',
                message: 'Open cycle has setup issues',
                action: 'Resolve issues before capturing readings',
                link: 'reading-cycle.html'
            });
        }

        // Check 6: Meters without initial readings
        const metersWithoutInitialReadings = meters.filter(m => 
            m.last_reading == null || m.last_reading === 0
        );

        if (metersWithoutInitialReadings.length > 0 && cycles.length === 0) {
            warnings.push({
                type: 'meters-without-initial-readings',
                severity: 'low',
                message: `${metersWithoutInitialReadings.length} meter${metersWithoutInitialReadings.length > 1 ? 's have' : ' has'} no initial reading`,
                count: metersWithoutInitialReadings.length,
                action: 'Set initial readings before first cycle',
                link: 'meters.html'
            });
        }

        // Determine overall status
        let overall = 'healthy';
        if (issues.length > 0) {
            overall = 'critical';
        } else if (warnings.length > 0) {
            overall = 'warning';
        } else if (successes.length === 0) {
            overall = 'empty';
        }

        return {
            overall,
            issues,
            warnings,
            successes,
            stats: {
                schemes: 1,
                buildings: buildings.length,
                units: units.length,
                meters: meters.length
            }
        };
    },

    /**
     * Render health panel HTML
     */
    renderHealthPanel(containerId, schemeId = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const health = this.getHealthStatus(schemeId);

        if (health.overall === 'none' || health.overall === 'empty') {
            container.innerHTML = `
                <div class="setup-health-panel empty">
                    <div class="health-header">
                        <h3>Setup Health</h3>
                        <p class="text-muted">No data yet. Complete onboarding to get started.</p>
                    </div>
                </div>
            `;
            return;
        }

        const statusIcon = {
            'healthy': '✓',
            'warning': '⚠',
            'critical': '⚠'
        }[health.overall];

        const statusClass = {
            'healthy': 'success',
            'warning': 'warning',
            'critical': 'danger'
        }[health.overall];

        container.innerHTML = `
            <div class="setup-health-panel ${statusClass}">
                <div class="health-header">
                    <div class="health-status">
                        <span class="health-icon">${statusIcon}</span>
                        <h3>Setup Health</h3>
                    </div>
                    <div class="health-summary">
                        ${health.stats.buildings} buildings • ${health.stats.units} units • ${health.stats.meters} meters
                    </div>
                </div>

                <div class="health-items">
                    ${health.issues.map(issue => `
                        <div class="health-item issue">
                            <div class="item-icon">⚠</div>
                            <div class="item-content">
                                <div class="item-message">${issue.message}</div>
                                ${issue.details ? `<div class="item-details">${issue.details.slice(0, 3).join(', ')}${issue.details.length > 3 ? '...' : ''}</div>` : ''}
                                <a href="${issue.link}" class="item-action">${issue.action} →</a>
                            </div>
                        </div>
                    `).join('')}

                    ${health.warnings.map(warning => `
                        <div class="health-item warning">
                            <div class="item-icon">⚡</div>
                            <div class="item-content">
                                <div class="item-message">${warning.message}</div>
                                ${warning.details ? `<div class="item-details">${warning.details.slice(0, 3).join(', ')}${warning.details.length > 3 ? '...' : ''}</div>` : ''}
                                ${warning.action ? `<a href="${warning.link}" class="item-action">${warning.action} →</a>` : ''}
                            </div>
                        </div>
                    `).join('')}

                    ${health.issues.length === 0 && health.warnings.length === 0 ? `
                        ${health.successes.map(success => `
                            <div class="health-item success">
                                <div class="item-icon">✓</div>
                                <div class="item-content">
                                    <div class="item-message">${success.message}</div>
                                </div>
                            </div>
                        `).join('')}
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Get compact health badge HTML (for headers)
     */
    getHealthBadge(schemeId = null) {
        const health = this.getHealthStatus(schemeId);
        
        if (health.overall === 'none' || health.overall === 'empty') {
            return '';
        }

        const issueCount = health.issues.length + health.warnings.length;
        if (issueCount === 0) {
            return '<span class="health-badge success">✓ Setup healthy</span>';
        }

        return `<span class="health-badge ${health.overall}">${issueCount} issue${issueCount > 1 ? 's' : ''}</span>`;
    },

    /**
     * Check if system is ready for a new cycle
     */
    isReadyForCycle(schemeId) {
        const health = this.getHealthStatus(schemeId);
        
        // Critical issues block cycle creation
        if (health.issues.length > 0) {
            return {
                ready: false,
                reason: 'Critical setup issues must be resolved',
                issues: health.issues
            };
        }

        // Check if there are any units and meters
        if (health.stats.units === 0) {
            return {
                ready: false,
                reason: 'No units found. Add units before opening a cycle.',
                issues: []
            };
        }

        if (health.stats.meters === 0) {
            return {
                ready: false,
                reason: 'No meters found. Add meters before opening a cycle.',
                issues: []
            };
        }

        return {
            ready: true,
            warnings: health.warnings
        };
    }
};

// Make setupHealth available globally
window.setupHealth = setupHealth;
