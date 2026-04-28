/**
 * purge-pipeline-cycles.mjs
 *
 * Removes all historical-pipeline cycles (and their readings) from Firestore.
 *
 * Pipeline cycles are identified by:
 *   • imported_from === 'utility_dash_macrofree'   (primary)
 *   • OR start_date === end_date                   (secondary — single-day cycles are never real)
 *
 * Real operational cycles always span a date range and have NO imported_from field.
 *
 * Usage:
 *   node scripts/purge-pipeline-cycles.mjs --dry-run      # preview only
 *   node scripts/purge-pipeline-cycles.mjs --confirm      # actually delete
 *   node scripts/purge-pipeline-cycles.mjs --scheme akasia --confirm  # single scheme
 */

import { initializeApp } from 'firebase/app';
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    query,
    where,
    writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'AIzaSyBz89GtOjx7c__t1pu9yD2ata9-4ITZilk',
    authDomain: 'meter-app-36307.firebaseapp.com',
    projectId: 'meter-app-36307',
    storageBucket: 'meter-app-36307.firebasestorage.app',
    messagingSenderId: '185231576035',
    appId: '1:185231576035:web:5da1b1cf690d6cceda2ed6'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function parseArgs(argv) {
    const opts = { dryRun: true, scheme: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--confirm') opts.dryRun = false;
        if (argv[i] === '--dry-run') opts.dryRun = true;
        if (argv[i] === '--scheme' && argv[i + 1]) { opts.scheme = argv[i + 1]; i++; }
    }
    return opts;
}

function isPipelineCycle(cycle) {
    const importedFrom = String(cycle.imported_from || '').trim().toLowerCase();
    const singleDay = cycle.start_date && cycle.end_date && cycle.start_date === cycle.end_date;
    return importedFrom === 'utility_dash_macrofree' || singleDay;
}

async function deleteInBatches(db, operations) {
    const CHUNK = 450;
    for (let i = 0; i < operations.length; i += CHUNK) {
        const batch = writeBatch(db);
        operations.slice(i, i + CHUNK).forEach(({ colName, id }) => {
            batch.delete(doc(db, colName, id));
        });
        await batch.commit();
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    console.log(`\n🔍  Mode: ${opts.dryRun ? 'DRY RUN (no changes)' : '⚠  LIVE DELETE'}`);
    if (opts.scheme) console.log(`    Scoped to scheme: ${opts.scheme}`);

    // ── Fetch all cycles ───────────────────────────────────────────────
    let cyclesSnap;
    if (opts.scheme) {
        const schemeId = opts.scheme.startsWith('scheme-') ? opts.scheme : `scheme-${opts.scheme}`;
        cyclesSnap = await getDocs(
            query(collection(db, 'cycles'), where('scheme_id', '==', schemeId))
        );
    } else {
        cyclesSnap = await getDocs(collection(db, 'cycles'));
    }

    const allCycles = cyclesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pipelineCycles = allCycles.filter(isPipelineCycle);
    const safeCycles = allCycles.filter(c => !isPipelineCycle(c));

    console.log(`\n  Total cycles found:       ${allCycles.length}`);
    console.log(`  Pipeline cycles to purge: ${pipelineCycles.length}`);
    console.log(`  Operational cycles kept:  ${safeCycles.length}`);

    if (pipelineCycles.length === 0) {
        console.log('\n✅  Nothing to delete.');
        process.exit(0);
    }

    // Preview
    const byScheme = {};
    pipelineCycles.forEach(c => {
        const s = c.scheme_id || 'unknown';
        byScheme[s] = (byScheme[s] || 0) + 1;
    });
    console.log('\n  Pipeline cycles by scheme:');
    Object.entries(byScheme).sort().forEach(([s, n]) => console.log(`    ${s}: ${n}`));

    // ── Fetch matching readings ────────────────────────────────────────
    const pipelineCycleIds = new Set(pipelineCycles.map(c => c.id));

    // Firestore IN queries are capped at 30 items; chunk them
    const pipelineIdArray = [...pipelineCycleIds];
    let pipelineReadings = [];
    for (let i = 0; i < pipelineIdArray.length; i += 30) {
        const chunk = pipelineIdArray.slice(i, i + 30);
        const snap = await getDocs(
            query(collection(db, 'readings'), where('cycle_id', 'in', chunk))
        );
        snap.docs.forEach(d => pipelineReadings.push({ id: d.id }));
    }

    console.log(`\n  Readings linked to pipeline cycles: ${pipelineReadings.length}`);

    if (opts.dryRun) {
        console.log('\n  (Dry run — nothing deleted. Re-run with --confirm to execute.)\n');
        process.exit(0);
    }

    // ── Delete readings first, then cycles ────────────────────────────
    const readingOps = pipelineReadings.map(r => ({ colName: 'readings', id: r.id }));
    const cycleOps   = pipelineCycles.map(c => ({ colName: 'cycles',   id: c.id }));

    console.log('\n  Deleting readings…');
    await deleteInBatches(db, readingOps);
    console.log(`  Deleted ${readingOps.length} readings.`);

    console.log('  Deleting cycles…');
    await deleteInBatches(db, cycleOps);
    console.log(`  Deleted ${cycleOps.length} cycles.`);

    console.log('\n✅  Purge complete.\n');
    process.exit(0);
}

main().catch(err => {
    console.error('\n❌  Error:', err.message || err);
    process.exit(1);
});
