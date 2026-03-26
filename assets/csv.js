/**
 * csv.js - CSV Export Logic
 * Generates CSV files for unit readings and scheme summaries
 */

import { storage } from './storage.js';
import { getEffectiveReviewStatus, getPreviousReadingDisplayValue } from './app.js';

export const csv = {
    /**
     * Export unit readings for a cycle
     */
    exportUnitReadings(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        const scheme = storage.get('schemes', cycle.scheme_id);
        const readings = storage.getReadings(cycleId);

        // Build CSV rows
        const rows = [
            ['Scheme', 'Building', 'Unit', 'Meter Number', 'Previous Reading', 'Current Reading', 'Consumption (kWh)', 'Reading Date', 'Captured By', 'Contact Details', 'Flags', 'Review Status', 'Notes']
        ];

        readings.forEach(reading => {
            const meter = storage.getMeterWithDetails(reading.meter_id);
            if (!meter || meter.meter_type !== 'UNIT') return;

            const flags = reading.flags ? reading.flags.map(f => f.type).join('; ') : '';
            const consumption = reading.consumption != null ? reading.consumption.toFixed(2) : 'N/A';

            rows.push([
                scheme.name,
                meter.building_name || 'N/A',
                meter.unit_name || 'N/A',
                meter.meter_number,
                getPreviousReadingDisplayValue(reading, meter),
                reading.reading_value,
                consumption,
                reading.reading_date,
                reading.captured_by || 'Unknown',
                reading.captured_by_contact_details || reading.submitted_by_contact_details || '',
                flags,
                getEffectiveReviewStatus(reading, cycle),
                reading.notes || ''
            ]);
        });

        const filename = `unit-readings-${scheme.name}-${cycle.start_date}.csv`;
        this.downloadCSV(rows, filename);
    },

    /**
     * Export scheme summary (bulk reconciliation)
     */
    exportSchemeSummary(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        const scheme = storage.get('schemes', cycle.scheme_id);
        const readings = storage.getReadings(cycleId);
        const meters = storage.getMeters(cycle.scheme_id);

        // Calculate totals
        let bulk_kWh = 0;
        let sum_units_kWh = 0;
        let common_meter_kWh = 0;

        const readingByMeterId = new Map(readings.map(reading => [reading.meter_id, reading]));
        meters.filter(m => m.meter_type === 'BULK').forEach(meter => {
            const reading = readingByMeterId.get(meter.id);
            if (reading?.consumption != null) {
                bulk_kWh += reading.consumption;
            }
        });

        // Sum unit consumptions
        readings.forEach(reading => {
            const meter = storage.get('meters', reading.meter_id);
            if (!meter || reading.consumption == null) return;

            if (meter.meter_type === 'UNIT') {
                sum_units_kWh += reading.consumption;
            }

            if (meter.meter_type === 'COMMON') {
                common_meter_kWh += reading.consumption;
            }
        });

        const unexplained_kWh = bulk_kWh - (sum_units_kWh + common_meter_kWh);
        const losses_percent = bulk_kWh > 0 ? (unexplained_kWh / bulk_kWh) * 100 : 0;

        // Build CSV
        const rows = [
            ['Metric', 'Value'],
            ['Scheme', scheme.name],
            ['Cycle Period', `${cycle.start_date} to ${cycle.end_date}`],
            ['Cycle Status', cycle.status],
            [''],
            ['Bulk Meter kWh', bulk_kWh.toFixed(2)],
            ['Sum of Unit Meters kWh', sum_units_kWh.toFixed(2)],
            ['Common Property Meter kWh', common_meter_kWh.toFixed(2)],
            ['Unexplained Losses kWh', unexplained_kWh.toFixed(2)],
            ['Losses %', losses_percent.toFixed(2) + '%'],
            [''],
            ['Total Unit Meters', meters.filter(m => m.meter_type === 'UNIT').length],
            ['Total Common Property Meters', meters.filter(m => m.meter_type === 'COMMON').length],
            ['Total Bulk Meters', meters.filter(m => m.meter_type === 'BULK').length],
            ['Readings Captured', readings.filter(r => storage.get('meters', r.meter_id).meter_type === 'UNIT').length],
            ['Flagged Readings', readings.filter(r => r.flags && r.flags.length > 0).length]
        ];

        const filename = `scheme-summary-${scheme.name}-${cycle.start_date}.csv`;
        this.downloadCSV(rows, filename);
    },

    /**
     * Export all data (combined)
     */
    exportAllData(cycleId) {
        const cycle = storage.get('cycles', cycleId);
        const scheme = storage.get('schemes', cycle.scheme_id);
        
        // Create a combined export with multiple sections
        const rows = [
            ['FUZIO ELECTRICITY READINGS - COMPLETE EXPORT'],
            ['Scheme:', scheme.name],
            ['Cycle:', `${cycle.start_date} to ${cycle.end_date}`],
            ['Status:', cycle.status],
            ['Export Date:', new Date().toISOString()],
            [''],
            ['=== UNIT READINGS ==='],
            ['Building', 'Unit', 'Meter Number', 'Previous', 'Current', 'Consumption', 'Flags', 'Review Status']
        ];

        const readings = storage.getReadings(cycleId);
        readings.forEach(reading => {
            const meter = storage.getMeterWithDetails(reading.meter_id);
            if (!meter || meter.meter_type !== 'UNIT') return;

            const flags = reading.flags ? reading.flags.map(f => f.type).join('; ') : '';
            rows.push([
                meter.building_name || 'N/A',
                meter.unit_name || 'N/A',
                meter.meter_number,
                getPreviousReadingDisplayValue(reading, meter),
                reading.reading_value,
                reading.consumption != null ? reading.consumption.toFixed(2) : 'N/A',
                flags,
                getEffectiveReviewStatus(reading, cycle)
            ]);
        });

        rows.push(['']);
        rows.push(['=== SCHEME SUMMARY ===']);
        
        // Add summary data
        const meters = storage.getMeters(cycle.scheme_id);
        let bulk_kWh = 0;
        let sum_units_kWh = 0;
        let common_meter_kWh = 0;

        const readingByMeterId = new Map(readings.map(reading => [reading.meter_id, reading]));
        meters.filter(m => m.meter_type === 'BULK').forEach(meter => {
            const reading = readingByMeterId.get(meter.id);
            if (reading?.consumption != null) {
                bulk_kWh += reading.consumption;
            }
        });

        readings.forEach(reading => {
            const meter = storage.get('meters', reading.meter_id);
            if (!meter || reading.consumption == null) return;

            if (meter.meter_type === 'UNIT') {
                sum_units_kWh += reading.consumption;
            }

            if (meter.meter_type === 'COMMON') {
                common_meter_kWh += reading.consumption;
            }
        });

        const unexplained_kWh = bulk_kWh - (sum_units_kWh + common_meter_kWh);
        const losses_percent = bulk_kWh > 0 ? (unexplained_kWh / bulk_kWh) * 100 : 0;

        rows.push(['Bulk kWh', bulk_kWh.toFixed(2)]);
        rows.push(['Sum Units kWh', sum_units_kWh.toFixed(2)]);
        rows.push(['Common Property Meter kWh', common_meter_kWh.toFixed(2)]);
        rows.push(['Unexplained Losses kWh', unexplained_kWh.toFixed(2)]);
        rows.push(['Losses %', losses_percent.toFixed(2) + '%']);

        const filename = `complete-export-${scheme.name}-${cycle.start_date}.csv`;
        this.downloadCSV(rows, filename);
    },

    /**
     * Convert array of arrays to CSV and trigger download
     */
    downloadCSV(rows, filename) {
        const csvContent = rows.map(row => 
            row.map(cell => {
                // Escape cells containing commas, quotes, or newlines
                const cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        ).join('\n');

        // Create blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
