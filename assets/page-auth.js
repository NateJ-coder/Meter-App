/**
 * page-auth.js - Shared page bootstrap for open-access mode.
 */

import { auth } from './auth.js';
import { initializeFolderSchemes } from './app.js';
import { storage } from './storage.js';

await auth.initialize();
window.auth = auth;
window.storage = storage;

try {
    await storage.initializeCloudSync({ preload: true, clearMissing: false });
    initializeFolderSchemes();
} catch (error) {
    console.error('Cloud data hydration failed:', error);
}

export function requireAuth() {
    return true;
}

export function allowGuestAccess() {
    return true;
}

requireAuth();