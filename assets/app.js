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

/**
 * Parse a human-entered decimal value in a forgiving way.
 * Accepts decimal dots or commas and strips common thousands separators.
 */
export function parseDecimalInput(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : NaN;
    }

    if (value == null) {
        return NaN;
    }

    const trimmedValue = String(value).trim();
    if (!trimmedValue) {
        return NaN;
    }

    let normalized = trimmedValue
        .replace(/[\s\u00A0]/g, '')
        .replace(/'/g, '');

    if (/[^\d,.+-]/.test(normalized)) {
        return NaN;
    }

    const sign = normalized.startsWith('-') ? '-' : normalized.startsWith('+') ? '+' : '';
    normalized = normalized.replace(/^[+-]/, '');

    if (!normalized || /[+-]/.test(normalized)) {
        return NaN;
    }

    const normalizeSeparator = (input, separator) => {
        const parts = input.split(separator);

        if (parts.length === 1) {
            return input;
        }

        if (parts.length === 2) {
            return separator === ',' ? `${parts[0]}.${parts[1]}` : input;
        }

        const tailParts = parts.slice(1);
        const looksLikeThousandsGrouping = tailParts.every(part => part.length === 3);

        if (looksLikeThousandsGrouping) {
            return parts.join('');
        }

        const wholePart = parts.slice(0, -1).join('');
        const decimalPart = parts[parts.length - 1];
        return `${wholePart}.${decimalPart}`;
    };

    const hasDot = normalized.includes('.');
    const hasComma = normalized.includes(',');

    if (hasDot && hasComma) {
        const decimalSeparator = normalized.lastIndexOf('.') > normalized.lastIndexOf(',') ? '.' : ',';
        const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
        normalized = normalized.split(thousandsSeparator).join('');
        normalized = normalizeSeparator(normalized, decimalSeparator);
    } else if (hasComma) {
        normalized = normalizeSeparator(normalized, ',');
    } else if (hasDot) {
        normalized = normalizeSeparator(normalized, '.');
    }

    if (!/^\d*\.?\d+$/.test(normalized)) {
        return NaN;
    }

    const parsed = Number(`${sign}${normalized}`);
    return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Determine the effective review status for display and exports.
 * Clean readings in a closed cycle are treated as approved.
 */
export function getEffectiveReviewStatus(reading, cycle = null) {
    const explicitStatus = String(reading?.review_status || '').toLowerCase();
    const hasFlags = Boolean(reading?.flags?.length) || Boolean(reading?.manual_flags?.length);

    if (explicitStatus && explicitStatus !== 'pending') {
        return explicitStatus;
    }

    if (hasFlags) {
        return 'pending';
    }

    if (cycle?.status === 'CLOSED') {
        return 'approved';
    }

    return explicitStatus || 'pending';
}

/**
 * Prefer the reading snapshot for previous reading display when available.
 */
export function getPreviousReadingDisplayValue(reading, meter = null) {
    if (reading?.previous_reading != null) {
        return reading.previous_reading;
    }

    return meter?.last_reading ?? 0;
}

// Export router for convenience
export { router };
