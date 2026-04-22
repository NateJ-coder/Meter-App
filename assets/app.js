/**
 * app.js - Main Application Logic & Seed Data
 * Shared helpers and initialization
 */

import { storage } from './storage.js';
import { router } from './router.js';

export const DEFAULT_SCHEME_NAMES = [
    'Akasia',
    'Azores',
    'Bonifay',
    'Carissa Lane',
    'Genisis on Fairmount',
    'Hazelmere',
    'La Montagne',
    'Phanda Lodge',
    'QueensGate',
    'Rivonia Gates',
    'Taragona',
    'VILLINO GLEN',
    'Vista Del Monte'
];

const SCHEME_NAME_ALIASES = new Map([
    ['the azores', 'azores'],
    ['bonifay court', 'bonifay'],
    ['genesis', 'genisis on fairmount'],
    ['l montagne', 'la montagne'],
    ['lmontagne', 'la montagne'],
    ['queensgate', 'queensgate'],
    ['rivonia gate', 'rivonia gates'],
    ['vilino glen', 'villino glen'],
    ['villino glen', 'villino glen']
]);

function normalizeSchemeName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function canonicalSchemeName(value) {
    const normalized = normalizeSchemeName(value);
    return SCHEME_NAME_ALIASES.get(normalized) || normalized;
}

export function initializeFolderSchemes() {
    const existingSchemes = storage.getAll('schemes');
    const created = [];
    const updated = [];

    DEFAULT_SCHEME_NAMES.forEach((schemeName) => {
        const normalizedTarget = normalizeSchemeName(schemeName);
        const canonicalTarget = canonicalSchemeName(schemeName);

        const exactMatch = existingSchemes.find((scheme) => normalizeSchemeName(scheme.name) === normalizedTarget);
        if (exactMatch) {
            return;
        }

        const aliasMatch = existingSchemes.find((scheme) => canonicalSchemeName(scheme.name) === canonicalTarget);
        if (aliasMatch) {
            const renamed = storage.update('schemes', aliasMatch.id, {
                name: schemeName,
                initialized_from: aliasMatch.initialized_from || 'buildings_folder'
            });

            if (renamed) {
                updated.push(schemeName);
            }
            return;
        }

        storage.create('schemes', {
            name: schemeName,
            initialized_from: 'buildings_folder'
        });
        created.push(schemeName);
    });

    return { created, updated };
}

/**
 * Initialize seed data on first run (OPTIONAL - for demo purposes)
 * To enable: uncomment the function call in index.html
 */
export function initializeSeedData() {
    return initializeFolderSchemes();
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
