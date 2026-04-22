/**
 * import-vista-march-2026.mjs
 * 
 * Imports the March 2026 (2026-03-31) cycle for Vista Del Monte from:
 *   Buildings/buildings/Vista Del Monte/2026/2026.03.31/xlsx/Convert Billing PDFs to CSV.xlsx
 * 
 * Run: node scripts/import-vista-march-2026.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = join(__dirname, '..');

const xlsxPath = join(BASE, 'Buildings/buildings/Vista Del Monte/2026/2026.03.31/xlsx/Convert Billing PDFs to CSV.xlsx');
const dbPath = join(BASE, 'Buildings/app-database/vista-del-monte.app-database.json');

const db = JSON.parse(readFileSync(dbPath, 'utf8'));

const cycleDate = '2026-03-31';
const cycleId = 'cycle-vista-del-monte-2026-03-31';

// Guard duplicate
if (db.cycles.some(c => c.id === cycleId)) {
  console.log('✓ March 2026 cycle already exists — skipping');
  process.exit(0);
}

// Read the Excel
const wb = XLSX.readFile(xlsxPath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Convert Billing PDFs to CSV'], { header: 1 }).slice(1); // skip header

// Build previous (Feb) readings lookup
const prevCycleId = 'cycle-vista-del-monte-2026-02-27';
const prevReadings = db.historical_readings.filter(r => r.cycle_id === prevCycleId);
const prevByMeter = {};
prevReadings.forEach(r => { prevByMeter[r.meter_id] = r.reading_value; });

// Validate opening readings against previous cycle
let mismatches = 0;
for (const row of rows) {
  if (!row[0] || typeof row[0] !== 'string') continue; // skip water rows (null Unit)
  const unitLabel = row[0]; // "Unit 1", "Unit 2", etc.
  const match = unitLabel.match(/^Unit (\d+)$/);
  if (!match) continue;
  const unitNo = parseInt(match[1]);
  const meterId = `meter-vista-del-monte-unit-vd-${String(unitNo).padStart(2, '0')}`;
  const openingReading = Number(row[3]);
  if (isNaN(openingReading)) continue;
  const prev = prevByMeter[meterId];
  if (prev !== undefined && prev !== openingReading) {
    console.warn(`  ⚠ Opening mismatch ${meterId}: Excel=${openingReading}, DB prev=${prev}`);
    mismatches++;
  }
}
if (mismatches > 0) {
  console.warn(`\n  ${mismatches} opening reading mismatch(es) detected — review before proceeding`);
}

// Create cycle
const newCycle = {
  id: cycleId,
  scheme_id: 'scheme-vista-del-monte',
  name: 'Vista Del Monte 2026-03-31',
  start_date: '2026-02-27',
  end_date: cycleDate,
  status: 'CLOSED',
  reading_source: 'utility_manager',
  utility_manager: 'LMS',
  created_at: new Date().toISOString(),
  imported_from: 'folder_excel',
  source_reference: 'Buildings/buildings/Vista Del Monte/2026/2026.03.31/xlsx/Convert Billing PDFs to CSV.xlsx'
};

// Create readings
const newReadings = [];
for (const row of rows) {
  if (!row[0] || typeof row[0] !== 'string') continue; // skip null (water) rows
  const unitLabel = row[0];
  const match = unitLabel.match(/^Unit (\d+)$/);
  if (!match) continue;

  const unitNo = parseInt(match[1]);
  const meterId = `meter-vista-del-monte-unit-vd-${String(unitNo).padStart(2, '0')}`;
  const closingReading = Number(row[4]); // CLOSING READING column

  if (isNaN(closingReading)) {
    console.warn(`  ⚠ No closing reading for ${unitLabel}`);
    continue;
  }

  const previousReading = prevByMeter[meterId] ?? null;
  const consumption = previousReading !== null ? closingReading - previousReading : null;

  newReadings.push({
    id: `reading-vista-del-monte-vd-${String(unitNo).padStart(2, '0')}-${cycleDate}`,
    meter_id: meterId,
    cycle_id: cycleId,
    reading_date: cycleDate,
    reading_value: closingReading,
    previous_reading: previousReading,
    consumption: consumption,
    reading_type: 'actual',
    capture_method: 'imported_excel',
    review_status: 'approved',
    validation_status: 'validated',
    validation_reason: '',
    flags: [],
    source_file: xlsxPath,
    source_row_reference: `Vista Del Monte:VD ${String(unitNo).padStart(2, '0')}:${cycleDate}`,
    imported_from: 'folder_excel',
    utility_manager: 'LMS',
    created_at: new Date().toISOString()
  });

  // Update meter last_reading
  const meter = db.meters.find(m => m.id === meterId);
  if (meter) {
    meter.last_reading = closingReading;
    meter.last_reading_date = cycleDate;
  }
}

db.cycles.push(newCycle);
db.historical_readings.push(...newReadings);
db.generated_at = new Date().toISOString();

writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log(`✓ Vista Del Monte: added cycle ${cycleId} with ${newReadings.length} electricity readings`);
console.log(`  Note: covers units VD 01–30 (LMS billing). VD 31–42 not in LMS PDF — no readings added for those units.`);
console.log('\nDone. Run upload-building-app-database-to-firebase.mjs to sync to Firebase.');
