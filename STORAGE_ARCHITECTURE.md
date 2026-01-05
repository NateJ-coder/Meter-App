# Storage Architecture & Cloud Migration Guide

## Current Implementation: localStorage

### Overview
The Fuzio Meter Reading App currently uses **browser localStorage** as its data persistence layer. This is a client-side-only solution suitable for prototyping and single-user scenarios.

**Key Characteristics:**
- Storage Location: Browser localStorage (5-10MB limit)
- Scope: Per-device, per-browser
- Persistence: Survives page refreshes, not browser data clearing
- Synchronization: None (each device has independent data)
- Concurrency: Single-user only
- Security: No authentication, accessible via browser DevTools

---

## Data Architecture

### Storage Module (`assets/storage.js`)

**Core API:**
```javascript
storage.create(entity, data)    // Create new record (auto-generates ID & timestamp)
storage.getAll(entity)           // Retrieve all records of type
storage.get(entity, id)          // Retrieve single record by ID
storage.update(entity, id, data) // Update existing record
storage.delete(entity, id)       // Delete record
storage.generateId()             // Generate unique ID (timestamp + random)
```

**Entity-Specific Helpers:**
```javascript
storage.getSchemes()
storage.getBuildings(schemeId)
storage.getUnits(buildingId)
storage.getMeters(schemeId, meterType)
storage.getReadings(cycleId, meterId)
storage.getCycles(schemeId)
storage.getOpenCycle(schemeId)
```

**Implementation Details:**
- Uses `JSON.parse()` / `JSON.stringify()` for serialization
- Auto-adds `id`, `created_at`, `updated_at` timestamps
- ID format: Base36 timestamp + random suffix (e.g., `l2p8qx7k8mno`)
- Data stored in keys: `schemes`, `buildings`, `units`, `meters`, `readings`, `cycles`

---

## Data Models

### 1. Schemes
**Purpose:** Top-level container for a property/location

**Schema:**
```javascript
{
  id: string,              // Auto-generated
  name: string,            // "Fuzio Gardens 5"
  address: string,         // "80 george street, Port Alfred"
  notes: string,           // Optional notes
  created_at: ISO8601,     // "2026-01-05T10:30:00.000Z"
  updated_at: ISO8601      // Auto-updated on modifications
}
```

**Relationships:**
- Has many: Buildings, Cycles, Meters (bulk)

**Current Usage:**
- Dashboard: Display scheme selector
- Onboarding: First step creates scheme
- Export: Filter data by scheme

---

### 2. Buildings
**Purpose:** Physical structures within a scheme

**Schema:**
```javascript
{
  id: string,              // Auto-generated
  scheme_id: string,       // Foreign key to schemes
  name: string,            // "Block A", "Main Building"
  created_at: ISO8601,
  updated_at: ISO8601
}
```

**Relationships:**
- Belongs to: Scheme (via `scheme_id`)
- Has many: Units

**Current Usage:**
- Meter register: Group meters by building
- Reading cycle: Filter readings by building
- On-site mode: Sort queue by building

---

### 3. Units
**Purpose:** Individual metered spaces (apartments, shops, offices)

**Schema:**
```javascript
{
  id: string,              // Auto-generated
  building_id: string,     // Foreign key to buildings
  unit_number: string,     // "3B", "Shop 12"
  created_at: ISO8601,
  updated_at: ISO8601
}
```

**Relationships:**
- Belongs to: Building (via `building_id`)
- Has one: Meter (typically)

**Current Usage:**
- Meter register: Link meters to units
- Reading capture: Display unit context
- Export: Generate per-unit consumption reports

---

### 4. Meters
**Purpose:** Physical electricity meters

**Schema:**
```javascript
{
  id: string,              // Auto-generated
  scheme_id: string,       // Foreign key to schemes
  unit_id: string,         // Foreign key to units (null for BULK meters)
  meter_number: string,    // "SM-2023-014" (must be unique)
  meter_type: string,      // "BULK" | "UNIT"
  last_reading: number,    // Most recent reading value (kWh)
  created_at: ISO8601,
  updated_at: ISO8601
}
```

**Types:**
- **BULK:** Main incoming meter for entire scheme
- **UNIT:** Sub-meter for individual unit

**Relationships:**
- Belongs to: Scheme (via `scheme_id`)
- Belongs to: Unit (via `unit_id`, nullable)
- Has many: Readings

**Validation Rules:**
- `meter_number` must be unique across entire system
- BULK meters: `unit_id` is null
- UNIT meters: `unit_id` required

**Current Usage:**
- Reading cycle: Capture readings per meter
- Validation: Check for duplicates, missing meters
- QR codes: Generate per-meter QR codes

---

### 5. Readings
**Purpose:** Captured meter readings for a cycle

**Schema:**
```javascript
{
  id: string,              // Auto-generated
  meter_id: string,        // Foreign key to meters
  cycle_id: string,        // Foreign key to cycles
  reading_value: number,   // kWh reading
  reading_date: ISO8601,   // When reading was captured
  photo: string,           // Photo filename/reference
  notes: string,           // Optional notes
  consumption: number,     // Calculated: current - previous
  captured_by: string,     // "QR Reader", "Manual", "On-Site"
  flags: array,            // ["negative_consumption", "high_consumption"]
  review_status: string,   // "pending" | "approved" | "disputed"
  issue_type: string,      // "inaccessible" | "damaged" | "unclear" | "other" (for flagged readings)
  created_at: ISO8601,
  updated_at: ISO8601
}
```

**Calculated Fields:**
- `consumption` = `reading_value` - previous reading's `reading_value`

**Flags (auto-generated by validation.js):**
- `negative_consumption` - Reading lower than previous
- `high_consumption` - Exceeds expected range by >30%
- `low_consumption` - Below expected range by >30%
- `zero_consumption` - No consumption detected

**Relationships:**
- Belongs to: Meter (via `meter_id`)
- Belongs to: Cycle (via `cycle_id`)

**Current Usage:**
- Reading cycle: Capture and store readings
- Review page: Approve/dispute readings
- Export: Generate consumption reports
- Validation: Flag anomalies

---

### 6. Cycles
**Purpose:** Reading periods (typically monthly)

**Schema:**
```javascript
{
  id: string,              // Auto-generated
  scheme_id: string,       // Foreign key to schemes
  start_date: ISO8601,     // "2024-01-01"
  end_date: ISO8601,       // "2024-01-31"
  status: string,          // "OPEN" | "CLOSED"
  created_at: ISO8601,
  updated_at: ISO8601
}
```

**Status States:**
- **OPEN:** Currently accepting readings
- **CLOSED:** Finalized, no more readings allowed

**Business Rules:**
- Only ONE cycle can be OPEN per scheme at a time
- Cycles cannot overlap for the same scheme
- Closing a cycle validates all readings are captured

**Relationships:**
- Belongs to: Scheme (via `scheme_id`)
- Has many: Readings

**Current Usage:**
- Reading cycle: Manage active cycle
- Review: Display readings for cycle
- Export: Generate cycle reports

---

## Data Flow & Dependencies

### Hierarchy
```
Scheme
  ├── Buildings
  │     └── Units
  │           └── Meters (UNIT)
  ├── Meters (BULK)
  └── Cycles
        └── Readings
```

### Common Queries

**1. Get all meters for a scheme:**
```javascript
const schemeId = 'abc123';
const buildings = storage.getBuildings(schemeId);
const buildingIds = buildings.map(b => b.id);
const units = storage.getAll('units').filter(u => buildingIds.includes(u.building_id));
const unitIds = units.map(u => u.id);
const meters = storage.getAll('meters').filter(m => 
  m.scheme_id === schemeId && 
  (m.meter_type === 'BULK' || unitIds.includes(m.unit_id))
);
```

**2. Get readings for current cycle:**
```javascript
const openCycle = storage.getOpenCycle(schemeId);
const readings = storage.getReadings(openCycle.id);
```

**3. Check if all meters have readings:**
```javascript
const meters = storage.getMeters(schemeId);
const readings = storage.getReadings(cycleId);
const meterIds = new Set(readings.map(r => r.meter_id));
const missingReadings = meters.filter(m => !meterIds.has(m.id));
```

---

## Module Dependencies

### Files Using Storage

| Module | Storage Calls | Purpose |
|--------|---------------|---------|
| `app.js` | All CRUD operations | Core data management |
| `onboarding.js` | create() | Wizard data creation |
| `meters.js` | create(), update(), delete() | Meter register CRUD |
| `reading-cycle.js` | create(), getAll(), get() | Reading capture |
| `on-site-mode.js` | create(), getAll() | Field worker readings |
| `review.js` | getAll(), update() | Reading approval |
| `export.js` | getAll() | Report generation |
| `validation.js` | getAll() (read-only) | Data validation |
| `storage.js` | N/A | Core storage layer |

### Import Pattern
```javascript
import { storage } from './assets/storage.js';
```

---

## Current Limitations

### Technical Constraints

1. **Storage Capacity**
   - Limit: 5-10MB per domain (browser-dependent)
   - Current usage: ~50KB per scheme with 50 units and 12 cycles
   - Risk: Large schemes (>100 units, >24 months data) may exceed limit

2. **Single Device/Browser**
   - Data isolated to one browser on one device
   - Field worker readings not accessible to office admin
   - No real-time synchronization

3. **No Authentication**
   - Anyone with browser access can view/modify data
   - No user roles or permissions
   - No audit trail (beyond timestamps)

4. **No Backup/Recovery**
   - Browser data clearing = permanent data loss
   - No automatic backups
   - No version history

5. **No Concurrency Control**
   - Multiple tabs can create conflicts
   - Race conditions possible with simultaneous edits
   - Last-write-wins (no conflict resolution)

6. **Performance**
   - JSON.parse() on every read = slow with large datasets
   - No indexing (linear search for queries)
   - No pagination (loads entire dataset)

### Business Constraints

1. **No Multi-User Support**
   - Office admin and field workers must share device
   - No collaboration features
   - No assignment/workflow tracking

2. **No Data Sharing**
   - Cannot email/share reports (must screenshot)
   - No API for external systems
   - No integration with accounting software

3. **No Data Analytics**
   - No historical trend analysis across schemes
   - No aggregation across properties
   - No predictive modeling

---

## Cloud Migration Strategy

### Recommended Architecture

**Backend Stack:**
- **Database:** PostgreSQL (relational, ACID-compliant)
- **API:** Node.js + Express (REST or GraphQL)
- **Hosting:** AWS/Azure/Google Cloud
- **Authentication:** JWT + OAuth2
- **File Storage:** S3/Azure Blob (for meter photos)

**Alternative (Serverless):**
- **Database:** Firebase Firestore / Supabase
- **API:** Firebase Functions / Supabase Edge Functions
- **Authentication:** Firebase Auth / Supabase Auth
- **File Storage:** Firebase Storage / Supabase Storage

---

## Migration Roadmap

### Phase 1: Backend API (No UI Changes)

**Create RESTful API endpoints:**

```
POST   /api/schemes                 → Create scheme
GET    /api/schemes                 → List schemes
GET    /api/schemes/:id             → Get scheme
PUT    /api/schemes/:id             → Update scheme
DELETE /api/schemes/:id             → Delete scheme

POST   /api/buildings               → Create building
GET    /api/buildings?scheme_id=:id → List buildings by scheme
...similar CRUD for units, meters, readings, cycles
```

**Update storage.js to use fetch():**

```javascript
// Before (localStorage):
create(entity, data) {
  const items = this.getAll(entity);
  const newItem = { id: this.generateId(), ...data };
  items.push(newItem);
  localStorage.setItem(entity, JSON.stringify(items));
  return newItem;
}

// After (API):
async create(entity, data) {
  const response = await fetch(`/api/${entity}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getToken()}`
    },
    body: JSON.stringify(data)
  });
  return await response.json();
}
```

**Changes Required:**
- All storage calls become `async/await`
- Add error handling (network failures, validation errors)
- Add loading states in UI
- Add token management for authentication

**Files to Update:**
- `storage.js` - Replace localStorage with fetch() calls
- All modules using storage - Add async/await
- Add error boundaries for failed API calls

---

### Phase 2: Authentication & Multi-User

**Add User Management:**
```javascript
// New entities
{
  users: {
    id: uuid,
    email: string,
    password_hash: string,
    role: 'admin' | 'field_worker' | 'viewer',
    scheme_id: string  // Which scheme(s) they can access
  }
}
```

**Add Auth Middleware:**
```javascript
// Protect all API routes
router.use('/api/*', authenticateToken);

// Role-based access control
router.post('/api/readings', requireRole(['admin', 'field_worker']));
router.delete('/api/readings/:id', requireRole(['admin']));
```

**UI Changes:**
- Add login page
- Store JWT token in sessionStorage
- Add logout button
- Show user context (name, role)
- Hide features based on role

---

### Phase 3: Real-Time Sync & Collaboration

**Add WebSocket/Server-Sent Events:**
```javascript
// Notify all users when data changes
socket.on('reading_created', (reading) => {
  // Update UI without refresh
  updateReadingsList(reading);
});
```

**Add Optimistic Updates:**
```javascript
// Update UI immediately, rollback on error
const optimisticReading = { id: 'temp-123', ...data };
dispatch({ type: 'ADD_READING', payload: optimisticReading });

try {
  const savedReading = await storage.create('readings', data);
  dispatch({ type: 'UPDATE_READING', payload: savedReading });
} catch (error) {
  dispatch({ type: 'REMOVE_READING', payload: optimisticReading.id });
  showError('Failed to save reading');
}
```

**Add Conflict Resolution:**
```javascript
// Last-write-wins with version tracking
{
  readings: {
    id: uuid,
    version: integer,  // Increment on each update
    ...
  }
}

// Client sends version, server checks before updating
PUT /api/readings/:id { version: 5, ... }
// Server: if (current_version !== request.version) throw ConflictError
```

---

### Phase 4: Advanced Features

**Photo Storage:**
```javascript
// Before: photo stored as text reference
{ photo: "meter_photo_001.jpg" }

// After: upload to cloud storage
const photoUrl = await uploadPhoto(file);
{ photo_url: "https://s3.amazonaws.com/fuzio-meter-photos/abc123.jpg" }
```

**Data Analytics:**
```sql
-- Average consumption per unit type
SELECT unit_type, AVG(consumption) 
FROM readings 
JOIN meters ON readings.meter_id = meters.id
GROUP BY unit_type;

-- Trend analysis
SELECT DATE_TRUNC('month', reading_date), SUM(consumption)
FROM readings
WHERE scheme_id = 'abc123'
GROUP BY DATE_TRUNC('month', reading_date)
ORDER BY 1;
```

**Automated Billing:**
```javascript
// Generate invoices from readings
POST /api/cycles/:id/generate-invoices
// Creates PDF invoices for each unit based on consumption
```

---

## Data Migration Script

### Export Current Data
```javascript
// Run in browser console
function exportData() {
  const data = {
    schemes: storage.getAll('schemes'),
    buildings: storage.getAll('buildings'),
    units: storage.getAll('units'),
    meters: storage.getAll('meters'),
    readings: storage.getAll('readings'),
    cycles: storage.getAll('cycles'),
    exported_at: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fuzio-data-export-${Date.now()}.json`;
  a.click();
}

exportData();
```

### Import to Backend
```javascript
// Backend script (Node.js)
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('export.json'));

async function importData() {
  // Import in order (respect foreign keys)
  for (const scheme of data.schemes) {
    await db.schemes.create(scheme);
  }
  
  for (const building of data.buildings) {
    await db.buildings.create(building);
  }
  
  // ... continue for units, meters, readings, cycles
  
  console.log('Import complete!');
}

importData().catch(console.error);
```

---

## Database Schema (PostgreSQL)

### Tables

```sql
CREATE TABLE schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID REFERENCES schemes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  unit_number VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(building_id, unit_number)
);

CREATE TABLE meters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID REFERENCES schemes(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  meter_number VARCHAR(100) UNIQUE NOT NULL,
  meter_type VARCHAR(10) CHECK (meter_type IN ('BULK', 'UNIT')),
  last_reading NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID REFERENCES schemes(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(10) CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id UUID REFERENCES meters(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  reading_value NUMERIC(10, 2) NOT NULL,
  reading_date TIMESTAMP NOT NULL,
  photo_url TEXT,
  notes TEXT,
  consumption NUMERIC(10, 2),
  captured_by VARCHAR(100),
  flags JSONB DEFAULT '[]',
  review_status VARCHAR(20) DEFAULT 'pending',
  issue_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(meter_id, cycle_id)  -- One reading per meter per cycle
);

-- Indexes for performance
CREATE INDEX idx_buildings_scheme ON buildings(scheme_id);
CREATE INDEX idx_units_building ON units(building_id);
CREATE INDEX idx_meters_scheme ON meters(scheme_id);
CREATE INDEX idx_meters_unit ON meters(unit_id);
CREATE INDEX idx_readings_meter ON readings(meter_id);
CREATE INDEX idx_readings_cycle ON readings(cycle_id);
CREATE INDEX idx_cycles_scheme ON cycles(scheme_id);
CREATE INDEX idx_cycles_status ON cycles(status);
```

---

## API Specification

### Authentication Endpoints

```
POST /api/auth/register
Body: { email, password, role }
Response: { user, token }

POST /api/auth/login
Body: { email, password }
Response: { user, token }

POST /api/auth/logout
Headers: Authorization: Bearer <token>
Response: { message: "Logged out" }

GET /api/auth/me
Headers: Authorization: Bearer <token>
Response: { user }
```

### Data Endpoints (All require authentication)

```
# Schemes
GET    /api/schemes              → List all (filtered by user permissions)
POST   /api/schemes              → Create new
GET    /api/schemes/:id          → Get details
PUT    /api/schemes/:id          → Update
DELETE /api/schemes/:id          → Delete (cascade)

# Buildings
GET    /api/buildings?scheme_id=:id  → List by scheme
POST   /api/buildings                → Create
GET    /api/buildings/:id            → Get details
PUT    /api/buildings/:id            → Update
DELETE /api/buildings/:id            → Delete

# Units
GET    /api/units?building_id=:id    → List by building
POST   /api/units                    → Create
GET    /api/units/:id                → Get details
PUT    /api/units/:id                → Update
DELETE /api/units/:id                → Delete

# Meters
GET    /api/meters?scheme_id=:id&meter_type=:type  → List/filter
POST   /api/meters                   → Create
GET    /api/meters/:id               → Get details
PUT    /api/meters/:id               → Update
DELETE /api/meters/:id               → Delete

# Readings
GET    /api/readings?cycle_id=:id&meter_id=:id  → List/filter
POST   /api/readings                 → Create
GET    /api/readings/:id             → Get details
PUT    /api/readings/:id             → Update (for review/approval)
DELETE /api/readings/:id             → Delete

# Cycles
GET    /api/cycles?scheme_id=:id&status=:status  → List/filter
POST   /api/cycles                   → Create
GET    /api/cycles/:id               → Get details
PUT    /api/cycles/:id               → Update (e.g., close cycle)
DELETE /api/cycles/:id               → Delete

# Bulk Operations
POST   /api/readings/bulk            → Create multiple readings
Body: { readings: [...] }
Response: { created: [...], errors: [...] }

# Reports
GET    /api/reports/consumption?cycle_id=:id  → Consumption report
GET    /api/reports/export?scheme_id=:id&format=csv  → Export data
```

---

## Testing Strategy

### Data Migration Testing

1. **Export Test Data:**
   ```javascript
   // Create test data in localStorage
   storage.create('schemes', { name: 'Test Scheme', address: '123 Test St' });
   // ... create buildings, units, meters, readings
   
   // Export
   exportData();
   ```

2. **Import to Backend:**
   ```bash
   node scripts/import-data.js test-export.json
   ```

3. **Verify Data:**
   ```sql
   SELECT COUNT(*) FROM schemes;  -- Should match export
   SELECT COUNT(*) FROM readings; -- Should match export
   ```

4. **Test Relationships:**
   ```sql
   -- Check foreign keys are valid
   SELECT * FROM meters WHERE unit_id NOT IN (SELECT id FROM units);
   -- Should return 0 rows (except BULK meters with NULL unit_id)
   ```

---

## Cost Estimation

### Backend Hosting (AWS Example)

| Service | Usage | Cost/Month |
|---------|-------|------------|
| RDS PostgreSQL (db.t3.micro) | 20GB storage | $15 |
| EC2 (t3.micro) | API server | $8 |
| S3 | 100GB photos | $2.30 |
| CloudFront CDN | 100GB transfer | $8.50 |
| Route53 | DNS hosting | $0.50 |
| **Total** | | **~$35/month** |

**Alternatives:**
- **Supabase Free Tier:** $0/month (500MB DB, 1GB storage, 2GB bandwidth)
- **Firebase Spark Plan:** $0/month (1GB storage, 10GB bandwidth)
- **Heroku Hobby:** $7/month (Postgres + dyno)

---

## Rollback Strategy

If cloud migration fails, revert to localStorage:

1. **Export data from backend:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     https://api.fuzio.com/export > backup.json
   ```

2. **Import to localStorage:**
   ```javascript
   async function importBackup(jsonData) {
     const data = JSON.parse(jsonData);
     
     for (const entity of ['schemes', 'buildings', 'units', 'meters', 'readings', 'cycles']) {
       localStorage.setItem(entity, JSON.stringify(data[entity]));
     }
     
     console.log('Data restored to localStorage');
   }
   ```

3. **Revert storage.js to localStorage version** (keep backup of localStorage version)

---

## Summary

### Current State
- ✅ Fully functional for single-user, single-device scenarios
- ✅ Simple, no backend infrastructure required
- ✅ Fast development and prototyping
- ❌ No multi-user support
- ❌ No data backup/recovery
- ❌ Limited to ~100 units before performance degrades

### Cloud Migration Benefits
- ✅ Multi-user collaboration
- ✅ Real-time synchronization
- ✅ Automatic backups
- ✅ Scalable to 1000+ units
- ✅ Mobile app compatibility
- ✅ Integration with other systems

### Effort Estimate
- **Phase 1 (API):** 2-3 weeks
- **Phase 2 (Auth):** 1 week
- **Phase 3 (Real-time):** 1-2 weeks
- **Phase 4 (Advanced):** 2-4 weeks
- **Total:** 6-10 weeks for full migration

---

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Maintained By:** Fuzio Properties Development Team
