# Fuzio Electricity Readings App

**Bulk + Submeter Readings | Role-Separated | Audit-Friendly**

A lightweight, audit-friendly web app to standardise monthly electricity meter readings for sectional title schemes using a **bulk supply meter** plus **unit submeters**.

It replaces *"WhatsApp + spreadsheets + site runs"* with a clean, controlled workflow:

**Meter Register → Reading Cycle → On-Site Capture (QR) → Automated Validation → Admin Review → Export for Billing & Trustees**

This repo currently runs as a **no-backend skeleton** (HTML + CSS + vanilla JS + localStorage) to prove the workflow quickly. It is designed to harden cleanly into a production system.

---

## Why this exists

Most schemes do **not** have automated meter telemetry. The problem is operational:

* Staff drive to sites to read meters (time, access, cost).
* Admin captures readings manually into spreadsheets (errors happen).
* Owners dispute charges; trustees want proof.
* There is no consistent audit trail (who read what, when, and where).

This app solves the real problem:
**accurate capture + evidence + exception handling + clean exports.**

---

## Primary user roles (intentional separation)

This app is designed around **two distinct roles** with different responsibilities and access paths.

### 1. On-Site Meter Reader

*(Caretaker / Security / Trustee / Nominee)*

**Purpose:** Mechanical capture, not decision-making.

**Can do:**

* Access assigned meters via QR code
* Capture current reading
* Attach meter photo (proof)
* Add brief notes (access issues, faults)
* Submit reading

**Cannot do:**

* Manage schemes, meters, or units
* Open/close cycles
* Review or approve readings
* Export data
* See other buildings or schemes

> The reader's job is simple, fast, and mistake-resistant.

---

### 2. Admin (Fuzio Office – e.g. Zerilda)

**Purpose:** Control, validation, reconciliation, and reporting.

**Can do:**

* Manage meter registers (schemes, buildings, units, meters)
* Open and close reading cycles
* Review flagged and missing readings
* Approve, estimate, or escalate to site visit
* Reconcile bulk vs unit consumption
* Export billing and trustee reports

Admins work in **exceptions and outcomes**, not raw capture.

---

## QR-based Reader Access (Next Build Step)

To enforce role separation without training friction, the system introduces **QR-based entry for on-site readers**.

### Why QR codes?

* No usernames or passwords for field staff
* No navigation confusion
* Physical meter ↔ digital record linkage
* Scan → capture → done

---

### QR Code Structure

Each QR code encodes a direct link to a reader-only capture page:

```
/reader.html?scheme=SCHEME_ID&meter=METER_ID
```

Examples:

* Bulk meter QR (electrical room)
* Unit meter QR (inside meter cupboard)
* Laminated fallback QR per building

---

### Reader Page (`reader.html`) – Scope & Behaviour

This page is **not linked** in the main navigation.

**What it does:**

1. Reads `scheme_id` and `meter_id` from the URL
2. Checks if there is an **OPEN reading cycle**
3. Loads meter details (read-only)
4. Displays:

   * Last reading
   * Capture form
   * Photo upload field
   * Notes
5. Submits reading into the active cycle

**If no open cycle exists:**

> "No open reading cycle. Please contact the managing agent."

No menus. No dashboards. No admin controls.

---

## Monthly Workflow (End-to-End)

### Step 0 — Meter Register (Admin)

Once-off and maintained as needed.

* Scheme → Buildings → Units
* Register meters:

  * **BULK** (main supply)
  * **UNIT** (per-unit submeter)
  * Optional **COMMON** meters

Each meter stores:

* Meter number
* Meter type
* Linked unit (if applicable)
* Last reading
* Status (active / faulty / inaccessible)
* Notes

---

### Step 1 — Open Reading Cycle (Admin)

Admin opens a cycle:

* Scheme
* Start date / end date
* Status = **OPEN**

This creates the official monthly work order.

---

### Step 2 — Capture Readings (On-Site via QR)

On-site reader:

* Scans QR code
* Enters reading
* Takes photo
* Adds notes
* Submits

Readings are timestamped and linked to the meter and cycle.

---

### Step 3 — Auto-Calculation & Auto-Flagging

The system calculates:

```
consumption = current_reading − previous_reading
```

Automatic flags:

* Backward reading
* Huge spike vs last 3 cycles
* Zero / unchanged consumption
* Missing meters

No admin judgement required at capture time.

---

### Step 4 — Admin Review (Exceptions First)

Admin reviews:

* Flagged readings
* Missing readings

Admin actions:

* **Approve** (valid)
* **Estimate** (policy-based, marked for true-up)
* **Needs Site Visit**
* Mark meter faulty/inaccessible if required

---

### Step 5 — Close Cycle (Admin)

Once satisfied:

* Cycle status → **CLOSED**
* Data is locked
* Exports become official audit records

---

### Step 6 — Export (Billing + Trustees)

Exports include:

* **Unit Readings CSV**

  * Per-unit consumption
  * Flags
  * Notes
* **Scheme Summary CSV**

  * Bulk kWh
  * Sum of unit kWh
  * Common area kWh
  * Losses %

---

## Bulk + Submeter Reconciliation (Core Logic)

* `unit_kWh = current − previous`
* `sum_units_kWh = Σ(unit_kWh)`
* `bulk_kWh = bulk_current − bulk_previous`
* `common_kWh = bulk_kWh − sum_units_kWh`
* `losses_% = (common_kWh / bulk_kWh) × 100`

Common kWh represents:

* Common property consumption
* Electrical losses
* Meter drift
* Missing / estimated reads

---

## Validation, Audit Trail & Dispute-Proofing

* Photo per reading (proof)
* Timestamped capture
* Cycle locking
* Flag history
* Admin review actions stored

**Planned Dispute Pack (Phase 2):**

* Last 6 readings + photos
* Tariff source
* Calculation steps
* Admin actions log

---

## Current Skeleton Includes

* HTML/CSS/vanilla JS UI
* localStorage persistence
* Meter register CRUD
* Reading cycle open/close
* Reading capture
* Validation & flags
* Admin review queue
* CSV exports
* Seed demo data

---

## Immediate Next Build Steps

**Phase 0.5 — Role Separation**

* Add `reader.html`
* Implement QR-based entry
* Restrict reader to capture-only flow

**Phase 1 — Pilot Scheme**

* Test with one live building
* Validate on-site capture
* Align admin review workflow

---

## How to Run (Localhost)

### VS Code Live Server (recommended)

1. Open project folder
2. Right-click `index.html`
3. Open with Live Server

### Python HTTP Server

```bash
python -m http.server 5500
```

---

## Getting Started (First Time Setup)

1. **Open the app** - Navigate to `index.html` in your browser
2. **Go to Meter Register** - Click "Meter Register" in the navigation
3. **Create your first scheme:**
   - Click "+ Add Scheme"
   - Enter scheme name (e.g., "Sunset Gardens")
   - Enter address
   - Click "Save Scheme"
4. **Add a building:**
   - Switch to "Buildings" tab
   - Click "+ Add Building"
   - Select your scheme
   - Enter building name (e.g., "Block A")
   - Click "Save Building"
5. **Add units:**
   - Switch to "Units" tab
   - Click "+ Add Unit" for each unit
   - Select building
   - Enter unit number (e.g., "A101")
   - Optionally add owner name
6. **Add meters:**
   - Switch to "Meters" tab
   - Add a **BULK** meter for the scheme
   - Add **UNIT** meters for each unit
   - Enter meter numbers and last readings
7. **Generate QR codes:**
   - Go to "QR Codes" page
   - Select each meter
   - Download/print QR codes
   - Attach near physical meters

**Note:** The app starts empty - no seed data. This ensures you can test with your real schemes without confusion.

To clear all data and start over: Use the "Clear All Data" button on the dashboard.

---

## File Structure (Current)

```
/index.html            # Admin dashboard
/meters.html           # Meter register
/reading-cycle.html    # Cycle management & capture (admin)
/review.html           # Exception review
/export.html           # CSV exports
/reader.html           # QR-based on-site capture (next step)
assets/
  app.js
  storage.js
  validation.js
  csv.js
  router.js
  styles.css
```

---

## License

Proprietary — Fuzio Properties internal use only.

---

If you paste this in, the **code now has a clear north star**.
Next, we turn this into `reader.html` without disturbing anything else.
