/**
 * validation.js - Validation and Flag Generation
 * Auto-generates flags for readings based on business rules
 */

import { storage } from './storage.js';

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

        // FLAG 1: Backward reading
        if (meter.last_reading && reading.reading_value < meter.last_reading) {
            flags.push({
                type: 'backward',
                severity: 'high',
                message: `Backward reading: ${reading.reading_value} < ${meter.last_reading}`
            });
        }

        // FLAG 2: Huge spike (> 3x average of last 3 cycles)
        const consumption = reading.reading_value - (meter.last_reading || 0);
        const avgConsumption = this.getAverageConsumption(meter.id, 3);
        
        if (avgConsumption > 0 && consumption > avgConsumption * 3) {
            flags.push({
                type: 'spike',
                severity: 'high',
                message: `Huge spike: ${consumption.toFixed(2)} kWh (avg: ${avgConsumption.toFixed(2)} kWh)`
            });
        }

        // FLAG 3: Zero or very low consumption (if meter was active)
        if (consumption === 0 && meter.last_reading > 0) {
            flags.push({
                type: 'zero-consumption',
                severity: 'medium',
                message: 'Zero consumption detected'
            });
        }

        // FLAG 4: Exact same as last reading (suspicious)
        if (meter.last_reading && reading.reading_value === meter.last_reading) {
            flags.push({
                type: 'unchanged',
                severity: 'medium',
                message: 'Reading unchanged from previous month'
            });
        }

        return flags;
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
            by_type: {}
        };

        flaggedReadings.forEach(reading => {
            reading.flags.forEach(flag => {
                summary.by_type[flag.type] = (summary.by_type[flag.type] || 0) + 1;
            });
        });

        return summary;
    }
};
