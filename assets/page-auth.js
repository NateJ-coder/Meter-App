/**
 * page-auth.js - Shared page bootstrap for open-access mode.
 */

import { auth } from './auth.js';
import { initializeFolderSchemes } from './app.js';
import { storage } from './storage.js';

await auth.initialize();
await storage.initializeCloudSync({ preload: storage.getAll('schemes').length === 0 });
window.auth = auth;
window.storage = storage;

initializeFolderSchemes();

export function requireAuth() {
    return true;
}

export function allowGuestAccess() {
    return true;
}

requireAuth();