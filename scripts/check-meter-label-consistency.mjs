// scripts/check-meter-label-consistency.mjs
//
// Compares the meter identity actually visible in a photo (read by Gemini vision)
// against the label that photo was filed/submitted under, using the building's own
// historical photo corpus (Buildings/buildings/<Building>/cleaned images/meter-image-extractions.json,
// produced by scripts/extract-building-image-data.py) as the source of truth.
//
// Why: on-site staff sometimes mislabel which physical meter a photo belongs to
// (typo, wrong item picked from a list, etc). A meter's serial number plate, when
// legible in the photo, is a much more reliable identifier than a human-typed label.
// This script reads that plate with Gemini vision (the OCR pipeline in
// extract-building-image-data.py could not reliably read it - see
// METER_LABEL_CONSISTENCY_GUIDE.md), compares it against every other photo on file
// for the same canonical meter (and, if it disagrees, against every OTHER meter's
// photos), and:
//   - passes the image through untouched when the identity is consistent with its
//     current label, or when there simply isn't enough history yet to check against,
//   - proposes a specific relabel/rename ONLY when the true identity confidently and
//     unambiguously matches a different meter's own historical identity,
//   - otherwise flags the image for a human to look at.
//
// Nothing is renamed unless --apply is passed. Without it this is a pure dry run
// that only writes a report JSON.
//
// Follows the conventions of scripts/gemini-clean-workbook.mjs (env vars, retry /
// fallback-model handling, JSON-only prompting) and the flags/summary conventions
// of scripts/extract-building-image-data.py, so it fits alongside both.
//
// Usage:
//   node scripts/check-meter-label-consistency.mjs [--building "Azores - Completed"] [--apply]
//   node scripts/check-meter-label-consistency.mjs --self-test
//
// See METER_LABEL_CONSISTENCY_GUIDE.md for full documentation, flag meanings, and
// current limitations.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// dotenv is loaded dynamically (not with a static top-level import) so that
// `--self-test` still runs in an environment where node_modules/dotenv is not
// installed - the self-test never needs a real GEMINI_API_KEY or .env file.
async function loadEnvFiles() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: path.join(ROOT, '.env.local') });
    dotenv.default.config({ path: path.join(ROOT, '.env') });
  } catch (error) {
    // dotenv not available (e.g. running --self-test with no node_modules) -
    // fall back to whatever is already in process.env, but say so rather than
    // failing silently and confusingly later at the API-key check.
    console.warn(`Note: could not load dotenv (${error.message}). Relying on process.env only.`);
  }
}

const BUILDINGS_DIR = path.join(ROOT, 'Buildings', 'buildings');
const OUTPUT_DIR_NAME = 'cleaned images';
const EXTRACTION_FILE_NAME = 'meter-image-extractions.json';
const FINGERPRINT_CACHE_FILE_NAME = 'meter-identity-fingerprints.json';
const REPORT_FILE_NAME = 'meter-label-consistency-report.json';
const APPLIED_LOG_FILE_NAME = 'meter-label-consistency-applied-actions.json';

// Computed from process.env AFTER loadEnvFiles() has run (see main()) so that
// values from .env.local are picked up - not read at module-import time.
function getEnvDefaults() {
  return {
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-1.5-flash,gemini-2.5-flash')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
    maxRetries: Number(process.env.GEMINI_MAX_RETRIES || 3),
    retryBaseMs: Number(process.env.GEMINI_RETRY_BASE_MS || 1800),
    requestTimeoutMs: Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 120000)
  };
}

const SUPPORTED_VISION_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

// Confidence gates. These exist so a low-confidence vision read can never, by
// itself, trigger a proposed correction to a real business record - it can only
// ever get a "needs review" flag. Only a serial number read with confidence >=
// MIN_MATCH_CONFIDENCE, that exactly matches another meter's own equally-confident
// historical reading, is allowed to become a proposed correction.
const MIN_LEGIBLE_CONFIDENCE = 0.30;
const MIN_MATCH_CONFIDENCE = 0.60;

// Confidence gate for the on-screen unit-of-measure / OBIS-style register-code
// text a bulk multi-register meter (e.g. an Itron ACE6000) displays on its
// LCD. Mirrors MIN_LEGIBLE_CONFIDENCE's philosophy: below this, the read is
// not trusted to distinguish one register from another (see item 3 in
// METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09 changelog).
const MIN_REGISTER_TEXT_CONFIDENCE = 0.30;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv, defaults) {
  const options = {
    buildings: [],
    apply: false,
    refreshFingerprints: false,
    limitImages: null,
    selfTest: false,
    image: null,
    model: defaults.model,
    fallbackModels: defaults.fallbackModels,
    maxRetries: defaults.maxRetries,
    retryBaseMs: defaults.retryBaseMs,
    requestTimeoutMs: defaults.requestTimeoutMs
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--building' && argv[i + 1]) {
      options.buildings.push(argv[i + 1]);
      i += 1;
    } else if (token === '--apply') {
      options.apply = true;
    } else if (token === '--refresh-fingerprints') {
      options.refreshFingerprints = true;
    } else if (token === '--self-test') {
      options.selfTest = true;
    } else if (token === '--image' && argv[i + 1]) {
      options.image = argv[i + 1];
      i += 1;
    } else if (token === '--limit-images' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limitImages = parsed;
      }
      i += 1;
    } else if (token === '--model' && argv[i + 1]) {
      options.model = argv[i + 1];
      i += 1;
    } else if (token === '--fallback-models' && argv[i + 1]) {
      options.fallbackModels = String(argv[i + 1]).split(',').map((m) => m.trim()).filter(Boolean);
      i += 1;
    } else if (token === '--max-retries' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 0) options.maxRetries = parsed;
      i += 1;
    } else if (token === '--retry-base-ms' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) options.retryBaseMs = parsed;
      i += 1;
    } else if (token === '--request-timeout-ms' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) options.requestTimeoutMs = parsed;
      i += 1;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function sha1OfBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function normalizeSerial(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Normalizes a staff-typed meter/unit label for COMPARISON purposes only -
// never for display, and never for the rename mechanics (proposeCorrectedFileName
// still substitutes the ORIGINAL label token, unnormalized). Two real gaps this
// closes (see METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09 changelog, item 2):
//   - Staff are inconsistent about typing a leading "#" ("#21" vs plain "21"
//     within the same reading cycle) - without stripping it, those compare as
//     different/unknown labels instead of the same meter.
//   - The live capture app auto-dedupes two photos typed with an identical
//     label within one batch by appending " (2)", " (3)", etc. to the second
//     file's name - without stripping that suffix, a genuinely-identical
//     self-reported label looks like two different ones once it reaches this
//     script, which defeats the very duplicate-detection this suffix is
//     evidence for (see item 1 and item 3 in the same changelog).
function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

// Reduces a label to a case/order/punctuation-insensitive "bag of words", so
// "BULK ELECTRICITY READING" and "ELECTRICITY BULK READING" - two differently
// -worded free-text labels staff typed for what turned out to be the same
// generic "this is a bulk meter" situation - compare equal. Used ONLY to
// GROUP candidate bulk photos together for register-based disambiguation
// (item 3) - never to auto-match a specific meter identity.
function labelWordBag(value) {
  return normalizeLabel(value)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function looksLikeBulkLabel(value) {
  return /\bBULK\b/.test(normalizeLabel(value).toUpperCase());
}

// Parses a typed meter reading the same forgiving-but-decimal-safe way the
// live capture app's parseDecimalInput() (assets/app.js) is meant to -
// Number(), never parseInt/Math.floor/other truncation. See
// METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09 changelog (item 4) for the real
// decimal-loss bug (a Phanda Lodge kVA reading of "105.80" was stored as bare
// "105") this mirrors the fix for.
function parseReadingNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).trim().replace(/[, ]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function cleanString(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'building';
}

// ---------------------------------------------------------------------------
// Building discovery (mirrors the spirit of iter_building_dirs in
// extract-building-image-data.py, but only over buildings that already have an
// extraction file to check against).
// ---------------------------------------------------------------------------

function discoverBuildingsWithExtraction() {
  if (!fs.existsSync(BUILDINGS_DIR)) return [];
  return fs.readdirSync(BUILDINGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() !== OUTPUT_DIR_NAME.toLowerCase())
    .map((entry) => path.join(BUILDINGS_DIR, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, OUTPUT_DIR_NAME, EXTRACTION_FILE_NAME)))
    .sort();
}

function resolveBuildingDirs(requestedBuildings) {
  const all = discoverBuildingsWithExtraction();
  if (!requestedBuildings || !requestedBuildings.length) {
    return all;
  }
  const requestedSlugs = new Set(requestedBuildings.map(slugify));
  const matched = all.filter((dir) => requestedSlugs.has(slugify(path.basename(dir))));
  const matchedSlugs = new Set(matched.map((dir) => slugify(path.basename(dir))));
  const missing = [...requestedSlugs].filter((slug) => !matchedSlugs.has(slug));
  if (missing.length) {
    throw new Error(
      `No building with an existing ${EXTRACTION_FILE_NAME} matched: ${missing.join(', ')}. ` +
      'Run scripts/extract-building-image-data.py for that building first.'
    );
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Gemini vision call - adapted from the callGemini/callGeminiResilient pattern
// in scripts/gemini-clean-workbook.mjs, extended to send an inline image part.
// ---------------------------------------------------------------------------

function buildIdentityPrompt() {
  return [
    'You are inspecting a single photograph of a physical electricity or water utility meter',
    'used by a South African property-management company for billing and audit records.',
    '',
    'The meter usually has a serial number printed on a metal identification plate mounted',
    'on the meter body. Read that serial number character-for-character exactly as printed,',
    'if it is visible and legible in this photo. Do not guess or complete a partially visible',
    'serial number - if you are not confident of every character, lower your confidence score',
    'instead of inventing characters.',
    '',
    'Also note the meter brand/model markings if visible (for example "Itron ACE6000"), and any',
    'other visible details that could help tell this specific physical meter apart from other,',
    'similar meters at the same site (wall colour, pipework, wiring, mounting position, nearby',
    'signage, or a unit/door number physically painted or written near the meter - NOT the',
    'photo file name, which you cannot see).',
    '',
    'Some meters - especially 3-phase bulk/check meters such as an Itron ACE6000 - cycle through',
    'several different registers on their LCD display over time, each showing a different unit of',
    'measure (for example "kWh" for active/import energy, "kvarh" for reactive energy, or "kVA" for',
    'demand) and often a small OBIS-style register code near the reading (for example "1.8.0",',
    '"3.8.0", "4.8.0", or "6.1.0"). If this photo\'s display clearly shows such a unit-of-measure',
    'label and/or a register code, read them exactly as displayed - this is what lets otherwise',
    'identically-labeled "bulk reading" photos be told apart. If neither is visible, set them to',
    'null rather than guessing.',
    '',
    'Return JSON only. No markdown fences. No explanation outside the JSON. Use exactly this shape:',
    '{',
    '  "serial_number": string or null,',
    '  "serial_number_confidence": number from 0.0 to 1.0,',
    '  "meter_model": string or null,',
    '  "meter_model_confidence": number from 0.0 to 1.0,',
    '  "visible_label_text": string or null,',
    '  "on_screen_unit_text": string or null,',
    '  "on_screen_unit_text_confidence": number from 0.0 to 1.0,',
    '  "on_screen_register_code": string or null,',
    '  "on_screen_register_code_confidence": number from 0.0 to 1.0,',
    '  "distinguishing_features": string,',
    '  "notes": string',
    '}',
    '',
    'If the serial plate is not visible, obscured, or too blurry to read with confidence, set',
    'serial_number to null and serial_number_confidence to a low number, and say why in notes.'
  ].join('\n');
}

function extractTextFromGeminiResponse(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n').trim();
}

function parseModelJson(rawText) {
  if (!rawText) {
    throw new Error('Model returned empty text response.');
  }
  try {
    return JSON.parse(rawText);
  } catch {
    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(rawText.slice(first, last + 1));
    }
    throw new Error('Model response was not valid JSON.');
  }
}

async function callGeminiVision({ apiKey, model, promptText, imageBase64, mimeType, requestTimeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          { inlineData: { mimeType, data: imageBase64 } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (error) {
    // Distinguish a real request timeout from other fetch failures (DNS, TLS,
    // no network egress, connection refused, etc) instead of labeling every
    // failure "timed out" - that distinction matters a lot when diagnosing why
    // a run isn't producing identities.
    const isRealTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const timeoutError = new Error(
      isRealTimeout
        ? `Gemini request timed out after ${requestTimeoutMs}ms`
        : `Gemini request failed before receiving a response: ${error?.message || error}`
    );
    timeoutError.status = isRealTimeout ? 408 : 0;
    timeoutError.code = isRealTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
    timeoutError.cause = error;
    throw timeoutError;
  }

  const responseJson = await response.json();
  if (!response.ok) {
    const message = responseJson?.error?.message || `Gemini API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = responseJson?.error?.status || responseJson?.error?.code || null;
    throw error;
  }
  return responseJson;
}

function isRetriableGeminiError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || 0);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if (['RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'DEADLINE_EXCEEDED'].includes(code)) return true;
  if (message.includes('high demand') || message.includes('resource exhausted') || message.includes('temporarily unavailable') || message.includes('try again later')) return true;
  return false;
}

async function callGeminiVisionResilient({ apiKey, primaryModel, fallbackModels, promptText, imageBase64, mimeType, maxRetries, retryBaseMs, requestTimeoutMs }) {
  const candidates = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];
  const attemptsPerModel = Math.max(1, Number(maxRetries) + 1);
  const failures = [];

  for (const model of candidates) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
      try {
        const response = await callGeminiVision({ apiKey, model, promptText, imageBase64, mimeType, requestTimeoutMs });
        return { response, modelUsed: model, attempt };
      } catch (error) {
        failures.push({ model, attempt, message: error.message, status: error.status || null, code: error.code || null });
        const canRetry = isRetriableGeminiError(error) && attempt < attemptsPerModel;
        if (!canRetry) break;
        const jitter = Math.floor(Math.random() * 700);
        const delay = (retryBaseMs * Math.pow(2, attempt - 1)) + jitter;
        console.warn(`Gemini transient error on ${model} (attempt ${attempt}/${attemptsPerModel}): ${error.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  const summary = failures.map((f) => `${f.model}#${f.attempt}: ${f.message}`).join(' | ');
  throw new Error(`All Gemini model attempts failed. ${summary}`);
}

function sanitizeIdentityRecord(record) {
  return {
    serial_number: cleanString(record?.serial_number) || null,
    serial_number_confidence: clamp01(record?.serial_number_confidence),
    meter_model: cleanString(record?.meter_model) || null,
    meter_model_confidence: clamp01(record?.meter_model_confidence),
    visible_label_text: cleanString(record?.visible_label_text) || null,
    // On-screen unit-of-measure / OBIS-style register-code text, read from the
    // SAME vision call/prompt above (no extra Gemini call - see item 3 in
    // METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09 changelog). Used to tell
    // apart a bulk multi-register meter's different registers (kWh / kvarh /
    // kVA) when staff typed the same generic "bulk reading" label for all of
    // them.
    on_screen_unit_text: cleanString(record?.on_screen_unit_text) || null,
    on_screen_unit_text_confidence: clamp01(record?.on_screen_unit_text_confidence),
    on_screen_register_code: cleanString(record?.on_screen_register_code) || null,
    on_screen_register_code_confidence: clamp01(record?.on_screen_register_code_confidence),
    distinguishing_features: cleanString(record?.distinguishing_features),
    notes: cleanString(record?.notes)
  };
}

// ---------------------------------------------------------------------------
// Bulk multi-register classification (item 3 - see METER_LABEL_CONSISTENCY_GUIDE.md
// 2026-09 changelog). Derives which physical register a "bulk meter" photo
// represents from the on-screen unit-of-measure text / OBIS-style register
// code Gemini read (buildIdentityPrompt above), rather than trusting the
// free-text label staff typed for the "this is a bulk meter" case - which, in
// practice, is not typed consistently (seen in the field: "BULK ELECTRICITY
// READING" vs "ELECTRICITY BULK READING" for what were actually four
// DIFFERENT registers of the same physical Itron ACE6000 bulk meter, not four
// copies of the same photo).
function classifyBulkRegister(identity) {
  if (!identity) return null;
  const codeConfidence = clamp01(identity.on_screen_register_code_confidence);
  const unitConfidence = clamp01(identity.on_screen_unit_text_confidence);
  const code = codeConfidence >= MIN_REGISTER_TEXT_CONFIDENCE ? cleanString(identity.on_screen_register_code) : '';
  const unitText = unitConfidence >= MIN_REGISTER_TEXT_CONFIDENCE
    ? cleanString(identity.on_screen_unit_text).toUpperCase()
    : '';

  // OBIS-style register code is checked first - it's the more precise signal
  // when both are legible. 1.8.x = active/import energy (kWh), 3.8.x/4.8.x =
  // reactive energy (kvarh), 6.x.x = demand (kVA).
  if (/^1\.8\b/.test(code)) return 'kWh-import';
  if (/^3\.8\b/.test(code) || /^4\.8\b/.test(code)) return 'kvarh-reactive';
  if (/^6(\.|\b)/.test(code)) return 'kVA-demand';

  if (unitText.includes('KVARH')) return 'kvarh-reactive';
  if (unitText.includes('KVA')) return 'kVA-demand';
  if (unitText.includes('KWH')) return 'kWh-import';

  return null;
}

const BULK_REGISTER_LABELS = {
  'kWh-import': 'kWh import (active energy)',
  'kvarh-reactive': 'kvarh (reactive energy)',
  'kVA-demand': 'kVA (demand)'
};

async function identifyMeterInImage({ apiKey, model, fallbackModels, fileBuffer, mimeType, maxRetries, retryBaseMs, requestTimeoutMs }) {
  const imageBase64 = fileBuffer.toString('base64');
  const promptText = buildIdentityPrompt();
  const geminiCall = await callGeminiVisionResilient({
    apiKey, primaryModel: model, fallbackModels, promptText, imageBase64, mimeType, maxRetries, retryBaseMs, requestTimeoutMs
  });
  const rawText = extractTextFromGeminiResponse(geminiCall.response);
  const parsed = parseModelJson(rawText);
  return { sanitized: sanitizeIdentityRecord(parsed), modelUsed: geminiCall.modelUsed, attempt: geminiCall.attempt };
}

// ---------------------------------------------------------------------------
// Fingerprint cache (per building) - avoids re-billing Gemini for images whose
// content has not changed since the last run.
// ---------------------------------------------------------------------------

function loadFingerprintCache(buildingDir) {
  const cachePath = path.join(buildingDir, OUTPUT_DIR_NAME, FINGERPRINT_CACHE_FILE_NAME);
  if (!fs.existsSync(cachePath)) return { cachePath, entries: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return { cachePath, entries: parsed.entries || {} };
  } catch {
    return { cachePath, entries: {} };
  }
}

function saveFingerprintCache(cachePath, entries) {
  fs.writeFileSync(cachePath, JSON.stringify({ generated_at: nowIso(), entries }, null, 2));
}

// ---------------------------------------------------------------------------
// Aggregation + decision logic. Kept as pure functions (no file/network I/O) so
// they can be exercised directly by --self-test with synthetic fixtures.
// ---------------------------------------------------------------------------

function aggregateFingerprint(entries) {
  // entries: [{ image_path, identity }], identity being a sanitized record
  // (or an { unsupported: true } / { vision_call_failed: true } marker).
  const buckets = new Map(); // normalizedSerial -> { count, confidences: [], sampleImagePaths: [] }
  for (const { image_path: imagePath, identity } of entries) {
    if (!identity || identity.unsupported || identity.vision_call_failed) continue;
    const serial = identity.serial_number;
    const confidence = identity.serial_number_confidence || 0;
    if (!serial || confidence < MIN_MATCH_CONFIDENCE) continue;
    const normalized = normalizeSerial(serial);
    if (!normalized) continue;
    const bucket = buckets.get(normalized) || { count: 0, confidences: [], sampleImagePaths: [] };
    bucket.count += 1;
    bucket.confidences.push(confidence);
    bucket.sampleImagePaths.push(imagePath);
    buckets.set(normalized, bucket);
  }

  if (buckets.size === 0) return null;

  let best = null;
  for (const [normalizedSerial, bucket] of buckets.entries()) {
    const avgConfidence = bucket.confidences.reduce((a, b) => a + b, 0) / bucket.confidences.length;
    if (!best || bucket.count > best.count || (bucket.count === best.count && avgConfidence > best.avgConfidence)) {
      best = { normalizedSerial, count: bucket.count, avgConfidence, sampleImagePaths: bucket.sampleImagePaths };
    }
  }

  return {
    consensus: best,
    distinctSerialCount: buckets.size,
    inconsistent: buckets.size > 1,
    allSerials: [...buckets.keys()]
  };
}

function proposeCorrectedFileName(image, newMeterNumber) {
  const fileName = image.file_name;
  const oldToken = image.meter_number || image.unit_label;
  if (!fileName || !oldToken) return null;
  const idx = fileName.toLowerCase().indexOf(String(oldToken).toLowerCase());
  if (idx === -1) return null;
  return fileName.slice(0, idx) + newMeterNumber + fileName.slice(idx + oldToken.length);
}

// ---------------------------------------------------------------------------
// Duplicate self-reported labels within one upload batch/cycle (item 1 - see
// METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09 changelog). Two photos typed in
// as the same unit label within the SAME cycle is a strong, cheap-to-detect
// signal that at least one of them is mistyped - real case: two Phanda Lodge
// photos both self-reported as unit "#3" in one cycle; serial-number history
// (plus a physical "2" sticker visible in the photo) showed one of them was
// actually unit 2. Detecting this drives the identity-vs-history comparison
// below to run for BOTH photos, rather than only one of them getting checked
// (or one getting a free "pass" it shouldn't).
//
// A generic "bulk" label (e.g. "BULK ELECTRICITY READING") is deliberately
// excluded here - that repetition is handled by the register-disambiguation
// path (item 3, looksLikeBulkLabel/labelWordBag) instead, since a batch full
// of bulk-meter photos sharing a generic label is not the same kind of
// problem as two UNIT photos accidentally typed with the same number.
//
// Batch/cycle is approximated by (containing_folder, date) together - the
// same per-cycle grouping the extraction pipeline already produces for a
// reading cycle's photos (see scripts/extract-building-image-data.py).
function detectDuplicateLabelsInBatch(images) {
  const groups = new Map(); // batchKey -> imagePath[]

  for (const image of images) {
    const rawLabel = image.meter_number || image.unit_label;
    if (!rawLabel || looksLikeBulkLabel(rawLabel)) continue;

    const normalizedLabel = normalizeLabel(rawLabel).toUpperCase();
    if (!normalizedLabel) continue;

    const batchToken = `${image.containing_folder || 'unknown-folder'}|${image.date || 'unknown-date'}`;
    const key = `${batchToken}::${normalizedLabel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(image.image_path);
  }

  const duplicateGroups = new Map(); // imagePath -> peer imagePaths (excluding self)
  for (const imagePaths of groups.values()) {
    if (imagePaths.length < 2) continue;
    for (const imagePath of imagePaths) {
      duplicateGroups.set(imagePath, imagePaths.filter((p) => p !== imagePath));
    }
  }
  return duplicateGroups;
}

// ---------------------------------------------------------------------------
// Zero-consumption-delta history awareness (item 5 - see
// METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09 changelog). An identical reading
// to last cycle is not automatically a mistake - a vacant or very-low-usage
// unit can legitimately show the same reading for several cycles running.
// Only a SUDDEN, first-time zero-delta (the meter was moving normally before)
// is worth a human's attention; a zero-delta that continues an already-flat
// run is expected and should not be flagged.
//
// history: chronologically sorted [{ date, value }] for one meter, oldest
// first, ending with the reading being assessed (the "current" cycle).
function assessZeroDelta(history) {
  if (!Array.isArray(history) || history.length < 2) {
    return { checked: false, reason: 'insufficient-history' };
  }
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  if (current.value == null || previous.value == null) {
    return { checked: false, reason: 'unreadable-value' };
  }

  const currentDelta = current.value - previous.value;
  if (currentDelta !== 0) {
    return { checked: true, isZeroDelta: false };
  }

  // Look back over up to the prior 3 deltas to see whether this meter was
  // already flat, or was moving normally and this zero is new.
  const priorDeltas = [];
  for (let i = history.length - 2; i > 0 && priorDeltas.length < 3; i -= 1) {
    const a = history[i];
    const b = history[i - 1];
    if (a.value == null || b.value == null) break;
    priorDeltas.push(a.value - b.value);
  }

  const alreadyFlat = priorDeltas.length > 0 && priorDeltas.every((d) => d === 0);

  if (alreadyFlat) {
    return { checked: true, isZeroDelta: true, suspicious: false, reason: 'zero-delta-consistent-with-recent-flat-history' };
  }
  if (priorDeltas.length === 0) {
    // Only one prior data point exists beyond "previous" itself - not enough
    // to call this either a new pattern or a continuation of an old one.
    return { checked: true, isZeroDelta: true, suspicious: false, reason: 'insufficient-history-to-judge-first-time-zero-delta' };
  }
  return { checked: true, isZeroDelta: true, suspicious: true, reason: 'sudden-first-time-zero-delta-after-normal-movement' };
}

// Builds, from the full images array (which spans every reading cycle on
// file for a building), each meter's own typed-reading history in
// chronological order - what assessZeroDelta() needs to tell a genuinely
// flat meter apart from one that just went flat this cycle.
function buildReadingHistoryByMeter(images) {
  const byMeter = new Map();
  for (const image of images) {
    const meterNumber = image.reference_meter_number;
    if (!meterNumber) continue;
    const value = parseReadingNumber(image.meter_reading);
    if (value == null) continue;
    const list = byMeter.get(meterNumber) || [];
    list.push({ date: image.date || '', value, image_path: image.image_path });
    byMeter.set(meterNumber, list);
  }
  for (const list of byMeter.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return byMeter;
}

/**
 * Decides, for every image, whether its current label is consistent with the
 * meter identity Gemini read from the photo itself.
 *
 * @param {Array<object>} images - entries from meter-image-extractions.json's
 *   `images` array (needs image_path, file_name, meter_number, unit_label,
 *   reference_meter_number, reference_match_kind).
 * @param {Record<string, object>} identities - image_path -> sanitized identity
 *   record (or { unsupported: true } / { vision_call_failed: true, error }).
 * @returns {{ results: Array<object>, meterFingerprints: Record<string, object> }}
 */
function computeMeterLabelConsistency(images, identities) {
  const meterImageIndex = {};
  for (const image of images) {
    const meterNumber = image.reference_meter_number;
    if (!meterNumber) continue;
    const identity = identities[image.image_path];
    if (!identity) continue;
    (meterImageIndex[meterNumber] ||= []).push({ image_path: image.image_path, identity });
  }

  const fullAggregates = {};
  for (const [meterNumber, entries] of Object.entries(meterImageIndex)) {
    fullAggregates[meterNumber] = aggregateFingerprint(entries);
  }

  // Item 1 (duplicate self-reported labels within one batch) and item 5
  // (history-aware zero-delta assessment) - see METER_LABEL_CONSISTENCY_GUIDE.md's
  // 2026-09 changelog. Computed once, up front, from the full images array so
  // every meter's cross-cycle history is available regardless of which image
  // in the loop below is being assessed.
  const duplicateLabelGroups = detectDuplicateLabelsInBatch(images);
  const readingHistoryByMeter = buildReadingHistoryByMeter(images);

  const results = [];

  for (const image of images) {
    const identity = identities[image.image_path];
    const labeledMeter = image.reference_meter_number || null;
    const result = {
      image_path: image.image_path,
      file_name: image.file_name,
      containing_folder: image.containing_folder,
      current_label_token: image.meter_number,
      labeled_meter_number: labeledMeter,
      reference_match_kind: image.reference_match_kind,
      flags: []
    };

    // Item 1: flag (and remember) when this photo's self-reported label is
    // shared by another photo in the same batch/cycle - checked regardless of
    // whether the vision identity below is usable, since it's a fact about
    // the labels themselves.
    const duplicatePeers = duplicateLabelGroups.get(image.image_path) || null;
    if (duplicatePeers) {
      result.flags.push('duplicate-label-in-batch');
      result.duplicate_label_peers = duplicatePeers;
    }

    // Item 5: a zero-delta reading is only worth flagging when it's a
    // SUDDEN, first-time occurrence for this meter - not when the meter has
    // already been flat for a while (a vacant/near-zero-usage unit can
    // legitimately repeat the same reading for several cycles). This is
    // purely about the typed reading VALUE, so it is computed independently
    // of the photo-identity checks below.
    if (labeledMeter) {
      const meterHistory = readingHistoryByMeter.get(labeledMeter);
      if (meterHistory && meterHistory.length) {
        const idx = meterHistory.findIndex((h) => h.image_path === image.image_path);
        if (idx !== -1) {
          const zeroDeltaAssessment = assessZeroDelta(meterHistory.slice(0, idx + 1));
          if (zeroDeltaAssessment.checked && zeroDeltaAssessment.isZeroDelta) {
            result.zero_delta = true;
            result.zero_delta_suspicious = !!zeroDeltaAssessment.suspicious;
            result.zero_delta_reason = zeroDeltaAssessment.reason;
            result.flags.push(
              zeroDeltaAssessment.suspicious ? 'zero-delta-first-time-needs-review' : 'zero-delta-consistent-with-recent-history'
            );
          }
        }
      }
    }

    if (!identity) {
      result.decision = 'skipped';
      result.flags.push('image-file-missing-or-unreadable');
      results.push(result);
      continue;
    }
    if (identity.unsupported) {
      result.decision = 'skipped';
      result.flags.push('unsupported-image-format-for-vision');
      results.push(result);
      continue;
    }
    if (identity.vision_call_failed) {
      result.decision = 'needs-review';
      result.flags.push('gemini-call-failed');
      result.error = identity.error;
      results.push(result);
      continue;
    }

    result.detected_serial_number = identity.serial_number;
    result.detected_serial_confidence = identity.serial_number_confidence;
    result.detected_meter_model = identity.meter_model;
    result.detected_visible_label_text = identity.visible_label_text;
    result.distinguishing_features = identity.distinguishing_features;

    // Item 3: for a generically-labeled "bulk meter" photo, use the on-screen
    // unit-of-measure text / OBIS-style register code (read by the SAME
    // vision call above - no extra Gemini cost) to work out which physical
    // register this photo actually represents, rather than trusting the
    // free-text label staff typed for "this is a bulk meter" (which is not
    // typed consistently - see METER_LABEL_CONSISTENCY_GUIDE.md's 2026-09
    // changelog). Purely informational/advisory for now (see that changelog
    // for why this is not wired into --apply auto-renaming yet).
    const rawLabelForBulkCheck = image.meter_number || image.unit_label || '';
    if (looksLikeBulkLabel(rawLabelForBulkCheck)) {
      result.bulk_generic_label_bag = labelWordBag(rawLabelForBulkCheck);
      const bulkRegisterType = classifyBulkRegister(identity);
      if (bulkRegisterType) {
        result.detected_bulk_register_type = bulkRegisterType;
        result.detected_on_screen_unit_text = identity.on_screen_unit_text;
        result.detected_on_screen_register_code = identity.on_screen_register_code;
        result.suggested_register_label = `${normalizeLabel(rawLabelForBulkCheck)} (${BULK_REGISTER_LABELS[bulkRegisterType]})`;
        result.flags.push('bulk-register-identified-from-on-screen-text');
      } else {
        result.flags.push('bulk-register-not-identified-from-on-screen-text');
      }
    }

    const detectedNormalized = identity.serial_number ? normalizeSerial(identity.serial_number) : null;
    const detectedConfidence = identity.serial_number_confidence || 0;

    if (!detectedNormalized || detectedConfidence < MIN_LEGIBLE_CONFIDENCE) {
      result.decision = 'not-legible';
      result.flags.push('meter-identity-not-legible');
      results.push(result);
      continue;
    }

    const isHighConfidence = detectedConfidence >= MIN_MATCH_CONFIDENCE;

    let selfAggregate = null;
    if (labeledMeter) {
      const others = (meterImageIndex[labeledMeter] || []).filter((e) => e.image_path !== image.image_path);
      selfAggregate = aggregateFingerprint(others);
      if (fullAggregates[labeledMeter]?.inconsistent) {
        result.flags.push('historical-serial-inconsistent-for-labeled-meter');
      }
    }

    const selfMatches = !!(selfAggregate && selfAggregate.consensus.normalizedSerial === detectedNormalized);

    // Normally a confirmed self-match short-circuits straight to "pass" -
    // but not when this photo shares its self-reported label with another
    // photo in the SAME batch/cycle (item 1). In that situation "self"
    // history can be the very duplicate that's actually mislabeled, so every
    // photo in the duplicate group is still run through the full candidate
    // search below instead of taking the shortcut.
    if (selfMatches && !duplicatePeers) {
      result.decision = 'pass';
      results.push(result);
      continue;
    }

    const candidateMatches = [];
    for (const [meterNumber] of Object.entries(meterImageIndex)) {
      const aggregate = meterNumber === labeledMeter ? selfAggregate : fullAggregates[meterNumber];
      if (!aggregate || !aggregate.consensus) continue;
      if (aggregate.consensus.normalizedSerial === detectedNormalized) {
        candidateMatches.push({
          meter_number: meterNumber,
          confidence: aggregate.consensus.avgConfidence,
          support_count: aggregate.consensus.count,
          sample_image_paths: aggregate.consensus.sampleImagePaths
        });
      }
    }

    if (candidateMatches.length === 1 && candidateMatches[0].meter_number === labeledMeter) {
      // Ran the full disambiguation check (forced by the duplicate-label
      // flag, since a confirmed self-match no longer short-circuits above
      // when a sibling shares this cycle's label) and it confirms this photo
      // IS its own labeled meter after all - not a correction to itself.
      result.decision = 'pass';
      if (duplicatePeers) result.flags.push('duplicate-label-confirmed-correct');
    } else if (candidateMatches.length === 1) {
      const match = candidateMatches[0];
      if (isHighConfidence) {
        result.decision = labeledMeter ? 'propose-correction' : 'label-suggested-for-orphan-image';
        result.proposed_meter_number = match.meter_number;
        result.proposed_match_support = match;
        result.proposed_file_name = proposeCorrectedFileName(image, match.meter_number);
        result.flags.push('label-correction-proposed');
      } else {
        result.decision = 'possible-match-needs-review';
        result.proposed_meter_number = match.meter_number;
        result.proposed_match_support = match;
        result.flags.push('possible-identity-match-needs-review', 'low-confidence-identity-read');
      }
    } else if (candidateMatches.length > 1) {
      result.decision = 'ambiguous-identity-match';
      result.candidate_meter_numbers = candidateMatches.map((m) => m.meter_number);
      result.flags.push('ambiguous-identity-match');
    } else if (!labeledMeter) {
      result.decision = 'orphan-image-no-identity-match';
      result.flags.push('orphan-image-no-identity-match');
    } else if (duplicatePeers) {
      // Ran the full check because of the duplicate label, but it neither
      // confirmed this photo's own label nor confidently pointed at a
      // different meter - still needs a human, tagged specifically as a
      // duplicate-label case (rather than a generic "not enough history"
      // one) since two-in-one-batch is itself the reason to look closer.
      result.decision = 'duplicate-label-needs-review';
      result.flags.push('duplicate-label-needs-review');
    } else if (!selfAggregate) {
      result.decision = 'insufficient-history-for-labeled-meter';
      result.flags.push('insufficient-history-for-labeled-meter');
    } else {
      result.decision = isHighConfidence ? 'identity-conflict-unresolved' : 'possible-identity-conflict-needs-review';
      result.flags.push(isHighConfidence ? 'identity-conflict-unresolved' : 'possible-identity-conflict-needs-review');
    }

    results.push(result);
  }

  // Item 3, cross-check pass: for bulk-labeled photos that shared a generic
  // label within the same batch (looksLikeBulkLabel/labelWordBag above), see
  // whether the register types identified from on-screen text actually
  // differ from each other (expected/fine - they're legitimately different
  // registers of one physical meter, e.g. kWh + kvarh + kVA) or collide
  // (worth a human's attention - either a genuine duplicate photo, or one of
  // them still needs a proper on-screen register read).
  const bulkGroupsByBatchAndBag = new Map();
  for (const result of results) {
    if (!result.bulk_generic_label_bag) continue;
    const key = `${result.containing_folder || ''}::${result.bulk_generic_label_bag}`;
    if (!bulkGroupsByBatchAndBag.has(key)) bulkGroupsByBatchAndBag.set(key, []);
    bulkGroupsByBatchAndBag.get(key).push(result);
  }
  for (const group of bulkGroupsByBatchAndBag.values()) {
    if (group.length < 2) continue;
    const identifiedTypes = group.map((r) => r.detected_bulk_register_type).filter(Boolean);
    const distinctTypes = new Set(identifiedTypes);
    for (const result of group) {
      result.bulk_label_group_size = group.length;
      result.bulk_label_group_image_paths = group.map((r) => r.image_path).filter((p) => p !== result.image_path);
      if (identifiedTypes.length >= 2 && distinctTypes.size === identifiedTypes.length) {
        result.flags.push('bulk-label-group-registers-distinct-as-expected');
      } else if (identifiedTypes.length >= 2 && distinctTypes.size < identifiedTypes.length) {
        result.flags.push('bulk-label-group-registers-collide-needs-review');
      }
    }
  }

  const meterFingerprints = {};
  for (const [meterNumber, aggregate] of Object.entries(fullAggregates)) {
    meterFingerprints[meterNumber] = aggregate
      ? {
        consensus_serial: aggregate.consensus.normalizedSerial,
        support_count: aggregate.consensus.count,
        distinct_serial_count: aggregate.distinctSerialCount,
        inconsistent: aggregate.inconsistent,
        sample_image_paths: aggregate.consensus.sampleImagePaths
      }
      : null;
  }

  return { results, meterFingerprints };
}

// ---------------------------------------------------------------------------
// Per-building processing (I/O + Gemini calls, then delegates decisions above).
// ---------------------------------------------------------------------------

function loadExtraction(buildingDir) {
  const extractionPath = path.join(buildingDir, OUTPUT_DIR_NAME, EXTRACTION_FILE_NAME);
  if (!fs.existsSync(extractionPath)) {
    throw new Error(`Extraction file not found: ${extractionPath}. Run scripts/extract-building-image-data.py first.`);
  }
  return { extractionPath, data: JSON.parse(fs.readFileSync(extractionPath, 'utf-8')) };
}

async function processBuilding(buildingDir, options, apiKey) {
  const buildingName = path.basename(buildingDir);
  const { data: extraction } = loadExtraction(buildingDir);
  let images = extraction.images || [];

  if (options.image) {
    images = images.filter((img) => img.image_path === options.image);
    if (!images.length) {
      throw new Error(`--image "${options.image}" was not found in ${buildingName}'s ${EXTRACTION_FILE_NAME}.`);
    }
  } else if (options.limitImages) {
    images = images.slice(0, options.limitImages);
  }

  const { cachePath, entries: fingerprintCache } = loadFingerprintCache(buildingDir);
  const identities = {};
  let cacheHits = 0;
  let geminiCalls = 0;
  let geminiFailures = 0;

  for (const image of images) {
    const absPath = path.join(buildingDir, image.image_path);
    if (!fs.existsSync(absPath)) {
      identities[image.image_path] = null;
      continue;
    }

    const ext = path.extname(absPath).toLowerCase();
    const mimeType = SUPPORTED_VISION_MIME_TYPES[ext];
    if (!mimeType) {
      identities[image.image_path] = { unsupported: true };
      continue;
    }

    const fileBuffer = fs.readFileSync(absPath);
    const sha1 = sha1OfBuffer(fileBuffer);
    const cached = fingerprintCache[image.image_path];
    if (!options.refreshFingerprints && cached && cached.sha1 === sha1 && !cached.vision_call_failed) {
      identities[image.image_path] = cached;
      cacheHits += 1;
      continue;
    }

    try {
      const { sanitized, modelUsed, attempt } = await identifyMeterInImage({
        apiKey,
        model: options.model,
        fallbackModels: options.fallbackModels,
        fileBuffer,
        mimeType,
        maxRetries: options.maxRetries,
        retryBaseMs: options.retryBaseMs,
        requestTimeoutMs: options.requestTimeoutMs
      });
      const entry = { ...sanitized, sha1, model_used: modelUsed, model_attempt: attempt, generated_at: nowIso() };
      identities[image.image_path] = entry;
      fingerprintCache[image.image_path] = entry;
      geminiCalls += 1;
      console.log(`  [${buildingName}] identified ${image.image_path} -> serial ${sanitized.serial_number || 'null'} (confidence ${sanitized.serial_number_confidence})`);
    } catch (error) {
      identities[image.image_path] = { vision_call_failed: true, error: error.message, sha1 };
      geminiFailures += 1;
      console.warn(`  [${buildingName}] Gemini call failed for ${image.image_path}: ${error.message}`);
    }
  }

  saveFingerprintCache(cachePath, fingerprintCache);

  const { results, meterFingerprints } = computeMeterLabelConsistency(images, identities);

  const decisionCounts = {};
  const flagCounts = {};
  for (const result of results) {
    decisionCounts[result.decision] = (decisionCounts[result.decision] || 0) + 1;
    for (const flag of result.flags) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }
  }

  const actionable = results.filter((r) => r.decision === 'propose-correction' || r.decision === 'label-suggested-for-orphan-image');

  const appliedActions = [];
  if (options.apply && actionable.length) {
    for (const item of actionable) {
      if (!item.proposed_file_name) {
        appliedActions.push({ ...item, apply_status: 'skipped-no-derivable-file-name' });
        continue;
      }
      const oldAbsPath = path.join(buildingDir, item.containing_folder, item.file_name);
      const newAbsPath = path.join(buildingDir, item.containing_folder, item.proposed_file_name);
      if (!fs.existsSync(oldAbsPath)) {
        appliedActions.push({ ...item, apply_status: 'skipped-source-missing' });
        continue;
      }
      if (fs.existsSync(newAbsPath)) {
        appliedActions.push({ ...item, apply_status: 'skipped-destination-exists' });
        continue;
      }
      fs.renameSync(oldAbsPath, newAbsPath);
      appliedActions.push({ ...item, apply_status: 'renamed', applied_at: nowIso() });
      console.log(`  [${buildingName}] APPLIED: "${item.file_name}" -> "${item.proposed_file_name}"`);
    }

    const appliedLogPath = path.join(buildingDir, OUTPUT_DIR_NAME, APPLIED_LOG_FILE_NAME);
    const priorLog = fs.existsSync(appliedLogPath) ? JSON.parse(fs.readFileSync(appliedLogPath, 'utf-8')).runs || [] : [];
    priorLog.push({ run_at: nowIso(), actions: appliedActions });
    fs.writeFileSync(appliedLogPath, JSON.stringify({ runs: priorLog }, null, 2));
  }

  const reportPath = path.join(buildingDir, OUTPUT_DIR_NAME, REPORT_FILE_NAME);
  const report = {
    building_name: buildingName,
    generated_at: nowIso(),
    dry_run: !options.apply,
    model: options.model,
    fallback_models: options.fallbackModels,
    confidence_thresholds: { min_legible_confidence: MIN_LEGIBLE_CONFIDENCE, min_match_confidence: MIN_MATCH_CONFIDENCE },
    summary: {
      images_checked: results.length,
      gemini_calls_made: geminiCalls,
      gemini_calls_failed: geminiFailures,
      fingerprint_cache_hits: cacheHits,
      decisions: decisionCounts,
      flags: flagCounts,
      corrections_proposed: results.filter((r) => r.decision === 'propose-correction').length,
      orphan_labels_suggested: results.filter((r) => r.decision === 'label-suggested-for-orphan-image').length,
      applied_count: appliedActions.filter((a) => a.apply_status === 'renamed').length
    },
    meter_fingerprints: meterFingerprints,
    results
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return { buildingName, reportPath, summary: report.summary };
}

// ---------------------------------------------------------------------------
// Self-test: exercises computeMeterLabelConsistency() against small, clearly
// synthetic fixtures (no real building/meter/serial data) so the decision logic
// can be validated offline, without an API key or network access.
// ---------------------------------------------------------------------------

function makeIdentity(serial, confidence, extra = {}) {
  return { serial_number: serial, serial_number_confidence: confidence, meter_model: null, meter_model_confidence: 0, visible_label_text: null, distinguishing_features: '', ...extra };
}

function runSelfTest() {
  const scenarios = [];

  // 1) Consistent label: TEST-A has two photos, both reading the same serial.
  {
    const images = [
      { image_path: 'a1.jpg', file_name: 'TEST-A photo 1.jpg', containing_folder: '.', meter_number: 'TEST-A', unit_label: 'TEST-A', reference_meter_number: 'TEST-A', reference_match_kind: 'exact' },
      { image_path: 'a2.jpg', file_name: 'TEST-A photo 2.jpg', containing_folder: '.', meter_number: 'TEST-A', unit_label: 'TEST-A', reference_meter_number: 'TEST-A', reference_match_kind: 'exact' }
    ];
    const identities = { 'a1.jpg': makeIdentity('SN-AAA111', 0.9), 'a2.jpg': makeIdentity('SN-AAA111', 0.85) };
    scenarios.push({ name: 'consistent-label-passes', images, identities, expect: { 'a1.jpg': 'pass', 'a2.jpg': 'pass' } });
  }

  // 2) Mislabel with a confident correction: a photo filed under TEST-B actually
  //    reads TEST-C's own well-established serial.
  {
    const images = [
      { image_path: 'c1.jpg', file_name: 'TEST-C photo 1.jpg', containing_folder: '.', meter_number: 'TEST-C', unit_label: 'TEST-C', reference_meter_number: 'TEST-C', reference_match_kind: 'exact' },
      { image_path: 'c2.jpg', file_name: 'TEST-C photo 2.jpg', containing_folder: '.', meter_number: 'TEST-C', unit_label: 'TEST-C', reference_meter_number: 'TEST-C', reference_match_kind: 'exact' },
      { image_path: 'b-mislabeled.jpg', file_name: 'TEST-B photo.jpg', containing_folder: '.', meter_number: 'TEST-B', unit_label: 'TEST-B', reference_meter_number: 'TEST-B', reference_match_kind: 'exact' }
    ];
    const identities = {
      'c1.jpg': makeIdentity('SN-CCC333', 0.92),
      'c2.jpg': makeIdentity('SN-CCC333', 0.88),
      'b-mislabeled.jpg': makeIdentity('SN-CCC333', 0.91)
    };
    scenarios.push({ name: 'confident-mislabel-proposes-correction', images, identities, expect: { 'b-mislabeled.jpg': 'propose-correction' } });
  }

  // 3) Orphan image (no resolved label) that matches an existing meter's history.
  {
    const images = [
      { image_path: 'd1.jpg', file_name: 'TEST-D photo.jpg', containing_folder: '.', meter_number: 'TEST-D', unit_label: 'TEST-D', reference_meter_number: 'TEST-D', reference_match_kind: 'exact' },
      { image_path: 'stray.jpg', file_name: 'unlabeled stray.jpg', containing_folder: '.', meter_number: null, unit_label: null, reference_meter_number: null, reference_match_kind: 'missing' }
    ];
    const identities = { 'd1.jpg': makeIdentity('SN-DDD444', 0.9), 'stray.jpg': makeIdentity('SN-DDD444', 0.9) };
    scenarios.push({ name: 'orphan-image-matches-known-meter', images, identities, expect: { 'stray.jpg': 'label-suggested-for-orphan-image' } });
  }

  // 4) Illegible serial: should never be treated as a pass or a correction.
  {
    const images = [{ image_path: 'e1.jpg', file_name: 'TEST-E photo.jpg', containing_folder: '.', meter_number: 'TEST-E', unit_label: 'TEST-E', reference_meter_number: 'TEST-E', reference_match_kind: 'exact' }];
    const identities = { 'e1.jpg': makeIdentity(null, 0.1) };
    scenarios.push({ name: 'illegible-serial-flagged-not-legible', images, identities, expect: { 'e1.jpg': 'not-legible' } });
  }

  // 5) Low-confidence mismatch: never auto-propose a correction from a shaky read.
  {
    const images = [
      { image_path: 'f1.jpg', file_name: 'TEST-F photo 1.jpg', containing_folder: '.', meter_number: 'TEST-F', unit_label: 'TEST-F', reference_meter_number: 'TEST-F', reference_match_kind: 'exact' },
      { image_path: 'g1.jpg', file_name: 'TEST-G photo.jpg', containing_folder: '.', meter_number: 'TEST-G', unit_label: 'TEST-G', reference_meter_number: 'TEST-G', reference_match_kind: 'exact' }
    ];
    const identities = { 'f1.jpg': makeIdentity('SN-FFF555', 0.9), 'g1.jpg': makeIdentity('SN-FFF555', 0.4) };
    scenarios.push({ name: 'low-confidence-mismatch-never-auto-corrects', images, identities, expect: { 'g1.jpg': 'possible-match-needs-review' } });
  }

  // 6) Single photo on file, no history to check against: insufficient-history, not a false pass/fail.
  {
    const images = [{ image_path: 'h1.jpg', file_name: 'TEST-H photo.jpg', containing_folder: '.', meter_number: 'TEST-H', unit_label: 'TEST-H', reference_meter_number: 'TEST-H', reference_match_kind: 'exact' }];
    const identities = { 'h1.jpg': makeIdentity('SN-HHH666', 0.9) };
    scenarios.push({ name: 'single-photo-insufficient-history', images, identities, expect: { 'h1.jpg': 'insufficient-history-for-labeled-meter' } });
  }

  // --- 2026-09 additions: Phanda Lodge cycle lessons (see
  // METER_LABEL_CONSISTENCY_GUIDE.md's changelog for the real-world motivating
  // case behind each of these). ---

  // 7) Item 1: two photos typed with the identical label in the same batch,
  // and NO independent history exists yet for that meter at all (first-ever
  // cycle) - flagged specifically as a duplicate-label case, not silently
  // treated as "insufficient history" (which would read as "nothing to
  // worry about").
  {
    const images = [
      { image_path: 'k1.jpg', file_name: 'TEST-K photo 1.jpg', containing_folder: 'cycle-1', date: '2026-09-01', meter_number: 'TEST-K', unit_label: 'TEST-K', reference_meter_number: 'TEST-K', reference_match_kind: 'exact' },
      { image_path: 'k2.jpg', file_name: 'TEST-K photo 2.jpg', containing_folder: 'cycle-1', date: '2026-09-01', meter_number: 'TEST-K', unit_label: 'TEST-K', reference_meter_number: 'TEST-K', reference_match_kind: 'exact' }
    ];
    const identities = { 'k1.jpg': makeIdentity('SN-KKK777', 0.9), 'k2.jpg': makeIdentity('SN-LLL888', 0.9) };
    scenarios.push({
      name: 'duplicate-label-in-batch-flagged-with-no-history',
      images,
      identities,
      expect: { 'k1.jpg': 'duplicate-label-needs-review', 'k2.jpg': 'duplicate-label-needs-review' },
      expectFlags: { 'k1.jpg': ['duplicate-label-in-batch'], 'k2.jpg': ['duplicate-label-in-batch'] }
    });
  }

  // 8) Item 1, the real Phanda Lodge shape: two established meters (TEST-M,
  // TEST-N) each with two clean prior cycles. This cycle, BOTH new photos get
  // typed in as "TEST-N" - one really is TEST-N (should still pass, now via
  // the forced disambiguation path rather than the early self-match
  // shortcut), the other is actually the neighboring TEST-M (should be
  // reassigned there, not just flagged "duplicate, needs review").
  {
    const images = [
      { image_path: 'm-prior1.jpg', file_name: 'TEST-M photo prior1.jpg', containing_folder: 'cycle-1', date: '2026-01-05', meter_number: 'TEST-M', unit_label: 'TEST-M', reference_meter_number: 'TEST-M', reference_match_kind: 'exact' },
      { image_path: 'm-prior2.jpg', file_name: 'TEST-M photo prior2.jpg', containing_folder: 'cycle-2', date: '2026-02-05', meter_number: 'TEST-M', unit_label: 'TEST-M', reference_meter_number: 'TEST-M', reference_match_kind: 'exact' },
      { image_path: 'n-prior1.jpg', file_name: 'TEST-N photo prior1.jpg', containing_folder: 'cycle-1', date: '2026-01-05', meter_number: 'TEST-N', unit_label: 'TEST-N', reference_meter_number: 'TEST-N', reference_match_kind: 'exact' },
      { image_path: 'n-prior2.jpg', file_name: 'TEST-N photo prior2.jpg', containing_folder: 'cycle-2', date: '2026-02-05', meter_number: 'TEST-N', unit_label: 'TEST-N', reference_meter_number: 'TEST-N', reference_match_kind: 'exact' },
      { image_path: 'n-this-cycle-correct.jpg', file_name: 'TEST-N photo cycle3.jpg', containing_folder: 'cycle-3', date: '2026-03-05', meter_number: 'TEST-N', unit_label: 'TEST-N', reference_meter_number: 'TEST-N', reference_match_kind: 'exact' },
      { image_path: 'n-this-cycle-mislabeled.jpg', file_name: 'TEST-N photo cycle3b.jpg', containing_folder: 'cycle-3', date: '2026-03-05', meter_number: 'TEST-N', unit_label: 'TEST-N', reference_meter_number: 'TEST-N', reference_match_kind: 'exact' }
    ];
    const identities = {
      'm-prior1.jpg': makeIdentity('SN-MMM111', 0.9),
      'm-prior2.jpg': makeIdentity('SN-MMM111', 0.9),
      'n-prior1.jpg': makeIdentity('SN-NNN222', 0.9),
      'n-prior2.jpg': makeIdentity('SN-NNN222', 0.9),
      'n-this-cycle-correct.jpg': makeIdentity('SN-NNN222', 0.9),
      'n-this-cycle-mislabeled.jpg': makeIdentity('SN-MMM111', 0.92)
    };
    scenarios.push({
      name: 'duplicate-label-in-batch-resolved-to-neighboring-meter',
      images,
      identities,
      expect: {
        'n-this-cycle-correct.jpg': 'pass',
        'n-this-cycle-mislabeled.jpg': 'propose-correction'
      },
      expectFlags: {
        'n-this-cycle-correct.jpg': ['duplicate-label-in-batch', 'duplicate-label-confirmed-correct'],
        'n-this-cycle-mislabeled.jpg': ['duplicate-label-in-batch']
      }
    });
  }

  // 9) Item 2: a leading "#" must not stop two photos typed as "#21" and
  // plain "21" in the same batch from being recognized as the same label.
  {
    const images = [
      { image_path: 'p-hash.jpg', file_name: 'TEST-P photo hash.jpg', containing_folder: 'cycle-9', date: '2026-09-01', meter_number: '#21', unit_label: '#21', reference_meter_number: 'TEST-P', reference_match_kind: 'exact' },
      { image_path: 'p-plain.jpg', file_name: 'TEST-P photo plain.jpg', containing_folder: 'cycle-9', date: '2026-09-01', meter_number: '21', unit_label: '21', reference_meter_number: 'TEST-P', reference_match_kind: 'exact' }
    ];
    const identities = { 'p-hash.jpg': makeIdentity('SN-PPP999', 0.9), 'p-plain.jpg': makeIdentity('SN-QQQ000', 0.9) };
    scenarios.push({
      name: 'label-normalization-strips-leading-hash-for-duplicate-detection',
      images,
      identities,
      expect: { 'p-hash.jpg': 'duplicate-label-needs-review', 'p-plain.jpg': 'duplicate-label-needs-review' },
      expectFlags: { 'p-hash.jpg': ['duplicate-label-in-batch'], 'p-plain.jpg': ['duplicate-label-in-batch'] }
    });
  }

  // 10) Item 3: four bulk-electricity photos typed with inconsistent generic
  // labels ("BULK ELECTRICITY READING" x2, one with an app-auto-appended
  // " (2)" dedupe suffix, plus "ELECTRICITY BULK READING") should be told
  // apart by the on-screen unit-of-measure text / register code, not left as
  // indistinguishable "duplicates".
  {
    const images = [
      { image_path: 'bulk-kwh.jpg', file_name: 'BULK ELECTRICITY READING.jpg', containing_folder: 'cycle-bulk', date: '2026-09-01', meter_number: 'BULK ELECTRICITY READING', unit_label: 'BULK ELECTRICITY READING', reference_meter_number: 'BULK 1', reference_match_kind: 'exact' },
      { image_path: 'bulk-kvarh.jpg', file_name: 'BULK ELECTRICITY READING (2).jpg', containing_folder: 'cycle-bulk', date: '2026-09-01', meter_number: 'BULK ELECTRICITY READING (2)', unit_label: 'BULK ELECTRICITY READING', reference_meter_number: 'BULK 1', reference_match_kind: 'exact' },
      { image_path: 'bulk-kva.jpg', file_name: 'ELECTRICITY BULK READING.jpg', containing_folder: 'cycle-bulk', date: '2026-09-01', meter_number: 'ELECTRICITY BULK READING', unit_label: 'ELECTRICITY BULK READING', reference_meter_number: 'BULK 1', reference_match_kind: 'exact' }
    ];
    const identities = {
      'bulk-kwh.jpg': makeIdentity('SN-BULK1', 0.9, { on_screen_unit_text: 'kWh', on_screen_unit_text_confidence: 0.8, on_screen_register_code: '1.8.0', on_screen_register_code_confidence: 0.8 }),
      'bulk-kvarh.jpg': makeIdentity('SN-BULK1', 0.9, { on_screen_unit_text: 'kvarh', on_screen_unit_text_confidence: 0.75, on_screen_register_code: '3.8.0', on_screen_register_code_confidence: 0.75 }),
      'bulk-kva.jpg': makeIdentity('SN-BULK1', 0.9, { on_screen_unit_text: 'kVA', on_screen_unit_text_confidence: 0.7, on_screen_register_code: '6.1.0', on_screen_register_code_confidence: 0.7 })
    };
    scenarios.push({
      name: 'bulk-multi-register-labels-distinguished-by-on-screen-text',
      images,
      identities,
      expectFlags: {
        'bulk-kwh.jpg': ['bulk-register-identified-from-on-screen-text', 'bulk-label-group-registers-distinct-as-expected'],
        'bulk-kvarh.jpg': ['bulk-register-identified-from-on-screen-text', 'bulk-label-group-registers-distinct-as-expected'],
        'bulk-kva.jpg': ['bulk-register-identified-from-on-screen-text', 'bulk-label-group-registers-distinct-as-expected']
      }
    });
  }

  // 11) Item 5: a meter that moved normally every prior cycle and then shows
  // an identical reading for the first time should be flagged.
  {
    const images = [
      { image_path: 'zd1.jpg', file_name: 'TEST-Z photo 1.jpg', containing_folder: 'cycle-1', date: '2026-01-05', meter_number: 'TEST-Z', unit_label: 'TEST-Z', reference_meter_number: 'TEST-Z', reference_match_kind: 'exact', meter_reading: '100' },
      { image_path: 'zd2.jpg', file_name: 'TEST-Z photo 2.jpg', containing_folder: 'cycle-2', date: '2026-02-05', meter_number: 'TEST-Z', unit_label: 'TEST-Z', reference_meter_number: 'TEST-Z', reference_match_kind: 'exact', meter_reading: '150' },
      { image_path: 'zd3.jpg', file_name: 'TEST-Z photo 3.jpg', containing_folder: 'cycle-3', date: '2026-03-05', meter_number: 'TEST-Z', unit_label: 'TEST-Z', reference_meter_number: 'TEST-Z', reference_match_kind: 'exact', meter_reading: '200' },
      { image_path: 'zd4.jpg', file_name: 'TEST-Z photo 4.jpg', containing_folder: 'cycle-4', date: '2026-04-05', meter_number: 'TEST-Z', unit_label: 'TEST-Z', reference_meter_number: 'TEST-Z', reference_match_kind: 'exact', meter_reading: '200' }
    ];
    const identities = {
      'zd1.jpg': makeIdentity('SN-ZZZ001', 0.9),
      'zd2.jpg': makeIdentity('SN-ZZZ001', 0.9),
      'zd3.jpg': makeIdentity('SN-ZZZ001', 0.9),
      'zd4.jpg': makeIdentity('SN-ZZZ001', 0.9)
    };
    scenarios.push({
      name: 'sudden-first-time-zero-delta-flagged',
      images,
      identities,
      expectFlags: { 'zd4.jpg': ['zero-delta-first-time-needs-review'] }
    });
  }

  // 12) Item 5: a meter that has already been flat for several cycles
  // repeating the same reading again should NOT be flagged.
  {
    const images = [
      { image_path: 'zf1.jpg', file_name: 'TEST-Y photo 1.jpg', containing_folder: 'cycle-1', date: '2026-01-05', meter_number: 'TEST-Y', unit_label: 'TEST-Y', reference_meter_number: 'TEST-Y', reference_match_kind: 'exact', meter_reading: '50' },
      { image_path: 'zf2.jpg', file_name: 'TEST-Y photo 2.jpg', containing_folder: 'cycle-2', date: '2026-02-05', meter_number: 'TEST-Y', unit_label: 'TEST-Y', reference_meter_number: 'TEST-Y', reference_match_kind: 'exact', meter_reading: '50' },
      { image_path: 'zf3.jpg', file_name: 'TEST-Y photo 3.jpg', containing_folder: 'cycle-3', date: '2026-03-05', meter_number: 'TEST-Y', unit_label: 'TEST-Y', reference_meter_number: 'TEST-Y', reference_match_kind: 'exact', meter_reading: '50' },
      { image_path: 'zf4.jpg', file_name: 'TEST-Y photo 4.jpg', containing_folder: 'cycle-4', date: '2026-04-05', meter_number: 'TEST-Y', unit_label: 'TEST-Y', reference_meter_number: 'TEST-Y', reference_match_kind: 'exact', meter_reading: '50' }
    ];
    const identities = {
      'zf1.jpg': makeIdentity('SN-YYY001', 0.9),
      'zf2.jpg': makeIdentity('SN-YYY001', 0.9),
      'zf3.jpg': makeIdentity('SN-YYY001', 0.9),
      'zf4.jpg': makeIdentity('SN-YYY001', 0.9)
    };
    scenarios.push({
      name: 'repeat-zero-delta-after-already-flat-history-not-flagged',
      images,
      identities,
      expectFlags: { 'zf4.jpg': ['zero-delta-consistent-with-recent-history'] }
    });
  }

  let failures = 0;
  for (const scenario of scenarios) {
    const { results } = computeMeterLabelConsistency(scenario.images, scenario.identities);
    const byPath = Object.fromEntries(results.map((r) => [r.image_path, r]));
    let scenarioOk = true;
    for (const [imagePath, expectedDecision] of Object.entries(scenario.expect || {})) {
      const actual = byPath[imagePath]?.decision;
      if (actual !== expectedDecision) {
        scenarioOk = false;
        console.error(`FAIL  ${scenario.name}: ${imagePath} expected decision "${expectedDecision}", got "${actual}"`);
      }
    }
    for (const [imagePath, expectedFlags] of Object.entries(scenario.expectFlags || {})) {
      const actualFlags = byPath[imagePath]?.flags || [];
      for (const flag of expectedFlags) {
        if (!actualFlags.includes(flag)) {
          scenarioOk = false;
          console.error(`FAIL  ${scenario.name}: ${imagePath} expected flag "${flag}", got [${actualFlags.join(', ')}]`);
        }
      }
    }
    if (scenarioOk) {
      console.log(`PASS  ${scenario.name}`);
    } else {
      failures += 1;
    }
  }

  if (failures) {
    console.error(`\nSelf-test failed: ${failures}/${scenarios.length} scenario(s) did not match expectations.`);
    process.exitCode = 1;
  } else {
    console.log(`\nSelf-test passed: ${scenarios.length}/${scenarios.length} scenarios matched expectations.`);
    console.log('(These are synthetic fixtures used only to validate the decision logic - not real building data.)');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  // Parse once, cheaply, just to check for --self-test before touching env/dotenv at all.
  const selfTestOnly = process.argv.includes('--self-test');
  if (selfTestOnly) {
    runSelfTest();
    return;
  }

  await loadEnvFiles();
  const options = parseArgs(process.argv, getEnvDefaults());

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing GEMINI_API_KEY (or GOOGLE_API_KEY). Add it to .env.local in the workspace root. ' +
      'Use --self-test to validate the decision logic offline without an API key.'
    );
  }

  const buildingDirs = resolveBuildingDirs(options.buildings);
  if (!buildingDirs.length) {
    throw new Error(
      `No building folders with an existing ${EXTRACTION_FILE_NAME} were found (or none matched --building). ` +
      'Run scripts/extract-building-image-data.py first.'
    );
  }

  console.log(`Meter label consistency check starting. Mode: ${options.apply ? 'APPLY (files will be renamed)' : 'DRY RUN (report only)'}`);
  console.log(`Buildings: ${buildingDirs.map((d) => path.basename(d)).join(', ')}`);
  console.log(`Model: ${options.model} | Fallbacks: ${options.fallbackModels.join(', ') || 'none'}`);

  const outcomes = [];
  for (const buildingDir of buildingDirs) {
    console.log(`\nProcessing ${path.basename(buildingDir)}...`);
    outcomes.push(await processBuilding(buildingDir, options, apiKey));
  }

  console.log('\nMeter label consistency check complete.');
  for (const outcome of outcomes) {
    const s = outcome.summary;
    console.log(
      `- ${outcome.buildingName}: ${s.images_checked} checked, ` +
      `${s.decisions.pass || 0} pass, ` +
      `${s.corrections_proposed} correction(s) proposed, ` +
      `${s.orphan_labels_suggested} orphan label(s) suggested, ` +
      `${s.decisions['ambiguous-identity-match'] || 0} ambiguous, ` +
      `${s.decisions['not-legible'] || 0} not legible, ` +
      `${s.applied_count} applied.`
    );
    console.log(`  Report: ${outcome.reportPath}`);
  }

  if (options.apply && outcomes.some((o) => o.summary.applied_count > 0)) {
    console.log('\nFiles were renamed. Re-run scripts/extract-building-image-data.py for the affected building(s) to refresh meter-image-extractions.json.');
  }
}

main().catch((error) => {
  console.error('Meter label consistency check failed:', error.message);
  process.exitCode = 1;
});
