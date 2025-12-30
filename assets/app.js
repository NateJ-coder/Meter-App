/**
 * app.js - Main Application Logic & Seed Data
 * Shared helpers and initialization
 */

import { storage } from './storage.js';
import { router } from './router.js';

/**
 * Initialize seed data on first run
 */
export function initializeSeedData() {
    // Check if data already exists
    if (storage.getAll('schemes').length > 0) {
        return; // Data already seeded
    }

    console.log('Initializing seed data...');

    // Create scheme
    const scheme = storage.create('schemes', {
        name: 'Fuzio Gardens',
        address: '123 Main Street, Cape Town, 8001'
    });

    // Create building
    const building = storage.create('buildings', {
        scheme_id: scheme.id,
        name: 'Block A'
    });

    // Create 6 units
    const units = [];
    const unitNumbers = ['A101', 'A102', 'A103', 'A201', 'A202', 'A203'];
    const owners = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia'];

    unitNumbers.forEach((unitNumber, index) => {
        const unit = storage.create('units', {
            building_id: building.id,
            unit_number: unitNumber,
            owner_name: owners[index]
        });
        units.push(unit);
    });

    // Create 1 BULK meter
    storage.create('meters', {
        scheme_id: scheme.id,
        meter_type: 'BULK',
        meter_number: 'BULK-001',
        last_reading: 12500,
        status: 'active'
    });

    // Create 6 UNIT meters (one per unit)
    units.forEach((unit, index) => {
        storage.create('meters', {
            scheme_id: scheme.id,
            unit_id: unit.id,
            meter_type: 'UNIT',
            meter_number: `UNIT-${String(index + 1).padStart(3, '0')}`,
            last_reading: 1000 + (index * 100), // Staggered readings
            status: 'active'
        });
    });

    console.log('Seed data initialized successfully!');
}

/**
 * Format date for display
 */
export function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-ZA', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Get current datetime in local format
 */
export function getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Show notification (simple alert for now)
 */
export function showNotification(message, type = 'info') {
    // In production: use a proper toast/notification library
    alert(message);
}

/**
 * Confirm action
 */
export function confirmAction(message) {
    return confirm(message);
}

/**
 * Format number with 2 decimals
 */
export function formatNumber(num) {
    if (num == null || isNaN(num)) return 'N/A';
    return Number(num).toFixed(2);
}

// Export router for convenience
export { router };
