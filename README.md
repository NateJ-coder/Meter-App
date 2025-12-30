# Fuzio Electricity Readings App (Bulk + Submeters)

A lightweight, audit-friendly web app to standardise monthly electricity meter readings for sectional title schemes using a **bulk supply meter** plus **unit submeters**.  
It replaces "WhatsApp + spreadsheets + site runs" with a clean workflow: **meter register → reading cycle → photo-verified capture → automated validation/flagging → admin review → export for billing + trustee reporting**.

This repo starts as a **no-backend skeleton** (HTML + CSS + vanilla JS + localStorage) so we can prove the workflow fast, then harden it into a production system.

---

## Why this exists

Most schemes don't have automated meter telemetry. The pain is operational, not theoretical:

- Staff drive to buildings to read meters (time + cost + access issues).
- Admin captures numbers manually into spreadsheets (errors happen).
- Owners dispute charges; trustees want proof; staff waste time rechecking.
- There's no consistent audit trail (who read what, when, with what evidence).

This app solves the real problem: **accurate capture and allocation with evidence, exceptions, and exports**.

---

## Primary users (roles)

### 1) On-site Reader (Caretaker / Security / Trustee / Nominee)
- Captures unit meter readings each month (mobile-friendly).
- Takes a **photo of the meter face** for proof.
- Adds notes for access issues / broken meters / anomalies.

### 2) Admin (Fuzio – e.g., Zerilda)
- Manages meter registers and reading cycles.
- Reviews exceptions/flags.
- Marks readings as Approved / Estimated / Needs Site Visit.
- Exports billing inputs and trustee summaries.

### 3) Trustee (Body Corporate oversight)
- Views monthly scheme summary (usage, common area consumption, losses, anomalies).
- Uses reports for AGM packs / governance / queries.

> In later phases: Portfolio Manager view, Auditor pack exports, and optional owner-facing statements.

---

## How the monthly workflow runs (end-to-end)

### Step 0 — Meter Register (once-off + maintenance)
- Capture a scheme's structure: Scheme → Buildings → Units.
- Register meters:
  - **BULK** meter (supply point for scheme)
  - **UNIT** meters (per unit submeter)
  - Optional **COMMON** meter(s) (if separately measured)

Each meter stores:
- meter_number / meter_id
- meter_type (BULK | UNIT | COMMON)
- unit linkage (for UNIT meters)
- last reading, status (active/faulty/inaccessible), notes, photos

### Step 1 — Open a Reading Cycle (monthly)
Admin opens a cycle:
- Scheme
- Start date / end date
- Status: **OPEN**

This creates the "work order" for the month.

### Step 2 — Capture Readings (on-site, mobile-friendly)
For each UNIT meter:
- reading value
- reading date/time
- meter photo
- notes (optional)

### Step 3 — Auto-calc + Auto-flag
The app calculates consumption and flags problems:
- `unit_kWh = current_reading - previous_reading`

Flags generated automatically:
- Backward reading (current < previous)
- Huge spike (e.g., > 3× average of last 3 cycles)
- Missing reading (no capture in cycle)
- Duplicate meter number (data hygiene issue)
- Optional: suspicious "exact same as last month" (if desired)

### Step 4 — Admin Review (exceptions first)
Admin views:
- "Meters not read"
- "Flagged readings"
- Filters by building/unit/flag type

Admin actions:
- **Approve** (valid)
- **Estimate** (use policy; note it for true-up next month)
- **Needs Site Visit** (Antonio / staff intervention required)
- Mark meter as **faulty** if needed (escalation workflow)

### Step 5 — Close Cycle (locks the month)
When ready:
- Status becomes **CLOSED**
- Data is locked for audit consistency
- Exports become the official "month pack"

### Step 6 — Export (billing + trustees)
Exports include:
- Per-unit consumption + flags + notes (CSV)
- Scheme-level summary CSV:
  - bulk_kWh
  - sum_units_kWh
  - common_kWh (bulk - sum units)
  - losses_percent

---

## How bulk + submeters are handled (the core math)

This app is built around the common "bulk + submeter" scheme model:

### Unit consumption
For each unit meter in a cycle:
- **unit_kWh** = `current_reading - previous_reading`

### Scheme totals
- **sum_units_kWh** = `Σ(unit_kWh)` across all unit meters captured/approved

### Bulk consumption
If the scheme bulk meter is captured for the same cycle:
- **bulk_kWh** = `bulk_current - bulk_previous`

### Common area + losses (reconciliation)
- **common_kWh** = `bulk_kWh - sum_units_kWh`

Depending on scheme layout, `common_kWh` typically represents:
- common property consumption (lights, gates, pumps, lift)
- electrical losses
- meter drift / timing differences
- missing/estimated reads

### Losses %
- **losses_%** = `(common_kWh / bulk_kWh) * 100` (when bulk_kWh > 0)

### When meters are missing / estimated
Reality happens. The app supports:
- **Missing**: meter not read → flagged
- **Estimated**: admin can estimate, mark it, and keep it visible for true-up
- **Faulty**: meter flagged faulty → escalated
- **Access issue**: meter marked inaccessible → "site visit required"

This is why the app includes an exception queue: **the workflow is designed for imperfect inputs**.

---

## Validation, audit trail & dispute-proofing

To reduce disputes and rework:
- **Photo per reading** (proof of captured value)
- Timestamped captures (when it was taken)
- Role-based actions (who approved/estimated)
- Cycle lock on close (prevents "silent edits")

Planned "Dispute Pack" export (Phase 2+):
- last 6 cycles of readings for a unit
- photos
- flag history
- calculation steps + notes
- admin actions audit trail

---

## What the skeleton includes today (this repo)

This repo is intentionally simple and fast to run:
- Plain HTML/CSS/vanilla JS UI (mobile-friendly)
- localStorage persistence (no backend yet)
- Meter register CRUD
- Open/close reading cycles
- Reading capture with photo placeholder field
- Validation + flagging rules
- Review queue (approve/estimate/site visit)
- CSV exports (unit-level + scheme summary)
- Seed demo data on first run (1 scheme, 1 building, 6 units, 1 bulk meter, 6 unit meters)

---

## Roadmap (realistic build plan)

### Phase 0 — Skeleton (1–2 days)
**Goal:** a working demo that shows the full workflow end-to-end.
- Meter register + reading cycle + capture + flags + review + export

### Phase 1 — Pilot in one live scheme (Week 1)
**Goal:** match the current spreadsheet workflow exactly, but faster and safer.
- Import/export mapping to current Zerilda sheet
- Field capture tested with on-site reader
- Exception handling policy agreed with trustees/admin

### Phase 2 — "Steam engine" (Weeks 2–4)
**Goal:** reduce disputes, reduce manual work, and make trustee reporting automatic.
- Full bulk reconciliation + losses reporting
- Better estimation rules + true-up logic
- Dispute pack generator
- Role permissions + audit trail
- Training + SOPs + rollout checklist

### Phase 3 — Scale across all schemes (Week 4–6+ depending on scope)
- Bulk import of meter registers
- Portfolio dashboards (multi-scheme)
- Integrations (accounting exports, vendor imports where applicable)

---

## Success metrics (what "working" means)

- 70–90% reduction in routine site visits (Antonio becomes exception-based auditor)
- >95% of meters captured on time each cycle
- Clear audit trail for disputes (photo + history + approval actions)
- Admin export time reduced from hours/days → minutes
- Trustees get consistent monthly reporting (common kWh, losses %, anomalies)

---

## Future integrations (optional, but planned)

- CSV templates tailored to finance/accounting system imports
- Notifications/reminders (email/WhatsApp) for on-site readers
- Vendor imports (prepaid platforms if ever needed)
- OCR support (meter photo → suggested reading)
- Backend + database + authentication (multi-user, role-based access)
- Offline-first mobile capture with background sync

---

## How to run this skeleton (localhost)

This is a pure client-side app — no backend, no database, no dependencies. Everything runs in your browser with localStorage.

### Option A: VS Code Live Server (recommended)
1. Open the project folder in VS Code
2. Install the "Live Server" extension (if not already installed)
3. Right-click `index.html` and select "Open with Live Server"
4. App opens at `http://127.0.0.1:5500/`

### Option B: Python HTTP server
```powershell
cd "c:\Projects\Meter App"
python -m http.server 5500
```
Then open `http://localhost:5500/` in your browser.

### Option C: Any other local server
Any static file server works. Just serve the root folder.

---

## Demo data

On first run, the app seeds demo data:
- **Scheme**: Fuzio Gardens
- **Building**: Block A
- **Units**: A101, A102, A103, A201, A202, A203
- **Meters**: 1 BULK meter + 6 UNIT meters (one per unit)

You can immediately:
1. View the meter register (`meters.html`)
2. Open a reading cycle (`reading-cycle.html`)
3. Capture readings for all 6 units
4. See auto-generated flags (try entering a backward reading!)
5. Review exceptions (`review.html`)
6. Export CSVs (`export.html`)

---

## File structure

```
Meter App/
├── index.html              # Dashboard (overview + quick links)
├── meters.html             # Meter register CRUD
├── reading-cycle.html      # Open/close cycle + capture readings
├── review.html             # Exceptions/flags review queue
├── export.html             # CSV download page
├── assets/
│   ├── styles.css          # Shared styling (mobile-friendly)
│   ├── app.js              # Shared helpers + nav
│   ├── storage.js          # localStorage data layer (CRUD)
│   ├── validation.js       # Validation + flag rules
│   ├── csv.js              # CSV export logic
│   └── router.js           # Simple client-side nav helpers
├── README.md               # This file
└── .gitignore              # Git ignore rules
```

---

## Notes for production hardening (Phase 2+)

When moving from skeleton → production:
- Replace localStorage with backend API + database (PostgreSQL recommended)
- Add authentication + role-based permissions
- Implement photo upload + storage (S3 / blob storage)
- Add proper form validation + error handling
- Lock closed cycles at database level
- Add audit trail table (who did what, when)
- Implement proper estimation policies + true-up logic
- Add notifications (email/SMS for on-site readers)
- Offline-first mobile PWA for field capture
- Export templates tailored to accounting system imports

---

## License

Proprietary — Fuzio Properties internal use only.

---

## Contact

For questions, escalations, or deployment support:  
**Fuzio Properties IT Team**
