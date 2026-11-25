import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds a compact, offline-usable canonical meter list for the Flutter
 * mobile app (Mobile App/assets/meter_registry.json), sourced from the
 * same Buildings/app-database/*.app-database.json files the web admin
 * side already treats as the source of truth.
 *
 * Why a bundled asset instead of a live Firestore read: field readers are
 * often in basements/parking areas with poor signal, and the app is
 * already local-first (captures queue on-device and sync later) - the
 * canonical meter list should work the same way rather than adding a new
 * network dependency to the capture screen itself. Re-run this script
 * (and rebuild the app) whenever Buildings/app-database changes.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = path.resolve(__dirname, '..', 'Buildings', 'app-database');
const outputPath = path.resolve(__dirname, '..', 'Mobile App', 'assets', 'meter_registry.json');
// What readers actually capture per building (skips, on-meter names, extra
// meters). See the _about notes in the file itself.
const profilePath = path.resolve(__dirname, '..', 'Buildings', 'capture-profile.json');

// Maps the building "key" the Flutter app already uses (see
// Mobile App/lib/main.dart's `buildings` map) to its app-database slug.
const BUILDING_KEY_TO_SLUG = {
    'Azores': 'azores',
    'Carissa Lane': 'carissa-lane',
    'Genesis': 'genisis-on-fairmount',
    'Hazelmere': 'hazelmere',
    "L'Montagne": 'la-montagne',
    'Queensgate': 'queensgate',
    'Rivonia Gate': 'rivonia-gates',
    'Taragona': 'taragona',
    'Villino Glen': 'villino-glen',
    'Phanda Lodge': 'phanda-lodge',
    'Vista Del Monte': 'vista-del-monte',
    'Bonifay': 'bonifay',
    'Akasia': 'akasia'
    // 'Transvalia' intentionally omitted: no app-database file exists for
    // it (dormant client, see meter-app.md memory). The app will fall
    // back to free-text entry for that building, same as before.
};

const SERVICE_TYPE_TO_METER_TYPE = {
    electricity: 'Electricity',
    water: 'Water'
};

const meterKey = (type, number) => `${type}|${String(number).trim().toUpperCase().replace(/\s+/g, ' ')}`;

/**
 * Apply a building's capture profile: drop meters readers are not asked
 * for, attach the name written on the meter (aka), and add meters that are
 * read on site but missing from app-database. Returns the skipped meters
 * with their reasons so the run can report them.
 */
export function applyProfile(meters, profile = {}) {
    const skipped = [];
    const skipRule = (meter) => (profile.skip || []).find((rule) =>
        rule.type === meter.type &&
        ((rule.numbers || []).some((n) => meterKey(meter.type, n) === meterKey(meter.type, meter.number)) ||
            (rule.pattern && new RegExp(rule.pattern, 'i').test(meter.number))));
    const aka = Object.fromEntries(Object.entries(profile.aka || {}).map(([key, value]) => {
        const [type, ...number] = key.split('|');
        return [meterKey(type, number.join('|')), value];
    }));
    const kept = [];
    for (const meter of meters) {
        const rule = skipRule(meter);
        if (rule) { skipped.push({ ...meter, reason: rule.reason }); continue; }
        const name = aka[meterKey(meter.type, meter.number)];
        kept.push(name ? { ...meter, aka: name } : meter);
    }
    for (const extra of profile.extra || []) {
        if (kept.some((m) => meterKey(m.type, m.number) === meterKey(extra.type, extra.number))) continue;
        kept.push({ number: extra.number, type: extra.type, role: extra.role || 'unit', ...(extra.aka ? { aka: extra.aka } : {}) });
    }
    kept.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    return {
        meters: profile.optionalForCycle ? kept.map((meter) => ({ ...meter, requiredForCycle: false })) : kept,
        skipped
    };
}

function buildRegistry() {
    const registry = {};
    const profiles = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : {};
    const report = {};

    for (const [buildingKey, slug] of Object.entries(BUILDING_KEY_TO_SLUG)) {
        const filePath = path.join(sourceDir, `${slug}.app-database.json`);
        if (!fs.existsSync(filePath)) {
            console.warn(`No app-database file for "${buildingKey}" (expected ${filePath}) - skipping.`);
            continue;
        }

        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const meters = Array.isArray(payload.meters) ? payload.meters : [];

        const all = meters
            .filter((meter) => meter.meter_number)
            .map((meter) => ({
                number: String(meter.meter_number).trim(),
                type: SERVICE_TYPE_TO_METER_TYPE[meter.service_type] || 'Electricity',
                // meter_role is 'unit' | 'bulk' | 'common' in the source data.
                role: (meter.meter_role || 'unit').toLowerCase()
            }));
        const { meters: kept, skipped } = applyProfile(all, profiles[buildingKey]);
        registry[buildingKey] = kept;
        report[buildingKey] = { captured: kept.length, skipped: skipped.length };
    }

    return { registry, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    const { registry, report } = buildRegistry();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(registry));
    console.log(`Wrote ${outputPath}`);
    console.log(JSON.stringify(report, null, 2));
}
