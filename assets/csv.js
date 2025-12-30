/**
 * csv.js - CSV Export Logic
 * Generates CSV files for unit readings and scheme summaries
 */

import { storage } from './storage.js';

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
            ['Scheme', 'Building', 'Unit', 'Meter Number', 'Previous Reading', 'Current Reading', 'Consumption (kWh)', 'Reading Date', 'Flags', 'Review Status', 'Notes']
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
                meter.last_reading || 0,
                reading.reading_value,
                consumption,
                reading.reading_date,
                flags,
                reading.review_status || 'pending',
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

        // Get bulk meter reading
        const bulkMeter = meters.find(m => m.meter_type === 'BULK');
        if (bulkMeter) {
            const bulkReading = readings.find(r => r.meter_id === bulkMeter.id);
            if (bulkReading && bulkReading.consumption != null) {
                bulk_kWh = bulkReading.consumption;
            }
        }

        // Sum unit consumptions
        readings.forEach(reading => {
            const meter = storage.get('meters', reading.meter_id);
            if (meter && meter.meter_type === 'UNIT' && reading.consumption != null) {
                sum_units_kWh += reading.consumption;
            }
        });

        const common_kWh = bulk_kWh - sum_units_kWh;
        const losses_percent = bulk_kWh > 0 ? (common_kWh / bulk_kWh) * 100 : 0;

        // Build CSV
        const rows = [
            ['Metric', 'Value'],
            ['Scheme', scheme.name],
            ['Cycle Period', `${cycle.start_date} to ${cycle.end_date}`],
            ['Cycle Status', cycle.status],
            [''],
            ['Bulk Meter kWh', bulk_kWh.toFixed(2)],
            ['Sum of Unit Meters kWh', sum_units_kWh.toFixed(2)],
            ['Common Area kWh', common_kWh.toFixed(2)],
            ['Losses %', losses_percent.toFixed(2) + '%'],
            [''],
            ['Total Unit Meters', meters.filter(m => m.meter_type === 'UNIT').length],
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
                meter.last_reading || 0,
                reading.reading_value,
                reading.consumption != null ? reading.consumption.toFixed(2) : 'N/A',
                flags,
                reading.review_status || 'pending'
            ]);
        });

        rows.push(['']);
        rows.push(['=== SCHEME SUMMARY ===']);
        
        // Add summary data
        const meters = storage.getMeters(cycle.scheme_id);
        let bulk_kWh = 0;
        let sum_units_kWh = 0;

        const bulkMeter = meters.find(m => m.meter_type === 'BULK');
        if (bulkMeter) {
            const bulkReading = readings.find(r => r.meter_id === bulkMeter.id);
            if (bulkReading && bulkReading.consumption != null) {
                bulk_kWh = bulkReading.consumption;
            }
        }

        readings.forEach(reading => {
            const meter = storage.get('meters', reading.meter_id);
            if (meter && meter.meter_type === 'UNIT' && reading.consumption != null) {
                sum_units_kWh += reading.consumption;
            }
        });

        const common_kWh = bulk_kWh - sum_units_kWh;
        const losses_percent = bulk_kWh > 0 ? (common_kWh / bulk_kWh) * 100 : 0;

        rows.push(['Bulk kWh', bulk_kWh.toFixed(2)]);
        rows.push(['Sum Units kWh', sum_units_kWh.toFixed(2)]);
        rows.push(['Common kWh', common_kWh.toFixed(2)]);
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
