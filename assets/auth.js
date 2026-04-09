/**
 * auth.js - Open-access compatibility layer.
 *
 * The app no longer enforces login or role-based access in the UI. This module
 * preserves the previous API shape so existing pages can keep recording
 * activity and referencing a current operator without a sign-in flow.
 */

import {
    collection,
    doc,
    getDocs,
    setDoc
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { firebaseCollections, firebaseDb, isFirebaseConfigured } from './firebase.js';

const SESSION_KEY = 'fuzio_user_session';
const USERS_CACHE_KEY = 'fuzio_users';
const ACTIVITIES_CACHE_KEY = 'fuzio_activities';
const OPEN_ACCESS_USER = Object.freeze({
    id: 'open-access-operator',
    email: '',
    name: 'Open Access Operator',
    role: 'open_access',
    phone: '',
    contact_details: '',
    status: 'active',
    user_type: 'system'
});

let currentSession = readJson(SESSION_KEY, null);
let initializationPromise = null;

function readJson(key, fallback) {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
        return fallback;
    }

    try {
        return JSON.parse(rawValue);
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function buildOpenAccessSession(overrides = {}) {
    return {
        ...OPEN_ACCESS_USER,
        loginTime: new Date().toISOString(),
        ...overrides
    };
}

function saveCurrentSession(session) {
    currentSession = session;
    writeJson(SESSION_KEY, session);
    return session;
}

function ensureSession() {
    return currentSession || saveCurrentSession(buildOpenAccessSession());
}

function getCachedActivities() {
    return readJson(ACTIVITIES_CACHE_KEY, []);
}

function setCachedActivities(activities) {
    writeJson(ACTIVITIES_CACHE_KEY, activities);
}

async function refreshActivitiesFromFirestore() {
    if (!isFirebaseConfigured()) {
        return getCachedActivities();
    }

    const snapshot = await getDocs(collection(firebaseDb, firebaseCollections.activities));
    const activities = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((activityA, activityB) => (activityB.timestamp_ms || 0) - (activityA.timestamp_ms || 0))
        .slice(0, 100);

    setCachedActivities(activities);
    return activities;
}

export const auth = {
    async initialize() {
        if (!initializationPromise) {
            initializationPromise = Promise.resolve(ensureSession());
        }

        return initializationPromise;
    },

    isAuthenticated() {
        return true;
    },

    getCurrentUser() {
        return ensureSession();
    },

    isGuestUser() {
        return false;
    },

    clearSession() {
        return saveCurrentSession(buildOpenAccessSession());
    },

    async login() {
        const session = ensureSession();
        return { success: true, user: session };
    },

    async register() {
        return {
            success: false,
            error: 'User provisioning is retired. The app now runs in open-access mode.'
        };
    },

    async logout() {
        this.clearSession();
        window.location.href = 'index.html';
    },

    startGuestSession() {
        return ensureSession();
    },

    getUsers() {
        return [];
    },

    async refreshUsers() {
        writeJson(USERS_CACHE_KEY, []);
        return [];
    },

    async updateUser() {
        return {
            success: false,
            error: 'User management is retired in open-access mode.'
        };
    },

    async deleteUser() {
        return {
            success: false,
            error: 'User management is retired in open-access mode.'
        };
    },

    initializeDefaultAdmin() {
        writeJson(USERS_CACHE_KEY, []);
        return ensureSession();
    },

    hasPermission() {
        return true;
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    getUserById(userId) {
        const currentUser = ensureSession();
        return currentUser.id === userId ? currentUser : null;
    },

    recordActivity(action, details = {}) {
        const user = ensureSession();
        const activity = {
            id: this.generateId(),
            userId: user.id,
            userName: user.name,
            action,
            details,
            access_mode: 'open_access',
            timestamp: new Date().toISOString(),
            timestamp_ms: Date.now()
        };

        const activities = [activity, ...getCachedActivities()].slice(0, 100);
        setCachedActivities(activities);

        if (isFirebaseConfigured()) {
            setDoc(doc(firebaseDb, firebaseCollections.activities, activity.id), activity).catch((error) => {
                console.error('Failed to persist activity to Firestore:', error);
            });
        }
    },

    getActivities() {
        return getCachedActivities();
    },

    async refreshActivities() {
        return refreshActivitiesFromFirestore();
    }
};
