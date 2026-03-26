/**
 * storage.js - localStorage Data Layer
 * Provides CRUD operations for all entities
 */

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    setDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { firebaseCollections, firebaseDb, isFirebaseConfigured } from './firebase.js';

const cloudEntityCollections = {
    schemes: firebaseCollections.schemes,
    buildings: firebaseCollections.buildings,
    units: firebaseCollections.units,
    meters: firebaseCollections.meters,
    meter_relationships: firebaseCollections.meterRelationships,
    cycles: firebaseCollections.cycles,
    readings: firebaseCollections.readings,
    cycle_schedules: firebaseCollections.cycleSchedules,
    meter_charges: firebaseCollections.meterCharges,
    meter_evidence: firebaseCollections.meterEvidence,
    meter_flags: firebaseCollections.meterFlags,
    legacy_meter_map: firebaseCollections.legacyMeterMap,
    dispute_cases: firebaseCollections.disputeCases,
    dispute_pack_exports: firebaseCollections.disputePackExports
};

const meterRoleByType = {
    BULK: 'bulk',
    COMMON: 'common_property',
    UNIT: 'unit',
    SUBMETER: 'submeter',
    CHECK: 'check_meter',
    UNKNOWN: 'legacy_unknown'
};

const meterTypeByRole = {
    bulk: 'BULK',
    common_property: 'COMMON',
    unit: 'UNIT',
    submeter: 'UNIT',
    check_meter: 'CHECK',
    legacy_unknown: 'UNKNOWN'
};

function sanitizeForFirestore(value) {
    return JSON.parse(JSON.stringify(value));
}

function inferMeterRole(data = {}) {
    const explicitRole = String(data.meter_role || '').trim().toLowerCase();
    if (explicitRole) {
        return explicitRole;
    }

    const explicitType = String(data.meter_type || '').trim().toUpperCase();
    if (explicitType && meterRoleByType[explicitType]) {
        return meterRoleByType[explicitType];
    }

    return 'legacy_unknown';
}

function inferMeterType(data = {}) {
    const explicitType = String(data.meter_type || '').trim().toUpperCase();
    if (explicitType) {
        return explicitType;
    }

    return meterTypeByRole[inferMeterRole(data)] || 'UNKNOWN';
}

function inferCaptureMethod(data = {}) {
    if (data.capture_method) {
        return data.capture_method;
    }

    if (data.imported_from === 'utility_dash' || data.source_file) {
        return 'imported_excel';
    }

    return 'manual';
}

function normalizeEntityPayload(entity, data) {
    const record = { ...data };

    switch (entity) {
        case 'meters': {
            const meterRole = inferMeterRole(record);
            const meterType = inferMeterType(record);

            return {
                ...record,
                meter_role: meterRole,
                meter_type: meterType,
                service_type: record.service_type || 'electricity',
                location_description: record.location_description || record.meter_location || '',
                parent_meter_id: record.parent_meter_id || null,
                hierarchy_level: record.hierarchy_level ?? (meterRole === 'bulk' ? 0 : 1),
                reconciliation_group: record.reconciliation_group || record.scheme_id || null,
                is_active: typeof record.is_active === 'boolean'
                    ? record.is_active
                    : String(record.status || '').toLowerCase() !== 'inactive',
                source_confidence: record.source_confidence || (record.imported_from ? 'medium' : 'high'),
                verified_by: record.verified_by || null
            };
        }
        case 'readings': {
            const hasFlags = Boolean(record.flags?.length) || Boolean(record.manual_flags?.length);
            const validationStatus = record.validation_status
                || (record.is_validated ? 'validated' : hasFlags ? 'needs_review' : 'pending');

            return {
                ...record,
                reading_type: record.reading_type || 'actual',
                capture_method: inferCaptureMethod(record),
                evidence_link: record.evidence_link || null,
                source_file: record.source_file || null,
                source_row_reference: record.source_row_reference || null,
                is_validated: typeof record.is_validated === 'boolean' ? record.is_validated : false,
                validation_status: validationStatus,
                validation_reason: record.validation_reason || ''
            };
        }
        case 'meter_charges':
            return {
                ...record,
                charge_type: record.charge_type || 'consumption',
                source: record.source || 'manual',
                vat: record.vat ?? 0,
                tariff: record.tariff ?? null,
                reversal_of_charge_id: record.reversal_of_charge_id || null
            };
        case 'meter_evidence':
            return {
                ...record,
                evidence_type: record.evidence_type || 'photo',
                capture_method: inferCaptureMethod(record),
                review_status: record.review_status || 'pending',
                meter_id: record.meter_id || null,
                related_reading_id: record.related_reading_id || null
            };
        case 'meter_flags':
            return {
                ...record,
                status: record.status || 'open',
                created_by_rule: record.created_by_rule || 'manual'
            };
        case 'legacy_meter_map':
            return {
                ...record,
                mapping_confidence: record.mapping_confidence || 'low',
                review_status: record.review_status || 'pending'
            };
        case 'dispute_cases':
            return {
                ...record,
                status: record.status || 'open'
            };
        case 'dispute_pack_exports':
            return {
                ...record,
                status: record.status || 'generated'
            };
        default:
            return record;
    }
}

function writeEntityToLocalCache(entity, items) {
    localStorage.setItem(entity, JSON.stringify(items));
}

async function commitChunkedBatch(operations) {
    const chunkSize = 350;

    for (let index = 0; index < operations.length; index += chunkSize) {
        const chunk = operations.slice(index, index + chunkSize);
        const batch = writeBatch(firebaseDb);

        chunk.forEach((operation) => {
            const reference = doc(firebaseDb, operation.collectionName, operation.id);

            if (operation.type === 'delete') {
                batch.delete(reference);
                return;
            }

            batch.set(reference, operation.data);
        });

        await batch.commit();
    }
}

export const storage = {
    managedEntityKeys: Object.keys(cloudEntityCollections),
    operationalEntityKeys: ['schemes', 'buildings', 'units', 'meters', 'readings', 'cycles', 'cycle_schedules'],
    cloudSyncEnabled: false,
    cloudSyncPromise: Promise.resolve(),

    // Generic CRUD operations
    getAll(entity) {
        const data = localStorage.getItem(entity);
        return data ? JSON.parse(data) : [];
    },

    get(entity, id) {
        const items = this.getAll(entity);
        return items.find(item => item.id === id);
    },

    create(entity, data) {
        const items = this.getAll(entity);
        const newItem = normalizeEntityPayload(entity, {
            id: this.generateId(),
            ...data,
            created_at: new Date().toISOString()
        });
        items.push(newItem);
        writeEntityToLocalCache(entity, items);
        this.queueCloudUpsert(entity, newItem);
        return newItem;
    },

    update(entity, id, data) {
        const items = this.getAll(entity);
        const index = items.findIndex(item => item.id === id);
        if (index === -1) return null;
        
        items[index] = normalizeEntityPayload(entity, {
            ...items[index],
            ...data,
            updated_at: new Date().toISOString()
        });
        writeEntityToLocalCache(entity, items);
        this.queueCloudUpsert(entity, items[index]);
        return items[index];
    },

    delete(entity, id) {
        const items = this.getAll(entity);
        const filtered = items.filter(item => item.id !== id);
        writeEntityToLocalCache(entity, filtered);
        this.queueCloudDelete(entity, id);
        return true;
    },

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Clear all data (for testing)
    clearAll() {
        localStorage.clear();
    },

    async initializeCloudSync(options = {}) {
        if (!isFirebaseConfigured()) {
            this.cloudSyncEnabled = false;
            return false;
        }

        this.cloudSyncEnabled = true;

        if (options.preload !== false) {
            await this.hydrateFromCloud(options);
        }

        return true;
    },

    async hydrateFromCloud(options = {}) {
        if (!isFirebaseConfigured()) {
            return {};
        }

        const counts = {};

        for (const [entity, collectionName] of Object.entries(cloudEntityCollections)) {
            try {
                const snapshot = await getDocs(collection(firebaseDb, collectionName));
                const items = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
                counts[entity] = items.length;

                if (items.length > 0 || options.clearMissing === true) {
                    writeEntityToLocalCache(entity, items);
                }
            } catch (error) {
                if (error?.code === 'permission-denied') {
                    throw new Error(`Firestore read denied for ${collectionName}. Ensure the Firestore rules allow access to this collection and that the signed-in user has a users/{uid} profile.`);
                }

                throw error;
            }
        }

        return counts;
    },

    async replaceOperationalData(payload, options = {}) {
        const pushToCloud = options.pushToCloud !== false && isFirebaseConfigured();

        for (const entity of Object.keys(cloudEntityCollections)) {
            if (!Object.prototype.hasOwnProperty.call(payload, entity)) {
                continue;
            }

            const items = Array.isArray(payload[entity]) ? payload[entity] : [];
            writeEntityToLocalCache(entity, items);

            if (pushToCloud) {
                await this.replaceCloudEntity(entity, items);
            }
        }
    },

    async replaceCloudEntity(entity, items) {
        const collectionName = cloudEntityCollections[entity];
        if (!collectionName || !isFirebaseConfigured()) {
            return;
        }

        const snapshot = await getDocs(collection(firebaseDb, collectionName));
        const existingIds = new Set(snapshot.docs.map((entry) => entry.id));
        const nextIds = new Set(items.map((entry) => entry.id));
        const operations = [];

        existingIds.forEach((id) => {
            if (!nextIds.has(id)) {
                operations.push({ type: 'delete', collectionName, id });
            }
        });

        items.forEach((item) => {
            operations.push({
                type: 'set',
                collectionName,
                id: item.id,
                data: sanitizeForFirestore(item)
            });
        });

        await commitChunkedBatch(operations);
    },

    queueCloudUpsert(entity, item) {
        const collectionName = cloudEntityCollections[entity];
        if (!collectionName || !this.cloudSyncEnabled || !isFirebaseConfigured()) {
            return;
        }

        this.cloudSyncPromise = this.cloudSyncPromise
            .then(() => setDoc(doc(firebaseDb, collectionName, item.id), sanitizeForFirestore(item)))
            .catch((error) => {
                console.error(`Cloud upsert failed for ${entity}/${item.id}`, error);
            });
    },

    queueCloudDelete(entity, id) {
        const collectionName = cloudEntityCollections[entity];
        if (!collectionName || !this.cloudSyncEnabled || !isFirebaseConfigured()) {
            return;
        }

        this.cloudSyncPromise = this.cloudSyncPromise
            .then(() => deleteDoc(doc(firebaseDb, collectionName, id)))
            .catch((error) => {
                console.error(`Cloud delete failed for ${entity}/${id}`, error);
            });
    },

    clearOperationalData(options = {}) {
        const preserveKeys = new Set(options.preserveKeys || []);

        this.managedEntityKeys.forEach((entity) => {
            if (!preserveKeys.has(entity)) {
                localStorage.removeItem(entity);
            }
        });

        localStorage.removeItem('fuzio_onboarding_state');
        localStorage.removeItem('fuzio_first_time_checklist');
    },

    // Entity-specific helpers
    getSchemes() {
        return this.getAll('schemes');
    },

    getBuildings(schemeId = null) {
        const buildings = this.getAll('buildings');
        return schemeId ? buildings.filter(b => b.scheme_id === schemeId) : buildings;
    },

    getUnits(buildingId = null) {
        const units = this.getAll('units');
        return buildingId ? units.filter(u => u.building_id === buildingId) : units;
    },

    getMeters(schemeId = null, meterType = null) {
        let meters = this.getAll('meters');
        if (schemeId) meters = meters.filter(m => m.scheme_id === schemeId);
        if (meterType) {
            const normalizedMeterType = String(meterType).toUpperCase();
            meters = meters.filter(m => String(m.meter_type || '').toUpperCase() === normalizedMeterType);
        }
        return meters;
    },

    getMeterRelationships(meterId = null) {
        const relationships = this.getAll('meter_relationships');
        return meterId
            ? relationships.filter(r => r.parent_meter_id === meterId || r.child_meter_id === meterId)
            : relationships;
    },

    getCycles(schemeId = null) {
        const cycles = this.getAll('cycles');
        return schemeId ? cycles.filter(c => c.scheme_id === schemeId) : cycles;
    },

    getReadings(cycleId = null) {
        const readings = this.getAll('readings');
        return cycleId ? readings.filter(r => r.cycle_id === cycleId) : readings;
    },

    getMeterCharges(meterId = null) {
        const charges = this.getAll('meter_charges');
        return meterId ? charges.filter(charge => charge.meter_id === meterId) : charges;
    },

    getMeterEvidence(filters = {}) {
        let evidence = this.getAll('meter_evidence');
        if (filters.meterId) evidence = evidence.filter(item => item.meter_id === filters.meterId);
        if (filters.readingId) evidence = evidence.filter(item => item.related_reading_id === filters.readingId);
        if (filters.evidenceType) evidence = evidence.filter(item => item.evidence_type === filters.evidenceType);
        return evidence;
    },

    getMeterFlags(filters = {}) {
        let flags = this.getAll('meter_flags');
        if (filters.meterId) flags = flags.filter(flag => flag.meter_id === filters.meterId);
        if (filters.readingId) flags = flags.filter(flag => flag.reading_id === filters.readingId);
        if (filters.status) flags = flags.filter(flag => flag.status === filters.status);
        return flags;
    },

    getLegacyMeterMap(reviewStatus = null) {
        const mappings = this.getAll('legacy_meter_map');
        return reviewStatus ? mappings.filter(item => item.review_status === reviewStatus) : mappings;
    },

    // Get open cycle for a scheme
    getOpenCycle(schemeId = null) {
        const cycles = this.getCycles(schemeId);
        return cycles.find(c => c.status === 'OPEN');
    },

    // Get meter with unit details
    getMeterWithDetails(meterId) {
        const meter = this.get('meters', meterId);
        if (!meter) return null;

        let unitName = null;
        let buildingName = null;
        
        if (meter.unit_id) {
            const unit = this.get('units', meter.unit_id);
            if (unit) {
                unitName = unit.unit_number;
                const building = this.get('buildings', unit.building_id);
                if (building) buildingName = building.name;
            }
        }

        return {
            ...meter,
            meter_role: meter.meter_role || inferMeterRole(meter),
            unit_name: unitName,
            building_name: buildingName
        };
    },

    // Get reading with all related data
    getReadingWithDetails(readingId) {
        const reading = this.get('readings', readingId);
        if (!reading) return null;

        const meter = this.getMeterWithDetails(reading.meter_id);
        const cycle = this.get('cycles', reading.cycle_id);

        return {
            ...reading,
            meter,
            cycle
        };
    }
};
