import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, writeBatch } from 'firebase/firestore';

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

function sanitizeForFirestore(value) {
    return JSON.parse(JSON.stringify(value));
}

async function commitOperations(db, operations) {
    const chunkSize = 350;

    for (let index = 0; index < operations.length; index += chunkSize) {
        const chunk = operations.slice(index, index + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach((operation) => {
            const reference = doc(db, operation.collectionName, operation.id);

            if (operation.type === 'delete') {
                batch.delete(reference);
                return;
            }

            batch.set(reference, operation.data);
        });

        await batch.commit();
    }
}

async function replaceCollection(db, collectionName, records) {
    const snapshot = await getDocs(collection(db, collectionName));
    const existingIds = new Set(snapshot.docs.map((entry) => entry.id));
    const nextIds = new Set(records.map((entry) => entry.id));
    const operations = [];

    existingIds.forEach((id) => {
        if (!nextIds.has(id)) {
            operations.push({
                type: 'delete',
                collectionName,
                id
            });
        }
    });

    records.forEach((record) => {
        operations.push({
            type: 'set',
            collectionName,
            id: record.id,
            data: sanitizeForFirestore(record)
        });
    });

    if (operations.length > 0) {
        await commitOperations(db, operations);
    }

    return {
        existing: existingIds.size,
        next: records.length,
        deleted: [...existingIds].filter((id) => !nextIds.has(id)).length,
        upserted: records.length
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const payload = JSON.parse(fs.readFileSync(options.source, 'utf8'));
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const summary = {
        source: options.source,
        collections: {}
    };

    for (const [entity, collectionName] of Object.entries(entityCollections)) {
        const records = Array.isArray(payload[entity]) ? payload[entity] : [];
        summary.collections[collectionName] = await replaceCollection(db, collectionName, records);
    }

    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});