/**
 * verify-previous-readings.js
 *
 * Reads every app-database JSON file and for each meter:
 *   1. Finds the most recent entry in historical_readings
 *   2. Compares it to the meter's last_reading field
 *   3. Reports any mismatches
 *
 * Run:  node scripts/verify-previous-readings.js
 * Optional filter by building slug:
 *        node scripts/verify-previous-readings.js azores
 */

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'Buildings', 'app-database');
const filterSlug = process.argv[2] || null;

const files = fs.readdirSync(DB_DIR)
    .filter(f => f.endsWith('.app-database.json'))
    .filter(f => !filterSlug || f.startsWith(filterSlug));

if (files.length === 0) {
    console.error(`No app-database files found${filterSlug ? ` matching "${filterSlug}"` : ''}.`);
    process.exit(1);
}

let totalMeters = 0;
let mismatches = 0;
let noHistory = 0;
let ok = 0;

const report = [];

for (const file of files) {
    const filePath = path.join(DB_DIR, file);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const buildingSlug = payload.building_slug || file.replace('.app-database.json', '');
    const meters = payload.meters || payload.meter_definitions || [];
    const historicalReadings = payload.historical_readings || [];

    for (const meter of meters) {
        totalMeters++;

        // Find all historical readings for this meter, sorted newest first
        const meterReadings = historicalReadings
            .filter(r => r.meter_id === meter.id)
            .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date));

        if (meterReadings.length === 0) {
            noHistory++;
            report.push({
                status: 'NO_HISTORY',
                building: buildingSlug,
                meterId: meter.id,
                meterNumber: meter.meter_number,
                lastReadingOnMeter: meter.last_reading,
                mostRecentHistoricalValue: null,
                mostRecentHistoricalDate: null,
            });
            continue;
        }

        const mostRecent = meterReadings[0];
        const historicalValue = mostRecent.reading_value ?? mostRecent.current_reading ?? null;
        const meterValue = meter.last_reading;

        const match = historicalValue !== null && Number(meterValue) === Number(historicalValue);

        if (match) {
            ok++;
        } else {
            mismatches++;
            report.push({
                status: 'MISMATCH',
                building: buildingSlug,
                meterId: meter.id,
                meterNumber: meter.meter_number,
                lastReadingOnMeter: meterValue,
                mostRecentHistoricalValue: historicalValue,
                mostRecentHistoricalDate: mostRecent.reading_date,
                readingStatus: mostRecent.review_status,
                flags: (mostRecent.flags || []).map(f => f.type).join(', '),
            });
        }
    }
}

// Summary
console.log('\n=== Previous Readings Verification ===');
console.log(`Files checked : ${files.join(', ')}`);
console.log(`Total meters  : ${totalMeters}`);
console.log(`OK            : ${ok}`);
console.log(`No history    : ${noHistory}`);
console.log(`Mismatches    : ${mismatches}`);
console.log('');

const problemRows = report.filter(r => r.status !== 'OK');
if (problemRows.length === 0) {
    console.log('All meter last_reading values match their most recent historical reading. ✓');
} else {
    // Group by status
    const mismatchRows = problemRows.filter(r => r.status === 'MISMATCH');
    const noHistoryRows = problemRows.filter(r => r.status === 'NO_HISTORY');

    if (mismatchRows.length > 0) {
        console.log('--- MISMATCHES (last_reading on meter ≠ most recent historical reading) ---');
        for (const row of mismatchRows) {
            console.log(
                `  [${row.building}] Meter ${row.meterNumber} (${row.meterId})\n` +
                `    meter.last_reading      = ${row.lastReadingOnMeter}\n` +
                `    most recent history     = ${row.mostRecentHistoricalValue}  (${row.mostRecentHistoricalDate}, status=${row.readingStatus}, flags=${row.flags || 'none'})\n`
            );
        }
    }

    if (noHistoryRows.length > 0) {
        console.log(`--- METERS WITH NO HISTORICAL READINGS (${noHistoryRows.length}) ---`);
        for (const row of noHistoryRows) {
            console.log(`  [${row.building}] Meter ${row.meterNumber}  last_reading=${row.lastReadingOnMeter}`);
        }
    }
}

console.log('');
