/**
 * page-auth.js - Shared page-level authentication guard
 */

import { auth } from './auth.js';

auth.initializeDefaultAdmin();
window.auth = auth;

export function requireAuth() {
    if (auth.isAuthenticated()) {
        return true;
    }

    const currentPage = `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search}${window.location.hash}`;
    window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
    return false;
}

requireAuth();