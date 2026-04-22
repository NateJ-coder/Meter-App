/**
 * update-new-buildings-from-folders.mjs
 * 
 * Reads the 2026 Excel files in Buildings/buildings/Phanda Lodge/2026/
 * and adds the missing April 2026 cycle to the phanda-lodge app-database JSON.
 * 
 * Also adds LMS utility manager metadata to vista-del-monte app-database.
 * 
 * Run: node scripts/update-new-buildings-from-folders.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = join(__dirname, '..');

// ─── Phanda Lodge: Add April 2026 cycle ─────────────────────────────────────

function padUnit(doorNo) {
  return 'PH ' + String(doorNo).padStart(2, '0');
}

function phandaMeterId(doorNo) {
  return `meter-phanda-lodge-unit-ph-${String(doorNo).padStart(2, '0')}`;
}

function addPhandaAprilCycle() {
  const dbPath = join(BASE, 'Buildings/app-database/phanda-lodge.app-database.json');
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));

  // Check if April cycle already exists
  const cycleDate = '2026-04-02';
  const cycleId = 'cycle-phanda-lodge-2026-04-02';
  if (db.cycles.some(c => c.id === cycleId)) {
    console.log('✓ Phanda Lodge April 2026 cycle already exists — skipping');
    return;
  }

  // Read the 3Mar to 2Apr Excel file
  const xlsxPath = join(BASE, 'Buildings/buildings/Phanda Lodge/2026/PHA - Electricity 3Mar to 2Apr 2026.xlsx');
  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Worksheet'], { header: 1 }).slice(1); // skip header

  if (rows.length !== 48) {
    throw new Error(`Expected 48 unit rows, got ${rows.length}`);
  }

  // Build previous readings from the March cycle
  const marchCycleId = 'cycle-phanda-lodge-2026-03-03';
  const marchReadings = db.historical_readings.filter(r => r.cycle_id === marchCycleId);
  const marchByMeter = {};
  marchReadings.forEach(r => { marchByMeter[r.meter_id] = r.reading_value; });

  // Create the new cycle
  const newCycle = {
    id: cycleId,
    scheme_id: 'scheme-phanda-lodge',
    name: 'Phanda Lodge 2026-04-02',
    start_date: '2026-03-03',
    end_date: cycleDate,
    status: 'CLOSED',
    created_at: new Date().toISOString(),
    imported_from: 'folder_excel',
    source_reference: 'Buildings/buildings/Phanda Lodge/2026/PHA - Electricity 3Mar to 2Apr 2026.xlsx'
  };

  // Create a reading per unit meter
  const newReadings = [];
  for (const row of rows) {
    const doorNo = parseInt(row[0]);
    if (isNaN(doorNo) || doorNo < 1 || doorNo > 48) continue;

    const meterId = phandaMeterId(doorNo);
    const closingReading = row[2]; // CLOSING READING column
    const previousReading = marchByMeter[meterId];

    if (closingReading == null) {
      console.warn(`  ⚠ No closing reading for door ${doorNo}`);
      continue;
    }

    const consumption = previousReading != null ? closingReading - previousReading : null;

    newReadings.push({
      id: `reading-phanda-lodge-${padUnit(doorNo).toLowerCase().replace(' ', '-')}-${cycleDate}`,
      meter_id: meterId,
      cycle_id: cycleId,
      reading_date: cycleDate,
      reading_value: closingReading,
      previous_reading: previousReading ?? null,
      consumption: consumption,
      reading_type: 'actual',
      capture_method: 'imported_excel',
      review_status: 'approved',
      validation_status: 'validated',
      validation_reason: '',
      flags: [],
      source_file: xlsxPath,
      source_row_reference: `Phanda Lodge:${padUnit(doorNo)}:${cycleDate}`,
      imported_from: 'folder_excel',
      created_at: new Date().toISOString()
    });

    // Update meter last_reading
    const meter = db.meters.find(m => m.id === meterId);
    if (meter) {
      meter.last_reading = closingReading;
      meter.last_reading_date = cycleDate;
    }
  }

  // Append cycle and readings
  db.cycles.push(newCycle);
  db.historical_readings.push(...newReadings);
  db.generated_at = new Date().toISOString();

  // Update source_references to note the new folder is authoritative
  if (!db.source_references) db.source_references = {};
  db.source_references.folder_path = 'Buildings/buildings/Phanda Lodge/2026';
  db.source_references.note = 'New 2026 cycles sourced from building folder Excel files';

  writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`✓ Phanda Lodge: added cycle ${cycleId} with ${newReadings.length} unit readings`);
}

// ─── Vista Del Monte: Add LMS metadata ──────────────────────────────────────

function addVistaLmsMetadata() {
  const dbPath = join(BASE, 'Buildings/app-database/vista-del-monte.app-database.json');
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));

  // Add LMS flag to building
  if (!db.building.utility_manager) {
    db.building.utility_manager = 'LMS';
    db.building.reading_source = 'utility_manager';
    db.building.reading_source_note = 'Readings received from LMS (utility managing company). No on-site reading team required.';
    console.log('✓ Vista Del Monte: added LMS utility_manager flag to building');
  } else {
    console.log('✓ Vista Del Monte: LMS flag already present');
  }

  // Add LMS flag to scheme
  if (!db.scheme.utility_manager) {
    db.scheme.utility_manager = 'LMS';
    db.scheme.reading_source = 'utility_manager';
    db.scheme.reading_source_note = 'Readings received from LMS (utility managing company). No on-site reading team required.';
  }

  // Note the folder as source of truth
  if (!db.source_references) db.source_references = {};
  db.source_references.folder_path = 'Buildings/buildings/Vista Del Monte/2026';
  db.source_references.note = '2026 readings received from LMS as PDFs. Jan (2026.01.30) and Feb (2026.02.28) cycles imported. Mar (2026.03.31) cycle pending manual entry.';

  db.generated_at = new Date().toISOString();
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('✓ Vista Del Monte: updated source references and LMS metadata');
}

// ─── Main ────────────────────────────────────────────────────────────────────

try {
  addPhandaAprilCycle();
  addVistaLmsMetadata();
  console.log('\nDone. Run upload-building-app-database-to-firebase.mjs for phanda-lodge and vista-del-monte next.');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
