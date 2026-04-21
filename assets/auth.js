/**
 * auth.js - Firebase Auth module with role-based access.
 *
 * Roles:
 *   developer — full access including dev console and admin tools
 *   admin     — operational pages only; dev console is blocked
 *
 * A user record must exist in the Firestore `users` collection with:
 *   { email, name, role: 'developer' | 'admin', status: 'active' }
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

import { firebaseAuth, firebaseCollections, firebaseDb, isFirebaseConfigured } from './firebase.js';

const SESSION_KEY = 'fuzio_user_session';
const ACTIVITIES_CACHE_KEY = 'fuzio_activities';

// Roles that are permitted to access the app
export const ROLES = Object.freeze({
    DEVELOPER: 'developer',
    ADMIN: 'admin'
});

// Pages only accessible to developers
const DEVELOPER_ONLY_PAGES = ['dev-console.html'];

let currentSession = null;
let initializationPromise = null;

function readJson(key, fallback) {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return fallback;
    try {
        return JSON.parse(rawValue);
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function saveCurrentSession(session) {
    currentSession = session;
    if (session) {
        writeJson(SESSION_KEY, session);
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
    return session;
}

function getCachedActivities() {
    return readJson(ACTIVITIES_CACHE_KEY, []);
}

function setCachedActivities(activities) {
    writeJson(ACTIVITIES_CACHE_KEY, activities);
}

async function fetchUserRecord(uid, email) {
    // Try lookup by Firebase UID first, then by email
    const byUidResult = await getDoc(doc(firebaseDb, firebaseCollections.users, uid)).catch((e) => { console.error('[auth] UID lookup error:', e); return null; });
    console.log('[auth] UID lookup for', uid, '— exists:', byUidResult?.exists());
    if (byUidResult?.exists()) return { id: uid, ...byUidResult.data() };

    // Fallback: scan users collection for matching email
    const snap = await getDocs(collection(firebaseDb, firebaseCollections.users)).catch((e) => { console.error('[auth] collection scan error:', e); return { docs: [] }; });
    console.log('[auth] email scan — doc count:', snap.docs?.length, 'looking for:', email);
    const match = snap.docs.find((d) => d.data().email?.toLowerCase() === email?.toLowerCase());
    if (match) return { id: match.id, ...match.data() };

    return null;
}

async function buildSessionFromFirebaseUser(firebaseUser) {
    const userRecord = await fetchUserRecord(firebaseUser.uid, firebaseUser.email);
    if (!userRecord) {
        return null; // User not provisioned in the app
    }

    return {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: userRecord.name || firebaseUser.displayName || firebaseUser.email,
        role: userRecord.role || ROLES.ADMIN,
        status: userRecord.status || 'active',
        loginTime: new Date().toISOString()
    };
}

async function refreshActivitiesFromFirestore() {
    if (!isFirebaseConfigured()) return getCachedActivities();

    const snapshot = await getDocs(collection(firebaseDb, firebaseCollections.activities));
    const activities = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((a, b) => (b.timestamp_ms || 0) - (a.timestamp_ms || 0))
        .slice(0, 100);

    setCachedActivities(activities);
    return activities;
}

export const auth = {
    /**
     * Initialize auth. Resolves when the Firebase Auth state is known.
     * Returns the current session or null if not authenticated.
     */
    initialize() {
        if (!initializationPromise) {
            initializationPromise = new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
                    unsubscribe();
                    if (firebaseUser) {
                        const session = await buildSessionFromFirebaseUser(firebaseUser);
                        saveCurrentSession(session);
                        resolve(session);
                    } else {
                        saveCurrentSession(null);
                        resolve(null);
                    }
                });
            });
        }
        return initializationPromise;
    },

    isAuthenticated() {
        return currentSession !== null;
    },

    getCurrentUser() {
        return currentSession;
    },

    getRole() {
        return currentSession?.role || null;
    },

    isDeveloper() {
        return currentSession?.role === ROLES.DEVELOPER;
    },

    isAdmin() {
        return currentSession?.role === ROLES.ADMIN || currentSession?.role === ROLES.DEVELOPER;
    },

    /** Returns true if the current user may access the given page filename (e.g. 'dev-console.html') */
    canAccessPage(pageName) {
        if (!currentSession) return false;
        if (DEVELOPER_ONLY_PAGES.includes(pageName)) {
            return this.isDeveloper();
        }
        return true;
    },

    isGuestUser() {
        return false;
    },

    async login(email, password) {
        try {
            const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
            const session = await buildSessionFromFirebaseUser(credential.user);
            if (!session) {
                await firebaseSignOut(firebaseAuth);
                return { success: false, error: 'Your account is not provisioned in this application. Contact the administrator.' };
            }
            saveCurrentSession(session);
            return { success: true, user: session };
        } catch (err) {
            const messages = {
                'auth/invalid-credential': 'Incorrect email or password.',
                'auth/user-not-found': 'No account found for that email.',
                'auth/wrong-password': 'Incorrect password.',
                'auth/too-many-requests': 'Too many failed attempts. Please wait and try again.',
                'auth/network-request-failed': 'Network error. Check your connection.'
            };
            return { success: false, error: messages[err.code] || err.message };
        }
    },

    async logout() {
        await firebaseSignOut(firebaseAuth).catch(() => {});
        saveCurrentSession(null);
        window.location.href = 'login.html';
    },

    hasPermission() {
        return this.isAuthenticated();
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    recordActivity(action, details = {}) {
        if (!currentSession) return;
        const activity = {
            id: this.generateId(),
            userId: currentSession.id,
            userName: currentSession.name,
            action,
            details,
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
