/**
 * router.js - Simple Client-Side Navigation Helpers
 */

export const router = {
    /**
     * Navigate to a page with optional hash
     */
    navigateTo(page, hash = '') {
        const url = hash ? `${page}${hash}` : page;
        window.location.href = url;
    },

    /**
     * Get current page
     */
    getCurrentPage() {
        return window.location.pathname.split('/').pop() || 'index.html';
    },

    /**
     * Get hash parameters
     */
    getHash() {
        return window.location.hash.slice(1);
    },

    /**
     * Set hash without reload
     */
    setHash(hash) {
        window.location.hash = hash;
    },

    /**
     * Get query parameters
     */
    getQueryParams() {
        const params = {};
        const searchParams = new URLSearchParams(window.location.search);
        for (const [key, value] of searchParams) {
            params[key] = value;
        }
        return params;
    },

    /**
     * Reload current page
     */
    reload() {
        window.location.reload();
    }
};
