/**
 * page-auth.js - Shared page-level authentication guard
 */

import { auth } from './auth.js';

auth.initializeDefaultAdmin();
await auth.initialize();
window.auth = auth;

const guestAllowedPages = new Set(['reader.html', 'reader-old.html']);

export function requireAuth() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (auth.isAuthenticated()) {
        if (auth.isGuestUser() && !guestAllowedPages.has(currentPage)) {
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

    if (!guestAllowedPages.has(currentPage)) {
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