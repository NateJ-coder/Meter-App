/**
 * app.js - Main Application Logic & Seed Data
 * Shared helpers and initialization
 */

import { storage } from './storage.js';
import { router } from './router.js';

/**
 * Initialize seed data on first run (OPTIONAL - for demo purposes)
 * To enable: uncomment the function call in index.html
 */
export function initializeSeedData() {
    // Check if data already exists
    if (storage.getAll('schemes').length > 0) {
        return; // Data already exists
    }

    console.log('No seed data - start by creating your first scheme in Meter Register');
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
