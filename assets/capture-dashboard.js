/**
 * capture-dashboard.js
 * Reads readings captured by the Fuzio Meter Reader Android app
 * (Firestore collection: mobile_captures) and lets office staff
 * review them, download photos, and export a Genesis-style two-column
 * Excel workbook (meter label, reading value).
 */
import {
    collection,
    getDocs,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { firebaseDb } from './firebase.js';

const buildingInput = document.getElementById('building-input');
const loadBtn = document.getElementById('load-btn');
const exportBtn = document.getElementById('export-btn');
const statusText = document.getElementById('status-text');
const capturesBody = document.getElementById('captures-body');

let currentRows = [];

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

async function loadCaptures() {
    const building = buildingInput.value.trim();
    if (!building) return;

    statusText.textContent = 'Loading...';
    loadBtn.disabled = true;
    exportBtn.disabled = true;

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
        statusText.textContent = `${currentRows.length} reading(s) found for "${building}".`;
        exportBtn.disabled = currentRows.length === 0;
    } catch (err) {
        console.error(err);
        statusText.textContent = `Failed to load captures: ${err.message}`;
    } finally {
        loadBtn.disabled = false;
    }
}

function renderRows() {
    if (currentRows.length === 0) {
        capturesBody.innerHTML = '<tr><td colspan="6" class="text-muted">No captures found for this building yet.</td></tr>';
        return;
    }

    capturesBody.innerHTML = currentRows.map((row) => `
        <tr>
            <td>${row.photoUrl ? `<a href="${row.photoUrl}" target="_blank" rel="noopener"><img src="${row.photoUrl}" alt="${row.label}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;"></a>` : '—'}</td>
            <td>${row.label}</td>
            <td>${row.meterType}</td>
            <td>${row.readingValue}</td>
            <td>${row.capturedAtDate.toLocaleString()}</td>
            <td>${row.photoUrl ? `<a href="${row.photoUrl}" download="${photoFilename(row)}" target="_blank" rel="noopener">Download</a>` : '—'}</td>
        </tr>
    `).join('');
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

loadBtn.addEventListener('click', loadCaptures);
exportBtn.addEventListener('click', exportToExcel);
buildingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCaptures();
});

// Auto-load the default building on first visit.
loadCaptures();
