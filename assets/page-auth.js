/**
 * page-auth.js - Shared page-level authentication guard
 */

import { auth } from './auth.js';
import { storage } from './storage.js';

auth.initializeDefaultAdmin();
await auth.initialize();
window.auth = auth;
window.storage = storage;

if (auth.isAuthenticated() && !auth.isGuestUser()) {
    try {
        await storage.initializeCloudSync({ preload: true, clearMissing: false });
    } catch (error) {
        console.error('Cloud data hydration failed:', error);
    }
}

const readerOnlyPages = new Set(['reader.html', 'reader-old.html']);

function isReaderOnlyRole(user) {
    return user?.role === 'guest_reader' || user?.role === 'field_worker';
}

function redirectToReaderOnlyNotice() {
    window.location.href = 'login.html?reader_only=1';
}

export function requireAuth() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (auth.isAuthenticated()) {
        const currentUser = auth.getCurrentUser();

        if (isReaderOnlyRole(currentUser) && !readerOnlyPages.has(currentPage)) {
            redirectToReaderOnlyNotice();
            return false;
        }

        if (auth.isGuestUser() && !readerOnlyPages.has(currentPage)) {
            auth.clearSession();
            redirectToReaderOnlyNotice();
            return false;
        }

        if (!currentUser || currentUser.status === 'disabled') {
            auth.clearSession();
        } else {
            return true;
        }
    }

    const redirectTarget = `${currentPage}${window.location.search}${window.location.hash}`;
    window.location.href = `login.html?redirect=${encodeURIComponent(redirectTarget)}`;
    return false;
}

export function allowGuestAccess() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (!readerOnlyPages.has(currentPage)) {
        return requireAuth();
    }

    if (auth.isAuthenticated()) {
        return true;
    }

    const redirectTarget = `${currentPage}${window.location.search}${window.location.hash}`;
    window.location.href = `login.html?redirect=${encodeURIComponent(redirectTarget)}`;
    return false;
}

requireAuth();