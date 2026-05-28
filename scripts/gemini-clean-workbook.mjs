import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Load local env first, then fallback env.
dotenv.config({ path: path.join(ROOT, '.env.local') });
dotenv.config({ path: path.join(ROOT, '.env') });

const DEFAULT_INPUT = path.join(ROOT, 'legacy-ud', 'ud extraction and data check.xlsx');
const DEFAULT_DATA_SHEET = 'Sheet1';
const DEFAULT_NOTES_SHEET = 'Workbook Notes';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEFAULT_CHUNK_SIZE = Number(process.env.GEMINI_CHUNK_SIZE || 35);
const DEFAULT_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-flash-lite,gemini-1.5-flash')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const DEFAULT_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES || 3);
const DEFAULT_RETRY_BASE_MS = Number(process.env.GEMINI_RETRY_BASE_MS || 1800);
const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 120000);
const OUTPUT_DIR = path.join(ROOT, 'source-documents', '03-extracted-outputs', 'gemini-cleaning');

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    dataSheet: DEFAULT_DATA_SHEET,
    notesSheet: DEFAULT_NOTES_SHEET,
    model: DEFAULT_MODEL,
    chunkSize: Number.isFinite(DEFAULT_CHUNK_SIZE) && DEFAULT_CHUNK_SIZE > 0 ? DEFAULT_CHUNK_SIZE : 35,
    fallbackModels: DEFAULT_FALLBACK_MODELS,
    maxRetries: Number.isFinite(DEFAULT_MAX_RETRIES) && DEFAULT_MAX_RETRIES >= 0 ? DEFAULT_MAX_RETRIES : 3,
    retryBaseMs: Number.isFinite(DEFAULT_RETRY_BASE_MS) && DEFAULT_RETRY_BASE_MS > 0 ? DEFAULT_RETRY_BASE_MS : 1800,
    requestTimeoutMs: Number.isFinite(DEFAULT_REQUEST_TIMEOUT_MS) && DEFAULT_REQUEST_TIMEOUT_MS > 0
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : 120000
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input' && argv[i + 1]) {
      options.input = path.resolve(argv[i + 1]);
      i += 1;
    } else if (token === '--sheet' && argv[i + 1]) {
      options.dataSheet = argv[i + 1];
      i += 1;
    } else if (token === '--notes-sheet' && argv[i + 1]) {
      options.notesSheet = argv[i + 1];
      i += 1;
    } else if (token === '--model' && argv[i + 1]) {
      options.model = argv[i + 1];
      i += 1;
    } else if (token === '--chunk-size' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.chunkSize = parsed;
      }
      i += 1;
    } else if (token === '--fallback-models' && argv[i + 1]) {
      options.fallbackModels = String(argv[i + 1])
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
      i += 1;
    } else if (token === '--max-retries' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        options.maxRetries = parsed;
      }
      i += 1;
    } else if (token === '--retry-base-ms' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.retryBaseMs = parsed;
      }
      i += 1;
    } else if (token === '--request-timeout-ms' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.requestTimeoutMs = parsed;
      }
      i += 1;
    }
  }

  return options;
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function parseDataSheet(ws) {
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!matrix.length) {
    return [];
  }

  const rows = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const row = matrix[i] || [];
    const building = row[0];
    const meterLabel = row[1];
    const serialNumber = row[2];
    const readingRaw = row[3];
    const note = row[4];

    if ([building, meterLabel, serialNumber, readingRaw, note].every(isBlank)) {
      continue;
    }

    rows.push({
      row_index: i + 1,
      building: building == null ? '' : String(building).trim(),
      meter_label: meterLabel == null ? '' : String(meterLabel).trim(),
      serial_number: serialNumber == null ? '' : String(serialNumber).trim(),
      reading_raw: readingRaw,
      notes: note == null ? '' : String(note).trim()
    });
  }

  return rows;
}

function parseNotesSheet(ws) {
  if (!ws) {
    return [];
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const lines = [];

  for (let i = 0; i < matrix.length; i += 1) {
    const first = matrix[i]?.[0];
    if (!isBlank(first)) {
      lines.push(String(first).trim());
    }
  }

  return lines;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildPrompt(chunk, workbookNotes) {
  const noteBlock = workbookNotes.length
    ? workbookNotes.map((line, idx) => `${idx + 1}. ${line}`).join('\n')
    : 'No workbook-level notes were provided.';

  return [
    'You are cleaning meter capture workbook rows for an electricity meter app.',
    'Return JSON only. No markdown fences. No explanations outside JSON.',
    'Use workbook notes as policy context.',
    '',
    'Workbook notes:',
    noteBlock,
    '',
    'For each input row, return one output object with these keys exactly:',
    'row_index, building_clean, meter_label_clean, serial_number_clean, reading_value_clean, reading_date_clean, capture_policy, skip_reason, confidence, rationale',
    '',
    'Rules:',
    '- Keep row_index unchanged.',
    '- capture_policy must be one of: capture_required, skip_allowed, client_submitted, unknown',
    '- reading_value_clean must be a number or null.',
    '- reading_date_clean must be YYYY-MM-DD or null. If date is absent, infer from workbook notes only when explicit and safe.',
    '- confidence is 0.0 to 1.0.',
    '- rationale is concise.',
    '- If a row is intentionally blank/no reading, use capture_policy=skip_allowed and explain in skip_reason.',
    '',
    'Input rows JSON:',
    JSON.stringify(chunk, null, 2),
    '',
    'Return JSON object with this shape:',
    '{"records":[...]}',
    ''
  ].join('\n');
}

function extractTextFromGeminiResponse(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
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

function toNumberOrNull(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizePolicy(value) {
  const allowed = new Set(['capture_required', 'skip_allowed', 'client_submitted', 'unknown']);
  const policy = String(value || '').trim().toLowerCase();
  return allowed.has(policy) ? policy : 'unknown';
}

function sanitizeModelRecord(modelRecord, sourceRow) {
  const confidence = Number(modelRecord?.confidence);
  const cleanConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0;

  return {
    row_index: sourceRow.row_index,
    source_row: sourceRow,
    building_clean: String(modelRecord?.building_clean || sourceRow.building || '').trim(),
    meter_label_clean: String(modelRecord?.meter_label_clean || sourceRow.meter_label || '').trim(),
    serial_number_clean: String(modelRecord?.serial_number_clean || sourceRow.serial_number || '').trim(),
    reading_value_clean: toNumberOrNull(modelRecord?.reading_value_clean),
    reading_date_clean: normalizeDate(modelRecord?.reading_date_clean),
    capture_policy: normalizePolicy(modelRecord?.capture_policy),
    skip_reason: String(modelRecord?.skip_reason || '').trim(),
    confidence: cleanConfidence,
    rationale: String(modelRecord?.rationale || '').trim()
  };
}

function classifyRecord(record) {
  const issues = [];

  if (!record.building_clean) {
    issues.push('missing-building');
  }

  if (!record.meter_label_clean) {
    issues.push('missing-meter-label');
  }

  if (record.capture_policy === 'unknown') {
    issues.push('unknown-policy');
  }

  if (record.capture_policy === 'skip_allowed' && !record.skip_reason) {
    issues.push('missing-skip-reason');
  }

  if (record.confidence < 0.75) {
    issues.push('low-confidence');
  }

  if (!record.rationale) {
    issues.push('missing-rationale');
  }

  return {
    issues,
    status: issues.length ? 'review' : 'accepted'
  };
}

async function callGemini({ apiKey, model, prompt, requestTimeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (error) {
    const timeoutError = new Error(`Gemini request timed out after ${requestTimeoutMs}ms`);
    timeoutError.status = 408;
    timeoutError.code = 'TIMEOUT';
    timeoutError.cause = error;
    throw timeoutError;
  }

  const responseJson = await response.json();
  if (!response.ok) {
    const message = responseJson?.error?.message || `Gemini API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = responseJson?.error?.status || responseJson?.error?.code || null;
    error.details = responseJson?.error?.details || null;
    throw error;
  }

  return responseJson;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableGeminiError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || 0);

  if ([429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  if (code === 'RESOURCE_EXHAUSTED' || code === 'UNAVAILABLE' || code === 'DEADLINE_EXCEEDED') {
    return true;
  }

  if (message.includes('high demand') || message.includes('resource exhausted') || message.includes('temporarily unavailable') || message.includes('try again later')) {
    return true;
  }

  return false;
}

async function callGeminiResilient({ apiKey, primaryModel, fallbackModels, prompt, maxRetries, retryBaseMs, requestTimeoutMs }) {
  const candidates = [primaryModel, ...fallbackModels.filter((model) => model !== primaryModel)];
  const attemptsPerModel = Math.max(1, Number(maxRetries) + 1);
  const failures = [];

  for (const model of candidates) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
      try {
        const response = await callGemini({ apiKey, model, prompt, requestTimeoutMs });
        return {
          response,
          modelUsed: model,
          attempt
        };
      } catch (error) {
        failures.push({
          model,
          attempt,
          message: error.message,
          status: error.status || null,
          code: error.code || null
        });

        const canRetry = isRetriableGeminiError(error) && attempt < attemptsPerModel;
        if (!canRetry) {
          break;
        }

        const jitter = Math.floor(Math.random() * 700);
        const delay = (retryBaseMs * Math.pow(2, attempt - 1)) + jitter;
        console.warn(`Gemini transient error on ${model} (attempt ${attempt}/${attemptsPerModel}): ${error.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  const summary = failures.map((failure) => `${failure.model}#${failure.attempt}: ${failure.message}`).join(' | ');
  throw new Error(`All Gemini model attempts failed. ${summary}`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workbook';
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY (or GOOGLE_API_KEY). Add it to .env.local in the workspace root.');
  }

  if (!fs.existsSync(args.input)) {
    throw new Error(`Workbook not found: ${args.input}`);
  }

  const workbook = XLSX.readFile(args.input, { cellDates: true });
  const dataSheet = workbook.Sheets[args.dataSheet];
  if (!dataSheet) {
    throw new Error(`Data sheet not found: ${args.dataSheet}`);
  }

  const notesSheet = workbook.Sheets[args.notesSheet];
  const workbookNotes = parseNotesSheet(notesSheet);
  const rows = parseDataSheet(dataSheet);

  if (!rows.length) {
    throw new Error('No usable rows found in workbook data sheet.');
  }

  const chunks = chunkArray(rows, args.chunkSize);
  const accepted = [];
  const review = [];
  const rejected = [];
  const rawResponses = [];

  console.log(`Starting Gemini workbook cleaning with ${rows.length} rows across ${chunks.length} chunks (size ${args.chunkSize}).`);
  console.log(`Primary model: ${args.model} | Fallbacks: ${args.fallbackModels.join(', ') || 'none'} | Timeout: ${args.requestTimeoutMs}ms`);

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const prompt = buildPrompt(chunk, workbookNotes);
    const beforeAccepted = accepted.length;
    const beforeReview = review.length;
    const beforeRejected = rejected.length;
    const firstRow = chunk[0]?.row_index;
    const lastRow = chunk[chunk.length - 1]?.row_index;

    console.log(`Processing chunk ${i + 1}/${chunks.length} (rows ${firstRow}-${lastRow})...`);

    const geminiCall = await callGeminiResilient({
      apiKey,
      primaryModel: args.model,
      fallbackModels: args.fallbackModels,
      prompt,
      maxRetries: args.maxRetries,
      retryBaseMs: args.retryBaseMs,
      requestTimeoutMs: args.requestTimeoutMs
    });
    const responseJson = geminiCall.response;

    const rawText = extractTextFromGeminiResponse(responseJson);
    rawResponses.push({
      chunk_index: i,
      row_count: chunk.length,
      model_used: geminiCall.modelUsed,
      model_attempt: geminiCall.attempt,
      response: responseJson,
      text: rawText
    });

    let parsed;
    try {
      parsed = parseModelJson(rawText);
    } catch (error) {
      chunk.forEach((sourceRow) => {
        rejected.push({
          row_index: sourceRow.row_index,
          source_row: sourceRow,
          error: `Invalid model JSON for chunk ${i}: ${error.message}`
        });
      });
      continue;
    }

    const modelRecords = Array.isArray(parsed?.records) ? parsed.records : [];
    const byRow = new Map();
    modelRecords.forEach((record) => {
      const key = Number(record?.row_index);
      if (Number.isFinite(key)) {
        byRow.set(key, record);
      }
    });

    chunk.forEach((sourceRow) => {
      const modelRecord = byRow.get(sourceRow.row_index);
      if (!modelRecord) {
        review.push({
          ...sanitizeModelRecord({}, sourceRow),
          review_issues: ['model-missing-row']
        });
        return;
      }

      const cleanRecord = sanitizeModelRecord(modelRecord, sourceRow);
      const classification = classifyRecord(cleanRecord);

      if (classification.status === 'accepted') {
        accepted.push(cleanRecord);
      } else {
        review.push({
          ...cleanRecord,
          review_issues: classification.issues
        });
      }
    });

    const chunkAccepted = accepted.length - beforeAccepted;
    const chunkReview = review.length - beforeReview;
    const chunkRejected = rejected.length - beforeRejected;
    console.log(`Chunk ${i + 1}/${chunks.length} done via ${geminiCall.modelUsed} (attempt ${geminiCall.attempt}): +${chunkAccepted} accepted, +${chunkReview} review, +${chunkRejected} rejected.`);
  }

  ensureDir(OUTPUT_DIR);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workbookSlug = slugify(path.basename(args.input, path.extname(args.input)));

  const summary = {
    generated_at: new Date().toISOString(),
    input_file: args.input,
    model: args.model,
    fallback_models: args.fallbackModels,
    max_retries: args.maxRetries,
    retry_base_ms: args.retryBaseMs,
    request_timeout_ms: args.requestTimeoutMs,
    data_sheet: args.dataSheet,
    notes_sheet: args.notesSheet,
    chunk_size: args.chunkSize,
    total_rows: rows.length,
    accepted_count: accepted.length,
    review_count: review.length,
    rejected_count: rejected.length,
    output_dir: OUTPUT_DIR
  };

  const normalizedPayload = {
    summary,
    workbook_notes: workbookNotes,
    accepted,
    review,
    rejected
  };

  const summaryPath = path.join(OUTPUT_DIR, `${workbookSlug}-summary-${stamp}.json`);
  const normalizedPath = path.join(OUTPUT_DIR, `${workbookSlug}-normalized-${stamp}.json`);
  const reviewPath = path.join(OUTPUT_DIR, `${workbookSlug}-review-${stamp}.json`);
  const rawPath = path.join(OUTPUT_DIR, `${workbookSlug}-raw-responses-${stamp}.json`);

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(normalizedPath, JSON.stringify(normalizedPayload, null, 2));
  fs.writeFileSync(reviewPath, JSON.stringify({ review, rejected }, null, 2));
  fs.writeFileSync(rawPath, JSON.stringify(rawResponses, null, 2));

  // Also write latest snapshots for easier downstream scripts.
  fs.writeFileSync(path.join(OUTPUT_DIR, `${workbookSlug}-summary-latest.json`), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, `${workbookSlug}-normalized-latest.json`), JSON.stringify(normalizedPayload, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, `${workbookSlug}-review-latest.json`), JSON.stringify({ review, rejected }, null, 2));

  console.log('Gemini workbook cleaning pipeline completed.');
  console.log(`Input rows      : ${rows.length}`);
  console.log(`Accepted        : ${accepted.length}`);
  console.log(`Needs review    : ${review.length}`);
  console.log(`Rejected        : ${rejected.length}`);
  console.log(`Summary file    : ${summaryPath}`);
  console.log(`Normalized file : ${normalizedPath}`);
  console.log(`Review file     : ${reviewPath}`);
  console.log(`Raw responses   : ${rawPath}`);
}

main().catch((error) => {
  console.error('Gemini workbook cleaning pipeline failed:', error.message);
  process.exitCode = 1;
});
