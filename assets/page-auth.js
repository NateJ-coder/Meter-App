/**
 * page-auth.js - Shared page bootstrap with role-based auth guard.
 *
 * - Unauthenticated visitors are redirected to login.html
 * - Developer-only pages (dev-console.html) redirect non-developers to index.html
 */

import { auth } from './auth.js';
import { initializeFolderSchemes } from './app.js';
import { storage } from './storage.js';

const currentPage = location.pathname.split('/').pop() || 'index.html';

// login.html is exempt from the guard (it IS the login page)
if (currentPage !== 'login.html') {
    const session = await auth.initialize();

    if (!session) {
        // Not logged in — redirect to login, preserving intended destination
        const returnTo = encodeURIComponent(location.href);
        location.replace(`login.html?returnTo=${returnTo}`);
        // Halt further module execution
        throw new Error('Redirecting to login');
    }

    if (!auth.canAccessPage(currentPage)) {
        // Logged in but insufficient role (e.g. admin trying to access dev-console.html)
        location.replace('index.html');
        throw new Error('Insufficient role for this page');
    }
} else {
    await auth.initialize();
}

await storage.initializeCloudSync({ preload: storage.shouldPreloadCloudData() });
window.auth = auth;
window.storage = storage;

initializeFolderSchemes();

// Inject a sign-out link into any navbar that has a .nav-links element
(function injectSignOutLink() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const user = auth.getCurrentUser();
    if (!user) return;

    // Avoid duplicates if the page already has a sign-out item
    if (navLinks.querySelector('[data-signout]')) return;

    const li = document.createElement('li');
    li.setAttribute('data-signout', '');
    li.innerHTML = `<a href="#" class="nav-signout" title="Signed in as ${user.name}" onclick="event.preventDefault(); window.auth.logout()">Sign Out (${user.name})</a>`;
    navLinks.appendChild(li);
})();

export function requireAuth() {
    return auth.isAuthenticated();
}

export function allowGuestAccess() {
    return false;
}