import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createCorrectionPatch, assertCaptureUnchanged, getCaptureHistoryWarnings } from '../assets/capture-corrections.mjs';

const current = {
    label: 'GEN UNIT 3P', meterType: 'Electricity', readingValue: '100212',
    rawReadingValue: '100212.3', photoUrl: 'evidence-photo', capturedAt: '2026-08-31'
};
const metadata = { actor: 'office@example.test', reason: 'Serial confirms Unit 30', at: '2026-10-01T10:00:00.000Z' };
const snapshot = structuredClone(current);
const first = createCorrectionPatch(current, { label: 'GEN 30' }, metadata);
assert.equal(first.originalLabel, 'GEN UNIT 3P');
assert.equal(first.rawReadingValue, '100212.3');
assert.equal(first.originalReadingValue, '100212');
assert.equal(first.officeCorrections[0].before.label, 'GEN UNIT 3P');
assert.equal(first.officeCorrections[0].after.label, 'GEN 30');
assert.equal(Object.hasOwn(first, 'photoUrl'), false);
assert.equal(Object.hasOwn(first, 'capturedAt'), false);
assert.deepEqual(current, snapshot);
const second = createCorrectionPatch({ ...current, ...first }, { readingValue: '100213' }, metadata);
assert.equal(second.originalLabel, 'GEN UNIT 3P');
assert.equal(second.originalReadingValue, '100212');
assert.equal(second.rawReadingValue, '100212.3');
assert.equal(second.officeCorrections.length, 2);
assert.equal(createCorrectionPatch({ ...current, ...first }, { label: 'GEN 30' }, metadata), null);
assert.throws(() => createCorrectionPatch(current, { photoUrl: 'replacement' }, metadata));
assert.throws(() => createCorrectionPatch(current, { readingValue: '-1' }, metadata));
assert.throws(() => createCorrectionPatch(current, { label: 'GEN 30' }, { ...metadata, reason: '' }));
assert.throws(() => createCorrectionPatch({ ...current, officeCorrections: {} }, { label: 'GEN 30' }, metadata));
assert.throws(() => assertCaptureUnchanged({ ...current, label: 'GEN 31' }, current));
assertCaptureUnchanged(current, current);
const legacy = { label: 'GEN 1', meterType: 'Electricity', readingValue: '12.3' };
assert.equal(createCorrectionPatch(legacy, { label: 'GEN 01' }, metadata).rawReadingValue, '12.3');
const unreadable = { ...legacy, readingValue: '', isUnreadable: true };
assert.equal(createCorrectionPatch(unreadable, { label: 'GEN 01' }, metadata).readingValue, '');
const historyRow = (id, label, readingValue, month, extra = {}) => ({
    id, label, readingValue, building: 'Genesis', meterType: 'Electricity',
    capturedAtDate: new Date(Date.UTC(2026, month, 1)), ...extra
});
const history = [
    historyRow('old-9', 'GEN UNIT 9', '083018.5', 7),
    historyRow('new-9', 'GEN 09', '53048', 8),
    historyRow('old-61', 'GEN 61', '081015.2', 7),
    historyRow('new-61', 'GEN 61', '813240', 8),
    historyRow('old-59', 'GEN UNIT 59', '61345.3', 7),
    historyRow('new-59', 'GEN 59', '61345', 8),
    historyRow('water-9', 'GEN 09', '10', 8, { meterType: 'Water' }),
    historyRow('other-9', 'GEN 09', '10', 8, { building: 'Other' }),
    historyRow('unreadable-9', 'GEN 09', '', 9, { isUnreadable: true })
];
const historySnapshot = structuredClone(history);
const warnings = getCaptureHistoryWarnings(history);
assert.match(warnings.get('new-9')[0], /Below/);
assert.match(warnings.get('new-61')[0], /ten times/);
assert.match(warnings.get('new-59')[0], /Unchanged/);
for (const id of ['old-9', 'water-9', 'other-9', 'unreadable-9']) assert.deepEqual(warnings.get(id), []);
assert.deepEqual(history, historySnapshot);
const duplicates = getCaptureHistoryWarnings([
    historyRow('first', 'GEN 1', '100', 7), historyRow('second', 'GEN 01', '200', 7),
    historyRow('next', 'GEN 1', '150', 8)
]);
assert.match(duplicates.get('first')[0], /Multiple captures/);
assert.match(duplicates.get('second')[0], /Multiple captures/);
assert.deepEqual(duplicates.get('next'), []);

const workerSource = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const handlers = new Map();
let shell = [];
let networkRequests = 0;
let cachedLookups = 0;
const response = { clone: () => response };
vm.runInNewContext(workerSource, {
    URL,
    self: {
        location: { origin: 'https://example.test' },
        addEventListener: (name, handler) => handlers.set(name, handler),
        skipWaiting: () => {},
        clients: { claim: () => {} }
    },
    caches: {
        open: async () => ({ addAll: async (paths) => { shell = paths; }, put: async () => {} }),
        match: async () => { cachedLookups++; return response; }
    },
    fetch: async () => { networkRequests++; return response; }
});
let installation;
handlers.get('install')({ waitUntil: (promise) => { installation = promise; } });
await installation;
assert.ok(shell.includes('/assets/capture-corrections.mjs'));
let moduleResponse;
handlers.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/assets/capture-corrections.mjs', mode: 'cors' },
    respondWith: (promise) => { moduleResponse = promise; }
});
assert.equal(await moduleResponse, response);
assert.equal(networkRequests, 1);
assert.equal(cachedLookups, 0);
const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(homepage, /http-equiv="refresh" content="0; url=\/capture-dashboard\.html"/);
let destination;
vm.runInNewContext(homepage.match(/<script>(.*?)<\/script>/s)[1], {
    location: { replace: (url) => { destination = url; } }
});
assert.equal(destination, '/capture-dashboard.html');
console.log('Capture correction checks passed.');