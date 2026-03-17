/**
 * auth.js - Transitional auth layer with Firebase Auth + Firestore profiles.
 *
 * Registered sign-in uses Firebase Auth. A local cache is preserved so the
 * existing UI can continue using synchronous getters during migration.
 */

import { deleteApp, initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    deleteUser as deleteFirebaseAuthUser,
    getAuth,
    onAuthStateChanged,
    setPersistence,
    signInWithEmailAndPassword,
    signOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { firebaseAuth, firebaseCollections, firebaseConfig, firebaseDb, isFirebaseConfigured } from './firebase.js';

const SESSION_KEY = 'fuzio_user_session';
const GUEST_SESSION_KEY = 'fuzio_guest_session';
const USERS_CACHE_KEY = 'fuzio_users';
const ACTIVITIES_CACHE_KEY = 'fuzio_activities';
const LEGACY_DEFAULT_ADMIN_EMAIL = 'admin@fuzio.com';

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

function clearJson(key) {
    localStorage.removeItem(key);
}

function getCachedUsers() {
    return readJson(USERS_CACHE_KEY, []);
}

function setCachedUsers(users) {
    writeJson(USERS_CACHE_KEY, users);
}

function getCachedActivities() {
    return readJson(ACTIVITIES_CACHE_KEY, []);
}

function setCachedActivities(activities) {
    writeJson(ACTIVITIES_CACHE_KEY, activities);
}

function saveCurrentSession(session) {
    currentSession = session;

    if (session) {
        writeJson(SESSION_KEY, session);
    } else {
        clearJson(SESSION_KEY);
    }

    return session;
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function mapFirebaseAuthError(error) {
    const code = error?.code || '';

    switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-email':
            return 'Invalid email or password';
        case 'auth/email-already-in-use':
            return 'Email already registered';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters';
        case 'auth/network-request-failed':
            return 'Network error while contacting Firebase';
        default:
            return error?.message || 'Authentication failed';
    }
}

function toSession(profile) {
    return {
        id: profile.id,
        firebase_uid: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role || 'viewer',
        phone: profile.phone || '',
        contact_details: profile.contact_details || '',
        status: profile.status || 'active',
        user_type: 'registered',
        loginTime: new Date().toISOString()
    };
}

async function getProfileDoc(userId) {
    if (!isFirebaseConfigured()) {
        return null;
    }

    const snapshot = await getDoc(doc(firebaseDb, firebaseCollections.users, userId));
    return snapshot.exists() ? snapshot.data() : null;
}

async function saveProfileDoc(userId, profile) {
    if (!isFirebaseConfigured()) {
        return;
    }

    await setDoc(doc(firebaseDb, firebaseCollections.users, userId), profile, { merge: true });
}

async function syncSessionFromFirebaseUser(firebaseUser) {
    const email = normalizeEmail(firebaseUser.email);
    const legacyUsers = getCachedUsers();
    const legacyUser = legacyUsers.find((user) => normalizeEmail(user.email) === email);
    const profileDoc = await getProfileDoc(firebaseUser.uid);

    const mergedProfile = {
        id: firebaseUser.uid,
        email,
        name: profileDoc?.name || legacyUser?.name || firebaseUser.displayName || email || 'Registered User',
        phone: profileDoc?.phone || legacyUser?.phone || '',
        contact_details: profileDoc?.contact_details || legacyUser?.contact_details || '',
        role: profileDoc?.role || legacyUser?.role || 'viewer',
        status: profileDoc?.status || legacyUser?.status || 'active',
        createdAt: profileDoc?.createdAt || legacyUser?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (mergedProfile.status === 'disabled') {
        await signOut(firebaseAuth);
        saveCurrentSession(null);
        throw new Error('This account has been disabled. Contact your administrator.');
    }

    await saveProfileDoc(firebaseUser.uid, mergedProfile);

    const users = getCachedUsers().filter((user) => user.id !== firebaseUser.uid);
    users.push(mergedProfile);
    setCachedUsers(users);

    return saveCurrentSession(toSession(mergedProfile));
}

async function refreshUsersFromFirestore() {
    if (!isFirebaseConfigured()) {
        return getCachedUsers();
    }

    const snapshot = await getDocs(collection(firebaseDb, firebaseCollections.users));
    const users = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((userA, userB) => (userA.name || '').localeCompare(userB.name || ''));

    setCachedUsers(users);
    return users;
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
        if (initializationPromise) {
            return initializationPromise;
        }

        if (!isFirebaseConfigured()) {
            initializationPromise = Promise.resolve(currentSession);
            return initializationPromise;
        }

        initializationPromise = new Promise(async (resolve) => {
            try {
                await setPersistence(firebaseAuth, browserLocalPersistence);
            } catch {
                // Continue even if persistence cannot be set.
            }

            let initialized = false;

            onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
                try {
                    if (firebaseUser) {
                        clearJson(GUEST_SESSION_KEY);
                        await syncSessionFromFirebaseUser(firebaseUser);
                    } else {
                        const guestSession = readJson(GUEST_SESSION_KEY, null);
                        saveCurrentSession(guestSession);
                    }
                } catch (error) {
                    console.error('Firebase auth initialization error:', error);
                    saveCurrentSession(readJson(GUEST_SESSION_KEY, null));
                }

                if (!initialized) {
                    initialized = true;
                    resolve(currentSession);
                }
            });
        });

        return initializationPromise;
    },

    isAuthenticated() {
        return Boolean(currentSession && currentSession.id && currentSession.role);
    },

    getCurrentUser() {
        return currentSession;
    },

    isGuestUser() {
        return this.getCurrentUser()?.role === 'guest_reader';
    },

    clearSession() {
        saveCurrentSession(null);
        clearJson(GUEST_SESSION_KEY);
    },

    async login(email, password) {
        await this.initialize();

        const normalizedEmail = normalizeEmail(email);

        if (isFirebaseConfigured()) {
            try {
                const result = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password);
                const session = await syncSessionFromFirebaseUser(result.user);
                return { success: true, user: session };
            } catch (error) {
                const legacyUser = getCachedUsers().find((user) => normalizeEmail(user.email) === normalizedEmail && user.password === password);
                if (!legacyUser) {
                    return { success: false, error: mapFirebaseAuthError(error) };
                }
            }
        }

        const legacyUser = getCachedUsers().find((user) => normalizeEmail(user.email) === normalizedEmail && user.password === password);
        if (!legacyUser) {
            return { success: false, error: 'Invalid email or password' };
        }

        return { success: true, user: saveCurrentSession(toSession(legacyUser)) };
    },

    async register(userData) {
        await this.initialize();

        const normalizedEmail = normalizeEmail(userData.email);
        const currentUsers = getCachedUsers();
        if (currentUsers.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
            return { success: false, error: 'Email already registered' };
        }

        const userProfile = {
            email: normalizedEmail,
            name: userData.name,
            phone: userData.phone || '',
            contact_details: userData.contact_details || '',
            role: userData.role || 'viewer',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!isFirebaseConfigured()) {
            const legacyUser = {
                id: this.generateId(),
                password: userData.password,
                ...userProfile
            };
            setCachedUsers([...currentUsers, legacyUser]);
            return { success: true, user: legacyUser };
        }

        let secondaryApp;
        let provisionedFirebaseUser = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, `user-provisioning-${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);
            const result = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, userData.password);
            provisionedFirebaseUser = result.user;
            const newUser = {
                id: result.user.uid,
                ...userProfile
            };

            await saveProfileDoc(result.user.uid, newUser);
            setCachedUsers([...currentUsers, newUser]);
            await signOut(secondaryAuth);
            return { success: true, user: newUser };
        } catch (error) {
            if (provisionedFirebaseUser) {
                await deleteFirebaseAuthUser(provisionedFirebaseUser).catch(() => {});
            }
            return { success: false, error: mapFirebaseAuthError(error) };
        } finally {
            if (secondaryApp) {
                await deleteApp(secondaryApp).catch(() => {});
            }
        }
    },

    async logout() {
        if (!this.isGuestUser() && isFirebaseConfigured() && firebaseAuth.currentUser) {
            await signOut(firebaseAuth).catch(() => {});
        }

        this.clearSession();
        window.location.href = 'login.html';
    },

    startGuestSession() {
        const session = {
            id: `guest_${this.generateId()}`,
            email: '',
            name: 'Guest Reader',
            role: 'guest_reader',
            phone: '',
            contact_details: '',
            user_type: 'guest',
            loginTime: new Date().toISOString()
        };

        writeJson(GUEST_SESSION_KEY, session);
        return saveCurrentSession(session);
    },

    getUsers() {
        return getCachedUsers().filter((user) => user.status !== 'disabled');
    },

    async refreshUsers() {
        return refreshUsersFromFirestore();
    },

    async updateUser(userId, updates) {
        const users = getCachedUsers();
        const index = users.findIndex((user) => user.id === userId);

        if (index === -1) {
            return { success: false, error: 'User not found' };
        }

        const updatedUser = {
            ...users[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        users[index] = updatedUser;
        setCachedUsers(users);

        if (isFirebaseConfigured()) {
            await saveProfileDoc(userId, updatedUser);
        }

        return { success: true, user: updatedUser };
    },

    async deleteUser(userId) {
        const result = await this.updateUser(userId, { status: 'disabled', disabledAt: new Date().toISOString() });
        return { success: result.success };
    },

    initializeDefaultAdmin() {
        const users = getCachedUsers().filter((user) => {
            const normalizedEmail = normalizeEmail(user.email);
            const isLegacySeed = normalizedEmail === LEGACY_DEFAULT_ADMIN_EMAIL;
            const isTemporarySeed = normalizedEmail === 'admin@fuzio.co' && user.password === 'admin123';
            return !isLegacySeed && !isTemporarySeed;
        });

        setCachedUsers(users);
    },

    hasPermission(requiredRole) {
        const user = this.getCurrentUser();
        if (!user) {
            return false;
        }

        const roles = {
            guest_reader: 0,
            viewer: 1,
            field_worker: 2,
            admin: 3
        };

        return roles[user.role] >= roles[requiredRole];
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    getUserById(userId) {
        return getCachedUsers().find((user) => user.id === userId);
    },

    recordActivity(action, details = {}) {
        const user = this.getCurrentUser();
        if (!user) {
            return;
        }

        const activity = {
            id: this.generateId(),
            userId: user.id,
            userName: user.name,
            action,
            details,
            timestamp: new Date().toISOString(),
            timestamp_ms: Date.now()
        };

        const activities = [activity, ...getCachedActivities()].slice(0, 100);
        setCachedActivities(activities);

        if (isFirebaseConfigured() && !this.isGuestUser()) {
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
