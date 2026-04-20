import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { doc, getFirestore, setDoc, writeBatch } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SOURCE = path.resolve(__dirname, '..', 'source-documents', '03-extracted-outputs', 'utility-dash-app', 'utility-dash-operational-baseline.json');

const firebaseConfig = {
    apiKey: 'AIzaSyBz89GtOjx7c__t1pu9yD2ata9-4ITZilk',
    authDomain: 'meter-app-36307.firebaseapp.com',
    projectId: 'meter-app-36307',
    storageBucket: 'meter-app-36307.firebasestorage.app',
    messagingSenderId: '185231576035',
    appId: '1:185231576035:web:5da1b1cf690d6cceda2ed6'
};

const entityCollections = {
    schemes: 'schemes',
    buildings: 'buildings',
    units: 'units',
    meters: 'meters',
    cycles: 'cycles',
    readings: 'readings',
    legacy_meter_map: 'legacy_meter_map'
};

function parseArgs(argv) {
    const options = {
        source: DEFAULT_SOURCE
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const nextArg = argv[index + 1];

        if (arg === '--source' && nextArg) {
            options.source = path.resolve(nextArg);
            index += 1;
        }
    }

    return options;
}

async function writeEntityCollection(db, collectionName, records) {
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
    const payload = JSON.parse(fs.readFileSync(options.source, 'utf8'));
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    for (const [entity, collectionName] of Object.entries(entityCollections)) {
        const records = Array.isArray(payload[entity]) ? payload[entity] : [];
        if (records.length === 0) {
            continue;
        }

        await writeEntityCollection(db, collectionName, records);
    }

    const importAuditId = `upload-${Date.now()}`;
    await setDoc(doc(db, 'import_batches', importAuditId), {
        id: importAuditId,
        import_type: 'utility_dash_operational_baseline',
        source_file: options.source,
        imported_at: new Date().toISOString(),
        imported_by_name: 'Terminal Uploader',
        rows_processed: payload.readings?.length || 0,
        rows_approved: payload.readings?.length || 0,
        rows_flagged: payload.readings?.filter((reading) => Array.isArray(reading.flags) && reading.flags.length > 0).length || 0,
        rows_rejected: 0,
        payload_summary: {
            import_strategy: payload.metadata?.import_strategy || 'operational_baseline',
            history_window_per_meter: payload.metadata?.history_window_per_meter || null,
            original_counts: payload.metadata?.original_counts || null,
            retained_counts: payload.metadata?.retained_counts || null,
            generated_at: payload.metadata?.generated_at || null,
            baseline_generated_at: payload.metadata?.baseline_generated_at || null,
            notes: payload.metadata?.notes || []
        }
    });

    console.log(JSON.stringify({
        uploadedFrom: options.source,
        counts: {
            schemes: payload.schemes?.length || 0,
            buildings: payload.buildings?.length || 0,
            units: payload.units?.length || 0,
            meters: payload.meters?.length || 0,
            cycles: payload.cycles?.length || 0,
            readings: payload.readings?.length || 0,
            legacy_meter_map: payload.legacy_meter_map?.length || 0
        },
        importAuditId
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});