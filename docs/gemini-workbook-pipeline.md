# Gemini Workbook Cleaning Pipeline

This pipeline reads a workbook, sends row chunks to Gemini 2.5 Flash for normalization, validates outputs, and writes reviewable JSON artifacts.

## 1) Put your API key in the local env file

File path:

`c:\\Projects\\Meter App\\.env.local`

Set:

- `GEMINI_API_KEY=YOUR_KEY_HERE`

Optional:

- `GEMINI_MODEL=gemini-2.5-flash-lite`
- `GEMINI_CHUNK_SIZE=60`
- `GEMINI_FALLBACK_MODELS=gemini-1.5-flash,gemini-2.5-flash`
- `GEMINI_MAX_RETRIES=6`
- `GEMINI_RETRY_BASE_MS=2500`
- `GEMINI_REQUEST_TIMEOUT_MS=120000`

## 2) Run the pipeline

Default workbook:

`npm run ai:clean-workbook`

Free-tier hardened profile (recommended first):

`npm run ai:clean-workbook:free`

High-quality profile (higher-end model):

`npm run ai:clean-workbook:pro`

High-availability profile (less capacity-limited):

`npm run ai:clean-workbook:capacity`

Custom workbook/sheet/model:

`node scripts/gemini-clean-workbook.mjs --input "legacy-ud/ud extraction and data check.xlsx" --sheet "Sheet1" --notes-sheet "Workbook Notes" --model "gemini-2.5-flash" --chunk-size 30`

Force fallback behavior from CLI:

`node scripts/gemini-clean-workbook.mjs --model "gemini-2.5-flash" --fallback-models "gemini-2.5-flash-lite,gemini-1.5-flash" --max-retries 4 --retry-base-ms 2000`

## 3) Output location

Artifacts are written to:

`source-documents/03-extracted-outputs/gemini-cleaning/`

Files include:

- `*-summary-*.json`
- `*-normalized-*.json`
- `*-review-*.json`
- `*-raw-responses-*.json`
- `*-latest.json` convenience snapshots

## Notes

- This is a cleaning and normalization stage only; it does not directly write app operational records.
- Keep low-confidence and policy-ambiguous rows in review before any import step.
- The script now auto-retries transient Gemini load/quota errors and can fail over to fallback models.

### Model selection guidance

- Use `gemini-2.5-pro` when you need better reasoning quality and can tolerate slower/less available capacity.
- Use `gemini-2.5-flash-lite` when you need throughput and stability under demand spikes.
- If you hit transient high-demand errors repeatedly, increase `--chunk-size` (fewer calls) and prefer the `:capacity` profile.
- Avoid very small chunks (for example `--chunk-size 5`) on free-tier usage; smaller chunks create many extra requests and increase rate-limit/high-demand failures.
- The script now prints chunk-by-chunk progress; if there is no chunk log after startup for more than the timeout window, treat it as a stuck call and retry.
