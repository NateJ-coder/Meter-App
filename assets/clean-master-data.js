import { cleanMasterData, cleanMasterDataSummary, cleanMasterDataVersion } from './generated-clean-master-data.js';
import { storage } from './storage.js';

const SEED_STATE_KEY = 'fuzio_clean_master_data_seed_state';

function getCurrentMasterCounts() {
    return {
        schemes: storage.getSchemes().length,
        buildings: storage.getBuildings().length,
        units: storage.getUnits().length,
        meters: storage.getMeters().length,
    };
}

function hasMasterData(counts = getCurrentMasterCounts()) {
    return counts.schemes > 0 || counts.buildings > 0 || counts.units > 0 || counts.meters > 0;
}

function getSeedState() {
    const rawValue = localStorage.getItem(SEED_STATE_KEY);
    if (!rawValue) {
        return null;
    }

    try {
        return JSON.parse(rawValue);
    } catch {
        return null;
    }
}

function setSeedState(state) {
    localStorage.setItem(SEED_STATE_KEY, JSON.stringify(state));
}

function createImportAuditRecord(mode, counts) {
    return storage.create('import_batches', {
        import_type: 'clean_master_data_bundle',
        source_file: 'DataMigration/outputs/app-payloads/clean-master-data-bundle.json',
        imported_at: new Date().toISOString(),
        imported_by: 'bundled-bootstrap',
        imported_by_name: 'Bundled Clean Master Data',
        rows_processed: (counts.schemes || 0) + (counts.buildings || 0) + (counts.units || 0) + (counts.meters || 0),
        rows_approved: (counts.schemes || 0) + (counts.buildings || 0) + (counts.units || 0) + (counts.meters || 0),
        rows_flagged: 0,
        rows_rejected: 0,
        payload_summary: {
            mode,
            version: cleanMasterDataVersion,
            counts,
            generated_at: cleanMasterData?.metadata?.generated_at || null,
            source: cleanMasterData?.metadata?.source || null,
        }
    });
}

export function getBundledMasterDataSummary() {
    return cleanMasterDataSummary;
}

export async function ensureBundledMasterData(options = {}) {
    const force = options.force === true;
    const startingCounts = getCurrentMasterCounts();
    const bundleCounts = cleanMasterDataSummary?.counts || {};
    const seedState = getSeedState();

    if (!force && hasMasterData(startingCounts)) {
        return {
            seeded: false,
            reason: 'existing-master-data',
            counts: startingCounts,
            bundleCounts,
            seedState,
        };
    }

    if (!Array.isArray(cleanMasterData?.schemes) || cleanMasterData.schemes.length === 0) {
        return {
            seeded: false,
            reason: 'missing-bundle',
            counts: startingCounts,
            bundleCounts,
            seedState,
        };
    }

    await storage.upsertMany('schemes', cleanMasterData.schemes);
    await storage.upsertMany('buildings', cleanMasterData.buildings || []);
    await storage.upsertMany('units', cleanMasterData.units || []);
    await storage.upsertMany('meters', cleanMasterData.meters || []);

    const resultingCounts = getCurrentMasterCounts();
    const mode = force ? 'manual-merge' : 'empty-storage-bootstrap';
    const audit = createImportAuditRecord(mode, bundleCounts);

    setSeedState({
        version: cleanMasterDataVersion,
        imported_at: audit.imported_at,
        mode,
        bundle_counts: bundleCounts,
        resulting_counts: resultingCounts,
    });

    return {
        seeded: true,
        reason: mode,
        counts: resultingCounts,
        bundleCounts,
        auditId: audit.id,
    };
}