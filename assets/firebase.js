/*
 * Firebase bootstrap for the static HTML app.
 *
 * This project currently runs without a bundler, so Firebase must be loaded
 * from browser-native ESM URLs rather than bare imports like "firebase/app".
 */

import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { getFirestore, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

export const firebaseConfig = {
    apiKey: 'AIzaSyBz89GtOjx7c__t1pu9yD2ata9-4ITZilk',
    authDomain: 'meter-app-36307.firebaseapp.com',
    projectId: 'meter-app-36307',
    storageBucket: 'meter-app-36307.firebasestorage.app',
    messagingSenderId: '185231576035',
    appId: '1:185231576035:web:5da1b1cf690d6cceda2ed6'
};

export const firebaseCollections = {
    schemes: 'schemes',
    buildings: 'buildings',
    units: 'units',
    meters: 'meters',
    cycles: 'cycles',
    cycleSchedules: 'cycle_schedules',
    readings: 'readings',
    users: 'users',
    activities: 'activities'
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

export function getFirebaseTimestamp() {
    return serverTimestamp();
}

export function isFirebaseConfigured() {
    return Boolean(firebaseApp && firebaseDb && firebaseAuth && firebaseStorage);
}