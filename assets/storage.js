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
    cycles: firebaseCollections.cycles,
    readings: firebaseCollections.readings,
    cycle_schedules: firebaseCollections.cycleSchedules
};

function sanitizeForFirestore(value) {
    return JSON.parse(JSON.stringify(value));
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
        const newItem = {
            id: this.generateId(),
            ...data,
            created_at: new Date().toISOString()
        };
        items.push(newItem);
        writeEntityToLocalCache(entity, items);
        this.queueCloudUpsert(entity, newItem);
        return newItem;
    },

    update(entity, id, data) {
        const items = this.getAll(entity);
        const index = items.findIndex(item => item.id === id);
        if (index === -1) return null;
        
        items[index] = {
            ...items[index],
            ...data,
            updated_at: new Date().toISOString()
        };
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

        this.operationalEntityKeys.forEach((entity) => {
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
        if (meterType) meters = meters.filter(m => m.meter_type === meterType);
        return meters;
    },

    getCycles(schemeId = null) {
        const cycles = this.getAll('cycles');
        return schemeId ? cycles.filter(c => c.scheme_id === schemeId) : cycles;
    },

    getReadings(cycleId = null) {
        const readings = this.getAll('readings');
        return cycleId ? readings.filter(r => r.cycle_id === cycleId) : readings;
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
