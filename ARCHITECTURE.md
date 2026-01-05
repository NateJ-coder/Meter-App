# System Architecture - Onboarding & UX Enhancement

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   index.html  │  │reading-cycle │  │  meters.html │          │
│  │  (Dashboard)  │  │    .html     │  │   review.html│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEW ONBOARDING LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           onboarding.js (First-Run Wizard)                 │  │
│  │  • 6-step sequential flow                                  │  │
│  │  • State management (localStorage)                         │  │
│  │  • Readiness validation                                    │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                            │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │        setup-health.js (Proactive Validation)              │  │
│  │  • Issue detection                                         │  │
│  │  • Health status (🟢🟡🔴)                                 │  │
│  │  • Dashboard widget                                        │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                            │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   first-time-checklist.js (Progress Tracker)               │  │
│  │  • Auto-ticking checklist                                  │  │
│  │  • Progress percentage                                     │  │
│  │  • Auto-dismissal                                          │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENHANCED WORKFLOW LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  reading-capture-enhanced.js (Confident Capture)           │  │
│  │  • Expected ranges (from history)                          │  │
│  │  • Real-time validation                                    │  │
│  │  • Contextual feedback                                     │  │
│  │  • Status indicators                                       │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                            │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   cycle-close-ritual.js (Informed Closure)                 │  │
│  │  • Pre-close validation                                    │  │
│  │  • Completion summary                                      │  │
│  │  • Missing/flagged details                                 │  │
│  │  • Informed consent                                        │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXISTING CORE LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ storage.js   │  │validation.js │  │  meters.js   │          │
│  │ (Data Layer) │  │ (Rules)      │  │  (Logic)     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                   │
│                            │                                      │
│                            ▼                                      │
│                 ┌──────────────────────┐                         │
│                 │   localStorage       │                         │
│                 │   (Browser Storage)  │                         │
│                 └──────────────────────┘                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow - First Run

```
User opens app (no data)
    │
    ├─► Check: schemes exist?
    │   └─► NO
    │       │
    │       ├─► onboarding.shouldShowOnboarding() = true
    │       │
    │       └─► Render onboarding wizard
    │           │
    │           ├─► Step 1: Create scheme
    │           │   └─► storage.save('schemes', {...})
    │           │
    │           ├─► Step 2: Add buildings
    │           │   └─► storage.save('buildings', {...})
    │           │
    │           ├─► Step 3: Add units
    │           │   └─► storage.save('units', {...})
    │           │
    │           ├─► Step 4: Register meters
    │           │   ├─► Check duplicates (validation.checkDuplicateMeters)
    │           │   └─► storage.save('meters', {...})
    │           │
    │           ├─► Step 5: Readiness check
    │           │   ├─► setupHealth.getHealthStatus()
    │           │   ├─► Validate: all units have meters?
    │           │   ├─► Validate: no duplicates?
    │           │   └─► Block if issues found
    │           │
    │           └─► Step 6: Open first cycle
    │               ├─► storage.save('cycles', {...})
    │               └─► onboarding.markComplete()
    │
    └─► Redirect to dashboard
        ├─► firstTimeChecklist.renderChecklist() → 83%
        ├─► setupHealth.renderHealthPanel() → 🟢
        └─► Show metrics
```

---

## Data Flow - Reading Capture (Enhanced)

```
User clicks "Capture Reading"
    │
    ├─► openReadingModal(meterId, cycleId)
    │   │
    │   ├─► readingCaptureEnhanced.renderCaptureModal()
    │   │   │
    │   │   ├─► Get meter details
    │   │   ├─► readingCaptureEnhanced.getExpectedRange(meterId)
    │   │   │   └─► validation.getAverageConsumption(meterId, 3)
    │   │   │       └─► Calculate typical range (±30%)
    │   │   │
    │   │   └─► Render modal with:
    │   │       ├─► Meter info
    │   │       ├─► Expected range (if history exists)
    │   │       └─► Input field with real-time validation
    │   │
    │   └─► User enters reading
    │       │
    │       ├─► oninput: validateReadingInRealTime()
    │       │   ├─► readingCaptureEnhanced.validateInRealTime()
    │       │   │   ├─► Check: backward reading?
    │       │   │   ├─► Check: within expected range?
    │       │   │   ├─► Check: huge spike?
    │       │   │   └─► Return: {severity, message, context}
    │       │   │
    │       │   └─► Display feedback (non-blocking)
    │       │       ├─► ✓ Within typical range
    │       │       ├─► ⚠ Higher than usual (review)
    │       │       └─► ⚠ Backward reading (attention)
    │       │
    │       └─► onsubmit: Save reading
    │           ├─► validation.validateReading() → Generate flags
    │           ├─► storage.save('readings', {...})
    │           ├─► Update meter.last_reading
    │           └─► Reload page
```

---

## Data Flow - Cycle Close (Ritual)

```
User clicks "Close Cycle"
    │
    ├─► showCloseCycleRitual()
    │   │
    │   ├─► cycleCloseRitual.getClosureReadiness(cycleId)
    │   │   │
    │   │   ├─► Get all meters (unit type)
    │   │   ├─► Get all readings for cycle
    │   │   ├─► validation.getMissingReadings(cycleId)
    │   │   ├─► validation.getCycleFlagsSummary(cycleId)
    │   │   │
    │   │   └─► Calculate:
    │   │       ├─► Completion rate (%)
    │   │       ├─► Missing readings count
    │   │       ├─► Flagged readings count
    │   │       ├─► Unreviewed flags count
    │   │       └─► isComplete, hasHighFlags, shouldWarn
    │   │
    │   └─► cycleCloseRitual.renderClosureModal()
    │       │
    │       └─► Display modal with:
    │           ├─► Completion status (✓/⚠)
    │           ├─► Progress bar
    │           ├─► Summary:
    │           │   ├─► Units read (expandable)
    │           │   ├─► Missing readings (expandable list)
    │           │   └─► Flagged readings (expandable by type)
    │           ├─► Warnings (if any)
    │           └─► Actions:
    │               ├─► Cancel
    │               ├─► Capture Missing Readings
    │               ├─► Review Flags
    │               └─► Close Anyway
    │
    └─► User confirms close
        ├─► Update cycle.status = 'CLOSED'
        ├─► Update onboarding state (firstCycleClosed)
        ├─► storage.save('cycles', {...})
        └─► Reload page
            └─► firstTimeChecklist → 100% 🎉
```

---

## State Management

### LocalStorage Schema

```javascript
// Onboarding state
fuzio_onboarding_state = {
  started: boolean,
  completed: boolean,
  currentStep: number,
  schemeCreated: boolean,
  buildingsAdded: boolean,
  unitsAdded: boolean,
  metersRegistered: boolean,
  firstCycleOpened: boolean,
  firstCycleClosed: boolean
}

// Existing data (unchanged)
fuzio_schemes = [...]
fuzio_buildings = [...]
fuzio_units = [...]
fuzio_meters = [...]
fuzio_cycles = [...]
fuzio_readings = [...]
```

### State Transitions

```
[No Data] 
  → onboarding.started = true
  → [Wizard Active]
      → schemeCreated = true
      → buildingsAdded = true
      → unitsAdded = true
      → metersRegistered = true
      → firstCycleOpened = true
      → [Dashboard with Checklist]
          → firstCycleClosed = true
          → onboarding.completed = true
          → [Dashboard Normal]
```

---

## Component Dependencies

```
┌─────────────────────┐
│   onboarding.js     │
├─────────────────────┤
│ Depends on:         │
│ • storage.js        │
│ • validation.js     │
└─────────────────────┘

┌─────────────────────┐
│  setup-health.js    │
├─────────────────────┤
│ Depends on:         │
│ • storage.js        │
│ • validation.js     │
└─────────────────────┘

┌─────────────────────┐
│reading-capture-     │
│  enhanced.js        │
├─────────────────────┤
│ Depends on:         │
│ • storage.js        │
│ • validation.js     │
└─────────────────────┘

┌─────────────────────┐
│ cycle-close-        │
│   ritual.js         │
├─────────────────────┤
│ Depends on:         │
│ • storage.js        │
│ • validation.js     │
└─────────────────────┘

┌─────────────────────┐
│first-time-          │
│ checklist.js        │
├─────────────────────┤
│ Depends on:         │
│ • storage.js        │
│ • onboarding.js     │
└─────────────────────┘
```

**Dependency Hierarchy:**
```
storage.js (foundation)
    ↓
validation.js
    ↓
All new components
```

---

## Module Loading Strategy

### index.html
```html
<script type="module">
  import { onboarding } from './assets/onboarding.js';
  import { setupHealth } from './assets/setup-health.js';
  import { firstTimeChecklist } from './assets/first-time-checklist.js';
  
  if (onboarding.shouldShowOnboarding()) {
    // Show wizard
  } else {
    // Show dashboard
    firstTimeChecklist.renderChecklist();
    setupHealth.renderHealthPanel();
  }
</script>
```

### reading-cycle.html
```html
<script type="module">
  import { readingCaptureEnhanced } from './assets/reading-capture-enhanced.js';
  import { cycleCloseRitual } from './assets/cycle-close-ritual.js';
  
  // Integrate enhanced features
  window.openReadingModal = (meterId, cycleId) => {
    readingCaptureEnhanced.renderCaptureModal(meterId, cycleId);
  };
  
  window.showCloseCycleRitual = () => {
    cycleCloseRitual.showClosureModal(cycleId);
  };
</script>
```

---

## Performance Considerations

### Lazy Loading
- Enhanced modules only load when needed
- Dashboard loads onboarding modules conditionally
- Reading cycle loads capture/close modules on demand

### Minimal Re-renders
- Components render once, update efficiently
- State changes trigger targeted updates
- No unnecessary DOM manipulation

### Storage Optimization
- LocalStorage used for persistence
- In-memory caching in storage.js
- Efficient queries (filter once, use many)

---

## Error Handling & Fallbacks

### Graceful Degradation
```javascript
// Enhanced modal with fallback
window.openReadingModal = function(meterId, cycleId) {
  if (window.readingCaptureEnhanced) {
    // Use enhanced modal
    readingCaptureEnhanced.renderCaptureModal(meterId, cycleId);
  } else {
    // Fallback to original modal
    showOriginalModal(meterId, cycleId);
  }
};
```

### State Recovery
```javascript
// If localStorage fails
try {
  const state = JSON.parse(localStorage.getItem('fuzio_onboarding_state'));
} catch (e) {
  // Use default state
  const state = { completed: false, currentStep: 0 };
}
```

---

## Security Considerations

### Input Validation
- All user input validated client-side
- Reading values checked for type/range
- Meter numbers checked for duplicates
- Dates validated for logical consistency

### Data Integrity
- State transitions validated
- Cannot skip onboarding steps
- Cannot close cycle without validation
- Cannot create duplicate meters (blocked)

### Privacy
- All data stored locally (localStorage)
- No external API calls
- No tracking or analytics (yet)
- User controls all data (clear data button)

---

## Browser Compatibility

### Required Features
- ✅ ES6 Modules
- ✅ LocalStorage
- ✅ Fetch API (future)
- ✅ CSS Grid
- ✅ CSS Flexbox

### Supported Browsers
- ✅ Chrome 61+
- ✅ Firefox 60+
- ✅ Safari 11+
- ✅ Edge 79+

### Polyfills (if needed)
- None required for modern browsers
- LocalStorage fallback for privacy mode

---

This architecture diagram shows the complete system, emphasizing:
1. **Layered approach** - New features on top of solid foundation
2. **Clear dependencies** - Each module knows what it needs
3. **Data flow** - From user action to storage and back
4. **State management** - Persistent, recoverable, validated
5. **Performance** - Lazy loading, efficient updates
6. **Reliability** - Fallbacks, error handling, validation
