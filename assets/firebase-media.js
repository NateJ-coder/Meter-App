import { getDownloadURL, ref, uploadString } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

import { firebaseStorage, isFirebaseConfigured } from './firebase.js';

function sanitizePathSegment(value, fallback = 'unknown') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallback;
}

function buildEvidencePath(context, fileName) {
    const capturedAt = sanitizePathSegment(context.capturedAt || new Date().toISOString().replace(/[:.]/g, '-'));
    const cycleId = sanitizePathSegment(context.cycleId, 'adhoc-cycle');
    const meterId = sanitizePathSegment(context.meterId, 'unknown-meter');
    const readingId = sanitizePathSegment(context.readingId, `${meterId}-${capturedAt}`);
    const safeFileName = sanitizePathSegment(fileName, 'meter-photo.jpg');

    return `reading-evidence/${cycleId}/${meterId}/${readingId}-${safeFileName}`;
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

    try {
        const storagePath = buildEvidencePath(context, preparedPhoto.name);
        const storageRef = ref(firebaseStorage, storagePath);

        await uploadString(storageRef, preparedPhoto.dataUrl, 'data_url');

        return {
            photo: await getDownloadURL(storageRef),
            photo_name: preparedPhoto.name,
            photo_storage_mode: 'firebase',
            photo_storage_path: storagePath
        };
    } catch (error) {
        console.error('Firebase Storage upload failed, photo will be omitted from record.', error);
        // Do NOT fall back to storing the full data URL in localStorage — it can exceed the
        // 5 MB quota on mobile devices and crash the entire reading save. The reading is more
        // important than the photo; flag it for follow-up instead.
        return { photo: '', photo_name: preparedPhoto?.name || '', photo_storage_mode: 'failed', photo_storage_path: '' };
    }
}