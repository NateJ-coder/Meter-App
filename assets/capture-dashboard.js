/**
 * capture-dashboard.js
 * Reads readings captured by the Fuzio Meter Reader Android app
 * (Firestore collection: mobile_captures) and lets office staff
 * review them, download photos, and export a Genesis-style two-column
 * Excel workbook (meter label, reading value).
 */
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { firebaseDb } from './firebase.js';

const buildingInput = document.getElementById('building-input');
const loadBtn = document.getElementById('load-btn');
const exportBtn = document.getElementById('export-btn');
const statusText = document.getElementById('status-text');
const capturesBody = document.getElementById('captures-body');

let currentRows = [];
let autoRefreshTimer = null;
let editingRowId = null;
const AUTO_REFRESH_MS = 15000;
const METER_TYPES = ['Electricity', 'Water'];

function formatDate(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
}

function toDate(capturedAt) {
    if (capturedAt?.toDate) return capturedAt.toDate();
    if (typeof capturedAt === 'string') return new Date(capturedAt);
    return new Date();
}

function photoFilename(row) {
    return `${row.label} - ${row.meterType} Reading ${formatDate(row.capturedAtDate)}.jpeg`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadCaptures(isAutoRefresh = false) {
    const building = buildingInput.value.trim();
    if (!building) return;
    if (isAutoRefresh && editingRowId !== null) return; // don't clobber an in-progress edit

    if (!isAutoRefresh) {
        statusText.textContent = 'Loading...';
        loadBtn.disabled = true;
        exportBtn.disabled = true;
    }

    try {
        const q = query(collection(firebaseDb, 'mobile_captures'), where('building', '==', building));
        const snapshot = await getDocs(q);

        currentRows = snapshot.docs.map((doc) => {
            const data = doc.data();
            const capturedAtDate = toDate(data.capturedAt);
            return {
                id: doc.id,
                building: data.building || '',
                label: data.label || '',
                meterType: data.meterType || '',
                readingValue: data.readingValue || '',
                photoUrl: data.photoUrl || '',
                capturedAtDate
            };
        }).sort((a, b) => a.capturedAtDate - b.capturedAtDate);

        renderRows();
        const stamp = new Date().toLocaleTimeString();
        statusText.textContent = `${currentRows.length} reading(s) found for "${building}" (last refreshed ${stamp}).`;
        exportBtn.disabled = currentRows.length === 0;
        restartAutoRefresh();
    } catch (err) {
        console.error(err);
        statusText.textContent = `Failed to load captures: ${err.message}`;
    } finally {
        loadBtn.disabled = false;
    }
}

function restartAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => loadCaptures(true), AUTO_REFRESH_MS);
}

async function deleteCapture(id) {
    if (!confirm('Delete this capture? This removes the reading and photo reference permanently.')) return;
    try {
        await deleteDoc(doc(firebaseDb, 'mobile_captures', id));
        currentRows = currentRows.filter((row) => row.id !== id);
        renderRows();
        statusText.textContent = `Deleted. ${currentRows.length} reading(s) remaining for "${buildingInput.value.trim()}".`;
        exportBtn.disabled = currentRows.length === 0;
    } catch (err) {
        console.error(err);
        statusText.textContent = `Failed to delete: ${err.message}`;
    }
}

function startEdit(id) {
    editingRowId = id;
    renderRows();
}

function cancelEdit() {
    editingRowId = null;
    renderRows();
}

async function saveEdit(id) {
    const row = document.querySelector(`tr[data-row-id="${id}"]`);
    if (!row) return;

    const label = row.querySelector('.edit-label').value.trim();
    const meterType = row.querySelector('.edit-type').value;
    const readingValue = row.querySelector('.edit-reading').value.trim();

    if (!label || !readingValue) {
        alert('Meter label and reading are required.');
        return;
    }

    try {
        await updateDoc(doc(firebaseDb, 'mobile_captures', id), { label, meterType, readingValue });
        const target = currentRows.find((r) => r.id === id);
        if (target) {
            target.label = label;
            target.meterType = meterType;
            target.readingValue = readingValue;
        }
        editingRowId = null;
        renderRows();
        statusText.textContent = `Saved changes to "${label}".`;
    } catch (err) {
        console.error(err);
        statusText.textContent = `Failed to save: ${err.message}`;
    }
}

function renderRows() {
    if (currentRows.length === 0) {
        capturesBody.innerHTML = '<tr><td colspan="7" class="text-muted">No captures found for this building yet.</td></tr>';
        return;
    }

    capturesBody.innerHTML = currentRows.map((row) => {
        const isEditing = row.id === editingRowId;
        const safeLabel = escapeHtml(row.label);
        const safeReading = escapeHtml(row.readingValue);
        const labelCell = isEditing
            ? `<input type="text" class="edit-label" value="${safeLabel}" style="width:100%;">`
            : safeLabel;
        const typeCell = isEditing
            ? `<select class="edit-type">${METER_TYPES.map((t) => `<option value="${t}" ${t === row.meterType ? 'selected' : ''}>${t}</option>`).join('')}</select>`
            : escapeHtml(row.meterType);
        const readingCell = isEditing
            ? `<input type="text" class="edit-reading" value="${safeReading}" style="width:100%;">`
            : safeReading;
        const actionsCell = isEditing
            ? `<button type="button" class="btn-primary btn-sm save-edit-btn" data-id="${row.id}">Save</button> <button type="button" class="btn-secondary btn-sm cancel-edit-btn">Cancel</button>`
            : `<button type="button" class="btn-secondary btn-sm edit-row-btn" data-id="${row.id}">Edit</button> <button type="button" class="btn-secondary btn-sm delete-row-btn" data-id="${row.id}">Delete</button>`;

        return `
        <tr data-row-id="${row.id}">
            <td>${row.photoUrl ? `<a href="${row.photoUrl}" target="_blank" rel="noopener"><img src="${row.photoUrl}" alt="${safeLabel}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;"></a>` : '—'}</td>
            <td>${labelCell}</td>
            <td>${typeCell}</td>
            <td>${readingCell}</td>
            <td>${row.capturedAtDate.toLocaleString()}</td>
            <td>${row.photoUrl ? `<a href="${row.photoUrl}" download="${photoFilename(row)}" target="_blank" rel="noopener">Download</a>` : '—'}</td>
            <td>${actionsCell}</td>
        </tr>
    `;
    }).join('');

    capturesBody.querySelectorAll('.delete-row-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteCapture(btn.dataset.id));
    });
    capturesBody.querySelectorAll('.edit-row-btn').forEach((btn) => {
        btn.addEventListener('click', () => startEdit(btn.dataset.id));
    });
    capturesBody.querySelectorAll('.save-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => saveEdit(btn.dataset.id));
    });
    capturesBody.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => cancelEdit());
    });
}

function loadSheetJS() {
    return new Promise((resolve, reject) => {
        if (window.XLSX) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load SheetJS'));
        document.head.appendChild(script);
    });
}

async function exportToExcel() {
    if (currentRows.length === 0) return;

    await loadSheetJS();

    const sorted = [...currentRows].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }));

    const sheetRows = sorted.map((row) => [row.label, Number(row.readingValue) || row.readingValue]);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    worksheet['!cols'] = [{ wch: 24 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Readings');

    const building = buildingInput.value.trim() || 'building';
    const dateStamp = formatDate(new Date());
    XLSX.writeFile(workbook, `${building} Readings ${dateStamp}.xlsx`);
}

loadBtn.addEventListener('click', () => loadCaptures());
exportBtn.addEventListener('click', exportToExcel);
buildingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCaptures();
});

// Auto-load the default building on first visit; keeps refreshing every
// 15s afterwards so new mobile captures show up without manual reloads.
loadCaptures();
