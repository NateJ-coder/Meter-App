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
import {
    onAuthStateChanged,
    signOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

import { firebaseAuth, firebaseDb } from './firebase.js';

const OFFICE_EMAILS = new Set([
    'nathan@sectionalts.co',
    'admin@sectionalts.co'
]);

const officeUser = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        unsubscribe();
        resolve(user && OFFICE_EMAILS.has(user.email?.toLowerCase()) ? user : null);
    });
});

if (!officeUser) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace(`/capture-login.html?returnTo=${returnTo}`);
    await new Promise(() => {});
}

document.body.classList.remove('dashboard-auth-pending');

const buildingSelect = document.getElementById('building-select');
const monthSelect = document.getElementById('month-select');
const loadBtn = document.getElementById('load-btn');
const exportBtn = document.getElementById('export-btn');
const downloadPhotosBtn = document.getElementById('download-photos-btn');
const statusText = document.getElementById('status-text');
const capturesBody = document.getElementById('captures-body');
const signOutLink = document.getElementById('sign-out-link');

let currentRows = [];
let allRows = []; // Store all loaded rows
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

function formatMonth(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function displayMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function populateMonthFilter() {
    const months = new Set();
    allRows.forEach(row => {
        months.add(formatMonth(row.capturedAtDate));
    });
    
    const sortedMonths = Array.from(months).sort().reverse(); // Newest first
    
    // Store current selection
    const currentSelection = monthSelect.value;
    
    // Clear and rebuild options
    monthSelect.innerHTML = '<option value="">All months</option>';
    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = displayMonth(month);
        monthSelect.appendChild(option);
    });
    
    // Restore selection if it still exists
    if (currentSelection && sortedMonths.includes(currentSelection)) {
        monthSelect.value = currentSelection;
    }
}

function applyMonthFilter() {
    const selectedMonth = monthSelect.value;
    if (!selectedMonth) {
        currentRows = [...allRows];
    } else {
        currentRows = allRows.filter(row => formatMonth(row.capturedAtDate) === selectedMonth);
    }
}

async function loadCaptures(isAutoRefresh = false) {
    const building = buildingSelect.value.trim();
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
                rawReadingValue: data.rawReadingValue ?? data.readingValue ?? '',
                readerNote: data.readerNote || '',
                readerWarnings: Array.isArray(data.readerWarnings) ? data.readerWarnings : [],
                readerAcknowledged: data.readerAcknowledged === true,
                photoUrl: data.photoUrl || '',
                capturedAtDate
            };
        }).sort((a, b) => b.capturedAtDate - a.capturedAtDate); // Newest first

        allRows = currentRows;
        populateMonthFilter();
        applyMonthFilter();
        renderRows();
        const stamp = new Date().toLocaleTimeString();
        const totalCount = allRows.length;
        const filteredCount = currentRows.length;
        statusText.textContent = filteredCount < totalCount 
            ? `${filteredCount} of ${totalCount} reading(s) for "${building}" (last refreshed ${stamp})`
            : `${currentRows.length} reading(s) found for "${building}" (last refreshed ${stamp})`;
        exportBtn.disabled = currentRows.length === 0;
        downloadPhotosBtn.disabled = !currentRows.some((row) => row.photoUrl);
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
        allRows = allRows.filter((row) => row.id !== id);
        currentRows = currentRows.filter((row) => row.id !== id);
        populateMonthFilter();
        renderRows();
        statusText.textContent = `Deleted. ${currentRows.length} reading(s) remaining for "${buildingSelect.value.trim()}".`;
        exportBtn.disabled = currentRows.length === 0;
        downloadPhotosBtn.disabled = !currentRows.some((row) => row.photoUrl);
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
        capturesBody.innerHTML = '<tr><td colspan="8" class="text-muted">No captures found for this building yet.</td></tr>';
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
            : `${safeReading}<br><small>Entered: ${escapeHtml(row.rawReadingValue)}</small>`;
        const reviewCell = [
            row.readerAcknowledged ? '<small>Reader checked</small>' : '',
            ...row.readerWarnings.map((warning) => `<div>${escapeHtml(warning)}</div>`),
            row.readerNote ? `<div><strong>Note:</strong> ${escapeHtml(row.readerNote)}</div>` : ''
        ].filter(Boolean).join('') || 'No reader review recorded';
        const actionsCell = isEditing
            ? `<button type="button" class="btn-primary btn-sm save-edit-btn" data-id="${row.id}">Save</button> <button type="button" class="btn-secondary btn-sm cancel-edit-btn">Cancel</button>`
            : `<button type="button" class="btn-secondary btn-sm edit-row-btn" data-id="${row.id}">Edit</button> <button type="button" class="btn-secondary btn-sm delete-row-btn" data-id="${row.id}">Delete</button>`;

        return `
        <tr data-row-id="${row.id}">
            <td>${row.photoUrl ? `<a href="${row.photoUrl}" target="_blank" rel="noopener"><img src="${row.photoUrl}" alt="${safeLabel}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;"></a>` : '—'}</td>
            <td>${labelCell}</td>
            <td>${typeCell}</td>
            <td>${readingCell}</td>
            <td>${reviewCell}</td>
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

// Natural sort that treats "GEN 43" and "GEN43" as the same for ordering
// purposes, so inconsistent spacing during capture doesn't scramble the
// exported order (plain localeCompare({numeric:true}) breaks on this because
// the stray space sorts as its own character between letters and digits).
function naturalLabelCompare(a, b) {
    const tokenize = (s) => s.replace(/\s+/g, '').match(/\d+|\D+/g) || [];
    const at = tokenize(a);
    const bt = tokenize(b);
    const len = Math.max(at.length, bt.length);
    for (let i = 0; i < len; i += 1) {
        const av = at[i] ?? '';
        const bv = bt[i] ?? '';
        const isNum = /^\d+$/.test(av) && /^\d+$/.test(bv);
        const diff = isNum ? Number(av) - Number(bv) : av.localeCompare(bv);
        if (diff) return diff;
    }
    return 0;
}

async function exportToExcel() {
    if (currentRows.length === 0) return;

    await loadSheetJS();

    const sorted = [...currentRows].sort((a, b) => naturalLabelCompare(a.label, b.label));

    const sheetRows = sorted.map((row) => [row.label, Number(row.readingValue) || row.readingValue]);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    worksheet['!cols'] = [{ wch: 24 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Readings');
    const reviewRows = [
        ['Capture ID', 'Building', 'Meter Label', 'Type', 'Admin Reading', 'Raw Reading', 'Reader Note', 'Warnings', 'Reader Checked', 'Captured At'],
        ...sorted.map((row) => [row.id, row.building, row.label, row.meterType,
            row.readingValue, row.rawReadingValue, row.readerNote,
            row.readerWarnings.join('\n'), row.readerAcknowledged,
            row.capturedAtDate.toISOString()])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(reviewRows), 'Reader Review');

    const building = buildingSelect.value.trim() || 'building';
    const dateStamp = formatDate(new Date());
    XLSX.writeFile(workbook, `${building} Readings ${dateStamp}.xlsx`);
}

function loadJSZip() {
    return new Promise((resolve, reject) => {
        if (window.JSZip) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load JSZip'));
        document.head.appendChild(script);
    });
}

// Dedupe filenames within a single zip (two captures could share the same
// label/type/date if a meter was recaptured the same minute).
function uniqueZipName(usedNames, name) {
    if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot === -1 ? name : name.slice(0, dot);
    const ext = dot === -1 ? '' : name.slice(dot);
    let n = 2;
    let candidate = `${base} (${n})${ext}`;
    while (usedNames.has(candidate)) {
        n += 1;
        candidate = `${base} (${n})${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
}

async function downloadAllPhotos() {
    const withPhotos = currentRows.filter((row) => row.photoUrl);
    if (withPhotos.length === 0) return;

    downloadPhotosBtn.disabled = true;
    const originalText = downloadPhotosBtn.textContent;

    try {
        await loadJSZip();
        const zip = new JSZip();
        const usedNames = new Set();
        let failed = 0;

        for (let i = 0; i < withPhotos.length; i += 1) {
            const row = withPhotos[i];
            downloadPhotosBtn.textContent = `Downloading ${i + 1} of ${withPhotos.length}...`;
            try {
                const response = await fetch(row.photoUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                zip.file(uniqueZipName(usedNames, photoFilename(row)), blob);
            } catch (err) {
                failed += 1;
                if (i === 0) {
                    throw new Error(
                        `Photo download failed (${err.message}). No ZIP was created. ` +
                        'Check Storage billing, access permissions and connectivity before retrying.'
                    );
                }
                console.error(`Failed to fetch photo for ${row.label}:`, err);
            }
        }

        downloadPhotosBtn.textContent = 'Zipping...';
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const building = buildingSelect.value.trim() || 'building';
        const dateStamp = formatDate(new Date());
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${building} Photos ${dateStamp}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        statusText.textContent = failed === 0
            ? `Downloaded ${withPhotos.length} photo(s) as a zip.`
            : `Downloaded ${withPhotos.length - failed} of ${withPhotos.length} photo(s) as a zip (${failed} failed — see console).`;
    } catch (err) {
        console.error(err);
        statusText.textContent = err.message;
    } finally {
        downloadPhotosBtn.textContent = originalText;
        downloadPhotosBtn.disabled = !currentRows.some((row) => row.photoUrl);
    }
}

loadBtn.addEventListener('click', () => loadCaptures());
exportBtn.addEventListener('click', exportToExcel);
downloadPhotosBtn.addEventListener('click', downloadAllPhotos);
signOutLink.addEventListener('click', async (event) => {
    event.preventDefault();
    await signOut(firebaseAuth);
    location.replace('/capture-login.html');
});
buildingSelect.addEventListener('change', () => {
    monthSelect.value = ''; // Reset month filter when changing buildings
    loadCaptures();
});
monthSelect.addEventListener('change', () => {
    applyMonthFilter();
    renderRows();
    const building = buildingSelect.value.trim();
    const totalCount = allRows.length;
    const filteredCount = currentRows.length;
    statusText.textContent = filteredCount < totalCount 
        ? `${filteredCount} of ${totalCount} reading(s) for "${building}"`
        : `${currentRows.length} reading(s) for "${building}"`;
    exportBtn.disabled = currentRows.length === 0;
    downloadPhotosBtn.disabled = !currentRows.some((row) => row.photoUrl);
});

// Auto-load the default building on first visit; keeps refreshing every
// 15s afterwards so new mobile captures show up without manual reloads.
loadCaptures();
