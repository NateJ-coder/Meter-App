import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Builds assets/export-layouts.json: for every building the dashboard
 * knows, the ELECTRICITY and WATER meter rows of its Utility Dash sheet,
 * in sheet order. The dashboard's "Export to Excel" uses this to lay the
 * captured readings out in the same order as the workbook, so a column
 * can be checked (or pasted) top to bottom without re-sorting.
 *
 * The workbook is read-only here; nothing is written back to it.
 *
 *   node scripts/generate-export-layouts.mjs ["path/to/Utility Dash ... .xlsm"]
 *
 * Defaults to the live workbook in C:\Projects\Projects\Claude\Utilities,
 * falling back to the archived copy in legacy-ud/.
 */

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(projectRoot, 'assets', 'export-layouts.json');

const candidates = [
    process.argv[2],
    'C:\\Projects\\Projects\\Claude\\Utilities\\Utility Dash 9 September 2026 - Editable (1).xlsm',
    path.join(projectRoot, 'legacy-ud', 'Utility Dash 9 Mar 2026.xlsm')
].filter(Boolean);
const workbookPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!workbookPath) {
    console.error('No Utility Dash workbook found. Pass its path as the first argument.');
    process.exit(1);
}

// Dashboard building value -> Utility Dash sheet name.
const SHEETS = {
    Azores: 'The Azores',
    'Carissa Lane': 'Carissa Lane',
    Genesis: 'Genesis',
    Hazelmere: 'Hazelmere',
    "L'Montagne": "L'Montagne",
    Queensgate: 'Queensgate',
    'Rivonia Gate': 'Rivonia Gate',
    Taragona: 'Taragona',
    Transvalia: 'Transvalia',
    'Villino Glen': 'Vilino Glen',
    'Phanda Lodge': 'Phanda Lodge',
    'Vista Del Monte': 'Vista Del Monte',
    Bonifay: 'Bonifay Court',
    Akasia: 'Akasia'
};

const workbook = XLSX.readFile(workbookPath, { cellFormula: false, cellHTML: false, sheets: Object.values(SHEETS) });

function columnA(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    return rows.map((row) => (row && row[0] != null ? String(row[0]).trim() : ''));
}

function blockRows(labels, start, end) {
    const rows = [];
    for (let index = start; index < end; index += 1) {
        if (labels[index]) rows.push({ label: labels[index], row: index + 1 });
    }
    return rows;
}

const layouts = {};
for (const [building, sheetName] of Object.entries(SHEETS)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        console.warn(`Sheet "${sheetName}" not found for ${building} - skipped.`);
        continue;
    }
    const labels = columnA(sheet).map((label) => label.toUpperCase() === label ? label : label);
    const upper = labels.map((label) => label.toUpperCase());
    const electricityHeader = upper.indexOf('ELECTRICITY');
    const waterHeader = upper.indexOf('WATER', electricityHeader + 1);
    const statsHeader = upper.indexOf('MONTHLY STATS', waterHeader + 1);
    if (electricityHeader < 0 || waterHeader < 0 || statsHeader < 0) {
        console.warn(`Could not find ELECTRICITY / WATER / MONTHLY STATS rows for ${building} - skipped.`);
        continue;
    }
    layouts[building] = {
        sheet: sheetName,
        electricity: blockRows(labels, electricityHeader + 1, waterHeader),
        water: blockRows(labels, waterHeader + 1, statsHeader)
    };
}

const payload = {
    generatedAt: new Date().toISOString(),
    source: path.basename(workbookPath),
    layouts
};
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 1) + '\n');
console.log(`Wrote ${outputPath} from "${workbookPath}"`);
for (const [building, layout] of Object.entries(layouts)) {
    console.log(`  ${building}: ${layout.electricity.length} electricity rows, ${layout.water.length} water rows`);
}
