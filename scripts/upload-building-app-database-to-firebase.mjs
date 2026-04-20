import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { doc, getFirestore, setDoc, writeBatch } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SOURCE_DIR = path.resolve(__dirname, '..', 'Buildings', 'app-database');

const firebaseConfig = {
    apiKey: 'AIzaSyBz89GtOjx7c__t1pu9yD2ata9-4ITZilk',
    authDomain: 'meter-app-36307.firebaseapp.com',
    projectId: 'meter-app-36307',
    storageBucket: 'meter-app-36307.firebasestorage.app',
    messagingSenderId: '185231576035',
    appId: '1:185231576035:web:5da1b1cf690d6cceda2ed6'
};

const registryCollections = {
    schemes: 'schemes',
    buildings: 'buildings',
    units: 'units',
    meters: 'meters'
};

function parseArgs(argv) {
    const options = {
        sourceDir: DEFAULT_SOURCE_DIR,
        onlySlug: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const nextArg = argv[index + 1];

        if (arg === '--source-dir' && nextArg) {
            options.sourceDir = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--building' && nextArg) {
            options.onlySlug = String(nextArg).trim().toLowerCase();
            index += 1;
        }
    }

    return options;
}

function listPayloadPaths(sourceDir, onlySlug) {
    const allFiles = fs.readdirSync(sourceDir)
        .filter((entry) => entry.endsWith('.app-database.json'))
        .map((entry) => path.join(sourceDir, entry))
        .sort();

    if (!onlySlug) {
        return allFiles;
    }

    return allFiles.filter((filePath) => path.basename(filePath).toLowerCase().startsWith(`${onlySlug}.`));
}

async function writeEntityCollection(db, collectionName, records) {
    if (!records.length) {
        return;
    }

    const chunkSize = 400;
    for (let index = 0; index < records.length; index += chunkSize) {
        const chunk = records.slice(index, index + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach((record) => {
            batch.set(doc(db, collectionName, record.id), record);
        });

        await batch.commit();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const payloadPaths = listPayloadPaths(options.sourceDir, options.onlySlug);

    if (payloadPaths.length === 0) {
        throw new Error('No building app-database payloads matched the requested source path or building slug.');
    }

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const importResults = [];

    for (const payloadPath of payloadPaths) {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        const schemes = payload.scheme ? [payload.scheme] : [];
        const buildings = payload.building ? [payload.building] : [];
        const units = Array.isArray(payload.units) ? payload.units : [];
        const meters = Array.isArray(payload.meters) ? payload.meters : [];

        await writeEntityCollection(db, registryCollections.schemes, schemes);
        await writeEntityCollection(db, registryCollections.buildings, buildings);
        await writeEntityCollection(db, registryCollections.units, units);
        await writeEntityCollection(db, registryCollections.meters, meters);

        const importAuditId = `building-registry-${payload.building_slug || Date.now()}-${Date.now()}`;
        await setDoc(doc(db, 'import_batches', importAuditId), {
            id: importAuditId,
            import_type: 'building_app_database_registry',
            source_file: payloadPath,
            imported_at: new Date().toISOString(),
            imported_by_name: 'Terminal Uploader',
            rows_processed: units.length + meters.length + buildings.length + schemes.length,
            rows_approved: units.length + meters.length + buildings.length + schemes.length,
            rows_flagged: 0,
            rows_rejected: 0,
            payload_summary: {
                building_slug: payload.building_slug || null,
                generated_at: payload.generated_at || null,
                scheme_name: payload.scheme?.name || null,
                building_name: payload.building?.name || null,
                schemes: schemes.length,
                buildings: buildings.length,
                units: units.length,
                meters: meters.length,
                source_references: payload.source_references || {}
            }
        });

        importResults.push({
            payload: path.basename(payloadPath),
            scheme: payload.scheme?.name || null,
            building: payload.building?.name || null,
            units: units.length,
            meters: meters.length,
            importAuditId
        });
    }

    console.log(JSON.stringify({
        sourceDir: options.sourceDir,
        importedPayloads: importResults
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});