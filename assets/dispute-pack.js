/**
 * dispute-pack.js
 * Pure function to assemble dispute pack data for a specific unit.
 * No side effects. No UI assumptions. Just data assembly.
 */

import { storage } from './storage.js';

/**
 * Assembles a dispute pack for a specific unit
 * @param {string} unitId - The unit ID to generate the pack for
 * @param {Object} options - Optional configuration
 * @param {number} options.months - Number of CLOSED cycles to include (default: 6)
 * @param {boolean} options.includeOpen - Include the open cycle if exists (default: false)
 * @returns {Object|null} Dispute pack object or null if unit not found
 */
export function getDisputePack(unitId, options = {}) {
    // Options with defaults
    const { 
        months = 6, 
        includeOpen = false 
    } = options;

    // Step 1: Fetch unit
    const unit = storage.get('units', unitId);
    if (!unit) {
        return null;
    }

    // Step 2: Find building
    const building = storage.get('buildings', unit.building_id);
    if (!building) {
        return null;
    }

    // Step 3: Find scheme
    const scheme = storage.get('schemes', building.scheme_id);
    if (!scheme) {
        return null;
    }

    // Step 4: Find meter(s) for this unit
    const meters = storage.getAll('meters').filter(m => 
        m.unit_id === unitId && m.meter_type === 'UNIT'
    );

    // For now, we expect one meter per unit
    // But we don't hard-code that assumption
    const meter = meters[0] || null;

    if (!meter) {
        // Unit has no meter - can still return pack, but cycles will be empty
        return {
            generated_at: new Date().toISOString(),
            unit: {
                id: unit.id,
                unit_number: unit.unit_number,
                owner_name: unit.owner_name || null
            },
            building: {
                id: building.id,
                name: building.name
            },
            scheme: {
                id: scheme.id,
                name: scheme.name,
                address: scheme.address || null
            },
            meter: null,
            cycles: [],
            summary: {
                total_cycles: 0,
                total_consumption: 0,
                average_consumption: 0,
                flagged_cycles_count: 0,
                estimated_cycles_count: 0
            }
        };
    }

    // Step 5: Find relevant cycles
    let cycles = storage.getAll('cycles').filter(c => 
        c.scheme_id === scheme.id
    );

    // Filter by status
    if (!includeOpen) {
        cycles = cycles.filter(c => c.status === 'CLOSED');
    }

    // Sort by start date descending (most recent first)
    cycles.sort((a, b) => {
        const dateA = new Date(a.start_date);
        const dateB = new Date(b.start_date);
        return dateB - dateA;
    });

    // Take last N cycles
    cycles = cycles.slice(0, months);

    // Step 6: For each cycle, assemble the full picture
    const cycleData = cycles.map(cycle => {
        // Find reading for this meter in this cycle
        const readings = storage.getAll('readings').filter(r => 
            r.cycle_id === cycle.id && r.meter_id === meter.id
        );

        const reading = readings[0] || null;

        // Build cycle entry
        const cycleEntry = {
            cycle_id: cycle.id,
            period: {
                start_date: cycle.start_date,
                end_date: cycle.end_date
            },
            reading: null,
            capture: null,
            flags: [],
            review: null
        };

        if (reading) {
            // Reading exists
            cycleEntry.reading = {
                previous: reading.previous_reading,
                current: reading.current_reading,
                consumption: reading.consumption
            };

            cycleEntry.capture = {
                captured_at: reading.captured_at || null,
                captured_by: reading.captured_by || null,
                photo: reading.photo || null,
                notes: reading.notes || null
            };

            cycleEntry.flags = reading.flags || [];

            cycleEntry.review = {
                status: reading.review_status || 'NOT_REVIEWED',
                reviewed_at: reading.reviewed_at || null,
                reviewed_by: reading.reviewed_by || null,
                admin_notes: reading.admin_notes || null,
                estimated_value: reading.estimated_value || null
            };
        } else {
            // Reading is missing - make this explicit
            cycleEntry.reading = {
                missing: true,
                previous: null,
                current: null,
                consumption: null
            };
        }

        return cycleEntry;
    });

    // Step 7: Calculate summary (derived data)
    const summary = {
        total_cycles: cycleData.length,
        total_consumption: 0,
        average_consumption: 0,
        flagged_cycles_count: 0,
        estimated_cycles_count: 0
    };

    let consumptionCount = 0;

    cycleData.forEach(cycle => {
        if (cycle.reading && !cycle.reading.missing && cycle.reading.consumption !== null) {
            summary.total_consumption += cycle.reading.consumption;
            consumptionCount++;
        }

        if (cycle.flags && cycle.flags.length > 0) {
            summary.flagged_cycles_count++;
        }

        if (cycle.review && cycle.review.status === 'ESTIMATED') {
            summary.estimated_cycles_count++;
        }
    });

    if (consumptionCount > 0) {
        summary.average_consumption = summary.total_consumption / consumptionCount;
    }

    // Step 8: Assemble final pack
    return {
        generated_at: new Date().toISOString(),
        unit: {
            id: unit.id,
            unit_number: unit.unit_number,
            owner_name: unit.owner_name || null
        },
        building: {
            id: building.id,
            name: building.name
        },
        scheme: {
            id: scheme.id,
            name: scheme.name,
            address: scheme.address || null
        },
        meter: {
            id: meter.id,
            meter_number: meter.meter_number,
            meter_type: meter.meter_type,
            status: meter.status
        },
        cycles: cycleData,
        summary: summary
    };
}
