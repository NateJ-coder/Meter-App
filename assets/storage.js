/**
 * storage.js - localStorage Data Layer
 * Provides CRUD operations for all entities
 */

export const storage = {
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
        localStorage.setItem(entity, JSON.stringify(items));
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
        localStorage.setItem(entity, JSON.stringify(items));
        return items[index];
    },

    delete(entity, id) {
        const items = this.getAll(entity);
        const filtered = items.filter(item => item.id !== id);
        localStorage.setItem(entity, JSON.stringify(filtered));
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
