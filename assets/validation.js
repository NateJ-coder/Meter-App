/**
 * validation.js - Validation and Flag Generation
 * Auto-generates flags for readings based on business rules
 */

import { storage } from './storage.js';

// ===== PHASE 1: CONFIGURABLE THRESHOLDS =====

const DEFAULT_CONFIG = {
    spikeMultiplier: 3,              // Consumption > avg × this = spike
    percentageThreshold: 50,          // Consumption > last × this % = percentage spike
    zeroTolerance: true,              // Flag zero consumption
    backwardAllowed: false,           // Allow backward readings (meter replacements)
    minHistoryCycles: 3,              // Minimum cycles for average calculation
    bulkMismatchThreshold: 20,        // % mismatch for bulk reconciliation flag
    gradualCreepThreshold: 7,         // % increase per cycle over 6 cycles = creep
    seasonalComparisonMonths: 12      // Compare to same month last year
};

/**
 * Get validation config for a scheme (or global default)
 */
function getValidationConfig(schemeId = null) {
    if (schemeId) {
        // Try to get scheme-specific config from localStorage
        const schemeConfigKey = `fuzio_validation_config_${schemeId}`;
        const stored = localStorage.getItem(schemeConfigKey);
        if (stored) {
            try {
                return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
            } catch (e) {
                console.warn('Invalid scheme validation config, using defaults');
            }
        }
    }
    
    // Check for global override
    const globalConfigKey = 'fuzio_validation_config_global';
    const globalStored = localStorage.getItem(globalConfigKey);
    if (globalStored) {
        try {
            return { ...DEFAULT_CONFIG, ...JSON.parse(globalStored) };
        } catch (e) {
            console.warn('Invalid global validation config, using defaults');
        }
    }
    
    return DEFAULT_CONFIG;
}

export const validation = {
    /**
     * Validate a reading and generate flags
     * @param {Object} reading - The reading to validate
     * @returns {Array} Array of flag objects
     */
    validateReading(reading) {
        const flags = [];
        const meter = storage.get('meters', reading.meter_id);
        
        if (!meter) return flags;
        
        // Get scheme for config
        const cycle = storage.get('cycles', reading.cycle_id);
        const config = getValidationConfig(cycle?.scheme_id);
        
        const consumption = reading.reading_value - (meter.last_reading || 0);
        const previousConsumption = meter.last_reading ? this.getPreviousConsumption(meter.id) : 0;

        // FLAG 1: Backward reading (unless allowed by config)
        if (!config.backwardAllowed && meter.last_reading && reading.reading_value < meter.last_reading) {
            flags.push({
                type: 'backward',
                severity: 'high',
                message: `Backward reading: ${reading.reading_value} < ${meter.last_reading}`,
                description: 'Reading decreased from previous value. Possible meter rollover or replacement.'
            });
        }

        // FLAG 2: Huge spike (average-based, configurable multiplier)
        const avgConsumption = this.getAverageConsumption(meter.id, config.minHistoryCycles);
        
        if (avgConsumption > 0 && consumption > avgConsumption * config.spikeMultiplier) {
            flags.push({
                type: 'spike',
                severity: 'high',
                message: `Huge spike: ${consumption.toFixed(2)} kWh (avg: ${avgConsumption.toFixed(2)} kWh, threshold: ${config.spikeMultiplier}×)`,
                description: `Consumption exceeds ${config.spikeMultiplier}× historical average. May indicate leak or reading error.`
            });
        }

        // ===== PHASE 2: PERCENTAGE-BASED SPIKE =====
        // FLAG 2b: Percentage spike (compared to last reading, not average)
        if (previousConsumption > 0 && consumption > previousConsumption * (1 + config.percentageThreshold / 100)) {
            const percentageIncrease = ((consumption - previousConsumption) / previousConsumption * 100).toFixed(1);
            flags.push({
                type: 'percentage-spike',
                severity: 'medium',
                message: `${percentageIncrease}% increase from last cycle (was ${previousConsumption.toFixed(2)} kWh, now ${consumption.toFixed(2)} kWh)`,
                description: `Consumption increased by more than ${config.percentageThreshold}%. Review for accuracy.`
            });
        }

        // FLAG 3: Zero or very low consumption (if enabled)
        if (config.zeroTolerance && consumption === 0 && meter.last_reading > 0) {
            flags.push({
                type: 'zero-consumption',
                severity: 'medium',
                message: 'Zero consumption detected',
                description: 'No electricity used this cycle. Verify unit occupancy and meter status.'
            });
        }

        // FLAG 4: Exact same as last reading (suspicious)
        if (meter.last_reading && reading.reading_value === meter.last_reading) {
            flags.push({
                type: 'unchanged',
                severity: 'medium',
                message: 'Reading unchanged from previous cycle',
                description: 'Meter reading identical to last month. Check if meter is stuck or reading was not updated.'
            });
        }

        // ===== PHASE 5: PATTERN FLAGS =====
        
        // FLAG 5: Gradual creep (consistent increase over time)
        const creepDetected = this.detectGradualCreep(meter.id, config.gradualCreepThreshold);
        if (creepDetected) {
            flags.push({
                type: 'gradual-creep',
                severity: 'low',
                message: `Gradual increase detected: ${creepDetected.averageIncrease.toFixed(1)}% per cycle over ${creepDetected.cycles} cycles`,
                description: 'Usage consistently increasing. May indicate growing occupancy, new appliances, or developing issue.'
            });
        }

        // FLAG 6: Seasonal anomaly (compare to same month last year)
        const seasonalAnomaly = this.detectSeasonalAnomaly(meter.id, reading, config.seasonalComparisonMonths);
        if (seasonalAnomaly) {
            flags.push({
                type: 'seasonal-anomaly',
                severity: 'low',
                message: `${seasonalAnomaly.difference > 0 ? 'Higher' : 'Lower'} than same period last year by ${Math.abs(seasonalAnomaly.percentDiff).toFixed(1)}%`,
                description: `Last year same period: ${seasonalAnomaly.lastYearConsumption.toFixed(2)} kWh. Current: ${consumption.toFixed(2)} kWh.`
            });
        }

        // FLAG 7: Vacancy contradiction (unit marked vacant but has consumption)
        const unit = meter.unit_id ? storage.get('units', meter.unit_id) : null;
        if (unit?.status === 'VACANT' && consumption > 50) {
            flags.push({
                type: 'vacancy-contradiction',
                severity: 'medium',
                message: `Unit marked VACANT but consumed ${consumption.toFixed(2)} kWh`,
                description: 'Significant consumption detected in vacant unit. Update occupancy status or investigate unauthorized usage.'
            });
        }

        return flags;
    },

    /**
     * Get previous cycle consumption for percentage comparison
     */
    getPreviousConsumption(meterId) {
        const allReadings = storage.getReadings();
        const meterReadings = allReadings
            .filter(r => r.meter_id === meterId && r.consumption != null)
            .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date));
        
        return meterReadings.length > 0 ? meterReadings[0].consumption : 0;
    },

    /**
     * Calculate average consumption for a meter over last N cycles
     */
    getAverageConsumption(meterId, cycles = 3) {
        const allReadings = storage.getReadings();
        const meterReadings = allReadings
            .filter(r => r.meter_id === meterId && r.consumption != null)
            .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date))
            .slice(0, cycles);

        if (meterReadings.length === 0) return 0;

        const totalConsumption = meterReadings.reduce((sum, r) => sum + (r.consumption || 0), 0);
        return totalConsumption / meterReadings.length;
    },

    /**
     * Detect gradual creep - consistent increase over time
     */
    detectGradualCreep(meterId, thresholdPercent = 7) {
        const allReadings = storage.getReadings();
        const meterReadings = allReadings
            .filter(r => r.meter_id === meterId && r.consumption != null)
            .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date))
            .slice(0, 6);
        
        if (meterReadings.length < 4) return null; // Need at least 4 cycles
        
        // Check if each cycle is higher than previous
        let increasingCount = 0;
        let totalPercentIncrease = 0;
        
        for (let i = 0; i < meterReadings.length - 1; i++) {
            const current = meterReadings[i].consumption;
            const previous = meterReadings[i + 1].consumption;
            
            if (current > previous && previous > 0) {
                increasingCount++;
                totalPercentIncrease += ((current - previous) / previous * 100);
            }
        }
        
        const averageIncrease = totalPercentIncrease / (meterReadings.length - 1);
        
        // Flag if more than half the cycles show increase AND average exceeds threshold
        if (increasingCount >= (meterReadings.length - 1) / 2 && averageIncrease >= thresholdPercent) {
            return {
                cycles: meterReadings.length,
                increasingCount,
                averageIncrease
            };
        }
        
        return null;
    },

    /**
     * Detect seasonal anomaly - compare to same period last year
     */
    detectSeasonalAnomaly(meterId, currentReading, comparisonMonths = 12) {
        if (!currentReading.consumption) return null;
        
        const currentDate = new Date(currentReading.reading_date);
        const lastYearDate = new Date(currentDate);
        lastYearDate.setMonth(lastYearDate.getMonth() - comparisonMonths);
        
        // Find reading from approximately same time last year
        const allReadings = storage.getReadings();
        const historicalReadings = allReadings
            .filter(r => r.meter_id === meterId && r.consumption != null)
            .map(r => ({
                ...r,
                date: new Date(r.reading_date)
            }))
            .filter(r => {
                const monthDiff = Math.abs(
                    (currentDate.getFullYear() * 12 + currentDate.getMonth()) -
                    (r.date.getFullYear() * 12 + r.date.getMonth())
                );
                return monthDiff >= comparisonMonths - 1 && monthDiff <= comparisonMonths + 1;
            });
        
        if (historicalReadings.length === 0) return null;
        
        const lastYearConsumption = historicalReadings[0].consumption;
        const difference = currentReading.consumption - lastYearConsumption;
        const percentDiff = (difference / lastYearConsumption * 100);
        
        // Only flag if difference is significant (>30%)
        if (Math.abs(percentDiff) > 30) {
            return {
                lastYearConsumption,
                currentConsumption: currentReading.consumption,
                difference,
                percentDiff
            };
        }
        
        return null;
    },

    /**
     * Calculate consumption for a reading
     */
    calculateConsumption(currentReading, previousReading) {
        if (previousReading == null) return null;
        return currentReading - previousReading;
    },

    /**
     * Check for duplicate meter numbers in a scheme
     */
    checkDuplicateMeters(schemeId) {
        const meters = storage.getMeters(schemeId);
        const meterNumbers = {};
        const duplicates = [];

        meters.forEach(meter => {
            if (meterNumbers[meter.meter_number]) {
                duplicates.push({
                    meter_number: meter.meter_number,
                    meter_ids: [meterNumbers[meter.meter_number], meter.id]
                });
            } else {
                meterNumbers[meter.meter_number] = meter.id;
            }
        });

        return duplicates;
    },

    /**
     * Find missing readings for a cycle
     */
    getMissingReadings(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        if (!cycle) return [];

        const meters = storage.getMeters(cycle.scheme_id).filter(m => m.meter_type === 'UNIT');
        const readings = storage.getReadings(cycleId);
        const readMeterIds = new Set(readings.map(r => r.meter_id));

        return meters.filter(meter => !readMeterIds.has(meter.id));
    },

    /**
     * Get summary of flags for a cycle
     */
    getCycleFlagsSummary(cycleId) {
        const readings = storage.getReadings(cycleId);
        const flaggedReadings = readings.filter(r => r.flags && r.flags.length > 0);

        const summary = {
            total: readings.length,
            flagged: flaggedReadings.length,
            by_type: {},
            by_severity: { high: 0, medium: 0, low: 0 }
        };

        flaggedReadings.forEach(reading => {
            reading.flags.forEach(flag => {
                summary.by_type[flag.type] = (summary.by_type[flag.type] || 0) + 1;
                summary.by_severity[flag.severity] = (summary.by_severity[flag.severity] || 0) + 1;
            });
        });

        return summary;
    },

    // ===== PHASE 4: BULK RECONCILIATION FLAG =====
    
    /**
     * Check for bulk meter reconciliation issues at cycle level
     * Returns null if no issue, or flag object if mismatch exceeds threshold
     */
    checkBulkReconciliation(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        if (!cycle) return null;
        
        const config = getValidationConfig(cycle.scheme_id);
        const meters = storage.getMeters(cycle.scheme_id);
        const readings = storage.getReadings(cycleId);
        
        // Get bulk meter reading
        const bulkMeter = meters.find(m => m.meter_type === 'BULK');
        if (!bulkMeter) return null; // No bulk meter, can't reconcile
        
        const bulkReading = readings.find(r => r.meter_id === bulkMeter.id);
        if (!bulkReading || bulkReading.consumption == null) return null;
        
        const bulk_kWh = bulkReading.consumption;
        
        // Sum all unit meter consumptions
        let sum_units_kWh = 0;
        readings.forEach(reading => {
            const meter = storage.get('meters', reading.meter_id);
            if (meter && meter.meter_type === 'UNIT' && reading.consumption != null) {
                sum_units_kWh += reading.consumption;
            }
        });
        
        const common_kWh = bulk_kWh - sum_units_kWh;
        const mismatchPercent = bulk_kWh > 0 ? Math.abs(common_kWh / bulk_kWh * 100) : 0;
        
        // Flag if mismatch exceeds threshold
        if (mismatchPercent > config.bulkMismatchThreshold) {
            let severity = 'medium';
            if (mismatchPercent > 30) severity = 'high';
            if (mismatchPercent < 15) severity = 'low';
            
            return {
                type: 'bulk-mismatch',
                severity,
                message: `Bulk reconciliation issue: ${mismatchPercent.toFixed(1)}% discrepancy`,
                description: `Bulk meter: ${bulk_kWh.toFixed(2)} kWh, Sum of units: ${sum_units_kWh.toFixed(2)} kWh, Common area: ${common_kWh.toFixed(2)} kWh (${mismatchPercent.toFixed(1)}%)`,
                details: {
                    bulk_kWh,
                    sum_units_kWh,
                    common_kWh,
                    mismatchPercent
                }
            };
        }
        
        return null;
    },

    // ===== PHASE 3: MANUAL FLAGS =====
    
    /**
     * Add a manual flag to a reading (admin-created)
     */
    addManualFlag(readingId, flagData) {
        const reading = storage.get('readings', readingId);
        if (!reading) return false;
        
        // Initialize manual_flags array if it doesn't exist
        if (!reading.manual_flags) {
            reading.manual_flags = [];
        }
        
        const manualFlag = {
            type: flagData.type || 'custom',
            severity: flagData.severity || 'medium',
            message: flagData.message,
            description: flagData.description || '',
            added_by: flagData.added_by,
            added_at: new Date().toISOString()
        };
        
        reading.manual_flags.push(manualFlag);
        storage.update('readings', readingId, { manual_flags: reading.manual_flags });
        
        return true;
    },

    /**
     * Remove a manual flag from a reading
     */
    removeManualFlag(readingId, flagIndex) {
        const reading = storage.get('readings', readingId);
        if (!reading || !reading.manual_flags) return false;
        
        reading.manual_flags.splice(flagIndex, 1);
        storage.update('readings', readingId, { manual_flags: reading.manual_flags });
        
        return true;
    },

    /**
     * Get all flags for a reading (auto + manual combined)
     */
    getAllFlags(reading) {
        const autoFlags = (reading.flags || []).map(f => ({ ...f, source: 'auto' }));
        const manualFlags = (reading.manual_flags || []).map(f => ({ ...f, source: 'manual' }));
        return [...autoFlags, ...manualFlags];
    },

    /**
     * Export validation config (for admin UI later)
     */
    getValidationConfig(schemeId = null) {
        return getValidationConfig(schemeId);
    },

    /**
     * Update validation config
     */
    setValidationConfig(config, schemeId = null) {
        const key = schemeId 
            ? `fuzio_validation_config_${schemeId}` 
            : 'fuzio_validation_config_global';
        
        localStorage.setItem(key, JSON.stringify(config));
        return true;
    }
};
