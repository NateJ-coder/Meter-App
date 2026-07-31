import { getDownloadURL, ref, uploadString } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

import { firebaseStorage, isFirebaseConfigured } from './firebase.js';

const PHOTO_QUEUE_DB = 'fuzio-reading-photo-queue';
const PHOTO_QUEUE_STORE = 'pending_photos';

let photoQueueDbPromise = null;

function getPhotoQueueDb() {
    if (photoQueueDbPromise) {
        return photoQueueDbPromise;
    }

    photoQueueDbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available in this browser environment.'));
            return;
        }

        const request = indexedDB.open(PHOTO_QUEUE_DB, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(PHOTO_QUEUE_STORE)) {
                database.createObjectStore(PHOTO_QUEUE_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Unable to open photo queue database.'));
    });

    return photoQueueDbPromise;
}

function getFileExtension(fileName) {
    const match = String(fileName || '').trim().match(/\.([a-z0-9]{2,5})$/i);
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
}

function sanitizeDisplaySegment(value, fallback = 'Unknown') {
    const cleaned = String(value || '')
        .replace(/[<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned || fallback;
}

function formatCaptureDateToken(value) {
    const rawValue = String(value || '').trim();
    const parsed = rawValue ? new Date(rawValue) : new Date();
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}.${month}.${year}`;
}

function buildReadablePhotoName(context = {}, originalName = 'meter-photo.jpg') {
    const buildingSegment = sanitizeDisplaySegment(context.buildingName || context.schemeName, 'Unknown Building');
    const meterSegment = sanitizeDisplaySegment(
        context.meterLabel || context.meterNumber || context.meterId,
        'Unknown Meter'
    );
    const captureDate = formatCaptureDateToken(context.capturedAt);
    const extension = getFileExtension(originalName);

    return `${buildingSegment} - ${meterSegment} Reading ${captureDate}${extension}`;
}

async function queuePendingPhoto(preparedPhoto, context = {}) {
    const queueId = sanitizePathSegment(context.readingId || `${context.meterId || 'meter'}-${Date.now()}`);
    const database = await getPhotoQueueDb();

    await new Promise((resolve, reject) => {
        const transaction = database.transaction(PHOTO_QUEUE_STORE, 'readwrite');
        const store = transaction.objectStore(PHOTO_QUEUE_STORE);
        store.put({
            id: queueId,
            dataUrl: preparedPhoto.dataUrl,
            originalName: preparedPhoto.name,
            createdAt: new Date().toISOString(),
            context
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to queue photo upload.'));
        transaction.onabort = () => reject(transaction.error || new Error('Photo queue transaction aborted.'));
    });

    return queueId;
}

async function getQueuedPhoto(queueId) {
    const database = await getPhotoQueueDb();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PHOTO_QUEUE_STORE, 'readonly');
        const store = transaction.objectStore(PHOTO_QUEUE_STORE);
        const request = store.get(queueId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Unable to read queued photo.'));
    });
}

async function deleteQueuedPhoto(queueId) {
    const database = await getPhotoQueueDb();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PHOTO_QUEUE_STORE, 'readwrite');
        const store = transaction.objectStore(PHOTO_QUEUE_STORE);
        store.delete(queueId);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to remove queued photo.'));
        transaction.onabort = () => reject(transaction.error || new Error('Photo delete transaction aborted.'));
    });
}

function sanitizePathSegment(value, fallback = 'unknown') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallback;
}

function buildEvidencePath(context, fileName) {
    const schemeSegment = sanitizePathSegment(context.schemeName || context.schemeId, 'unknown-scheme');
    const buildingSegment = sanitizePathSegment(context.buildingName, 'unknown-building');
    const captureDaySegment = sanitizePathSegment(formatCaptureDateToken(context.capturedAt), 'unknown-date');
    const meterLabelSegment = sanitizePathSegment(context.meterLabel || context.meterNumber, 'unknown-meter-label');
    const capturedAt = sanitizePathSegment(context.capturedAt || new Date().toISOString().replace(/[:.]/g, '-'));
    const cycleId = sanitizePathSegment(context.cycleId, 'adhoc-cycle');
    const meterId = sanitizePathSegment(context.meterId, 'unknown-meter');
    const readingId = sanitizePathSegment(context.readingId, `${meterId}-${capturedAt}`);
    const safeFileName = sanitizePathSegment(fileName, 'meter-photo.jpg');

    return `reading-evidence/${schemeSegment}/${buildingSegment}/${captureDaySegment}/${meterLabelSegment}/${cycleId}/${meterId}/${readingId}-${safeFileName}`;
}

function buildLocalFallback(preparedPhoto) {
    return {
        photo: preparedPhoto?.dataUrl || '',
        photo_name: preparedPhoto?.name || '',
        photo_storage_mode: 'local',
        photo_storage_path: ''
    };
}

export async function persistReadingPhoto(preparedPhoto, context = {}) {
    if (!preparedPhoto) {
        return buildLocalFallback(null);
    }

    if (!isFirebaseConfigured()) {
        // Firebase not configured — omit the photo from localStorage to avoid quota issues.
        // The file was selected but cannot be stored safely without Firebase Storage.
        return { photo: '', photo_name: preparedPhoto?.name || '', photo_storage_mode: 'no-firebase', photo_storage_path: '' };
    }

    const readableName = buildReadablePhotoName(context, preparedPhoto.name);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        try {
            const pendingId = await queuePendingPhoto({ ...preparedPhoto, name: readableName }, { ...context, desiredPhotoName: readableName });
            return {
                photo: '',
                photo_name: readableName,
                photo_storage_mode: 'pending-upload',
                photo_storage_path: '',
                photo_pending_id: pendingId
            };
        } catch (queueError) {
            console.error('Unable to queue photo for upload retry while offline.', queueError);
            return { photo: '', photo_name: readableName, photo_storage_mode: 'failed', photo_storage_path: '' };
        }
    }

    try {
        const storagePath = buildEvidencePath(context, readableName);
        const storageRef = ref(firebaseStorage, storagePath);

        await uploadString(storageRef, preparedPhoto.dataUrl, 'data_url');

        return {
            photo: await getDownloadURL(storageRef),
            photo_name: readableName,
            photo_storage_mode: 'firebase',
            photo_storage_path: storagePath,
            photo_pending_id: ''
        };
    } catch (error) {
        console.error('Firebase Storage upload failed, queuing photo for retry.', error);
        try {
            const pendingId = await queuePendingPhoto({ ...preparedPhoto, name: readableName }, { ...context, desiredPhotoName: readableName });
            return {
                photo: '',
                photo_name: readableName,
                photo_storage_mode: 'pending-upload',
                photo_storage_path: '',
                photo_pending_id: pendingId
            };
        } catch (queueError) {
            console.error('Unable to queue failed photo upload.', queueError);
            return { photo: '', photo_name: readableName, photo_storage_mode: 'failed', photo_storage_path: '' };
        }
    }
}

export async function syncPendingReadingPhotos({ readings = [], updateReading } = {}) {
    if (!Array.isArray(readings) || readings.length === 0 || typeof updateReading !== 'function') {
        return { attempted: 0, uploaded: 0, failed: 0 };
    }

    if (!isFirebaseConfigured()) {
        return { attempted: 0, uploaded: 0, failed: 0 };
    }

    let attempted = 0;
    let uploaded = 0;
    let failed = 0;

    for (const reading of readings) {
        const isPending = String(reading?.photo_storage_mode || '') === 'pending-upload';
        const pendingId = String(reading?.photo_pending_id || '').trim();

        if (!isPending || !pendingId) {
            continue;
        }

        attempted += 1;

        try {
            const queuedPhoto = await getQueuedPhoto(pendingId);
            if (!queuedPhoto?.dataUrl) {
                failed += 1;
                continue;
            }

            const context = {
                ...queuedPhoto.context,
                cycleId: queuedPhoto.context?.cycleId || reading.cycle_id,
                meterId: queuedPhoto.context?.meterId || reading.meter_id,
                readingId: queuedPhoto.context?.readingId || reading.id,
                capturedAt: queuedPhoto.context?.capturedAt || reading.reading_date || reading.captured_at || new Date().toISOString()
            };

            const readableName = queuedPhoto.context?.desiredPhotoName
                || buildReadablePhotoName(context, queuedPhoto.originalName || reading.photo_name || 'meter-photo.jpg');

            const storagePath = buildEvidencePath(context, readableName);
            const storageRef = ref(firebaseStorage, storagePath);

            await uploadString(storageRef, queuedPhoto.dataUrl, 'data_url');
            const url = await getDownloadURL(storageRef);

            updateReading(reading.id, {
                photo: url,
                photo_name: readableName,
                photo_storage_mode: 'firebase',
                photo_storage_path: storagePath,
                photo_pending_id: ''
            });

            await deleteQueuedPhoto(pendingId);
            uploaded += 1;
        } catch (error) {
            console.error(`Pending photo sync failed for reading ${reading?.id || 'unknown'}`, error);
            failed += 1;
        }
    }

    return { attempted, uploaded, failed };
}