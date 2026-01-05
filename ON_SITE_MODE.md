# On-Site Reading Mode

## Overview

On-Site Reading Mode transforms the meter reading experience for field workers from a navigation-based task ("find the right meter") to a guided conveyor belt workflow ("here's the next meter").

**Philosophy:** _"The on-site user is not auditing data, resolving flags, or understanding consumption patterns. They are confirming physical reality, recording evidence, and moving forward."_

## User Experience

### Activation
From the Reading Cycle page, click **"📱 Start On-Site Readings"** when a cycle is OPEN.

### Flow
```
[Meter 14 of 48]
Progress bar: ████████░░░░░░░░ 29%

Building: Sunset Residences
Unit: 3B
Meter: SM-2023-014
Last: 1,245 kWh

[Large input field]
Enter reading...

[Submit & Next]  [Flag Issue]

[Pause & Return to Dashboard]
```

### Queue Logic
Meters are sorted for optimal workflow:
1. **Building name** (alphabetically)
2. **Unit number** (numerically)
3. **Unread first** (pending readings at top)

### Issue Flagging
If a meter cannot be read, tap **"Flag Issue"** to select:
- **Inaccessible** - Locked area, tenant not home
- **Damaged** - Physical damage to meter
- **Unclear** - Display not readable
- **Other** - Custom note required

Flagged meters are recorded with `issue_type` and moved to the end of the queue.

### Completion
After the last meter:
```
✓ All Readings Captured!

48 readings submitted
45 successful
3 flagged for review

By Building:
- Sunset Residences: 20 readings
- Ocean View: 15 readings
- Mountain Heights: 13 readings

[Return to Dashboard]
```

## Technical Implementation

### Files
- **[on-site-mode.js](assets/on-site-mode.js)** - Core module (420 lines)
- **[reader.html](reader.html)** - Entry point with branded header
- **[styles.css](assets/styles.css)** - `.onsite-*` class styles

### State Management
```javascript
localStorage.setItem('fuzio_onsite_mode', 'active');
localStorage.setItem('fuzio_onsite_queue_position', index);
```

### Key Functions

#### `onSiteMode.activate()`
Enables on-site mode and initializes queue position.

#### `onSiteMode.getReadingQueue(cycleId)`
Returns ordered array of meters with metadata:
```javascript
[
  {
    meter: { id, meter_number, ... },
    unit: { unit_number, ... },
    building: { name, ... },
    hasReading: false,
    lastReading: null
  },
  ...
]
```

#### `onSiteMode.renderOnSiteCapture(containerId, cycleId)`
Renders the full-screen capture interface.

#### `onSiteMode.handleOnsiteSubmit(cycleId, meterId, readingValue, photoRef, notes)`
Saves reading, updates queue position, advances to next meter.

#### `onSiteMode.flagMeterIssue(cycleId, meterId, issueType, notes)`
Records a flagged reading with `issue_type` and skips to next meter.

### Real-Time Feedback
```javascript
const feedback = onSiteMode.validateOnsiteReading(readingValue, lastReading);
// Returns: { status: 'success'|'warning'|'error', message: '...' }
```

### CSS Classes
- `.onsite-capture-screen` - Main container
- `.onsite-header` - Fuzio-branded blue header
- `.onsite-progress-bar` - Gold progress indicator
- `.onsite-meter-card` - Meter details card
- `.onsite-input-large` - 2rem centered input
- `.onsite-feedback` - Real-time validation
- `.onsite-btn-submit` - Primary action (blue)
- `.onsite-btn-flag` - Secondary action (red border)
- `.onsite-completion-screen` - End-of-run summary

## Integration

### Entry Point
[reading-cycle.html](reading-cycle.html) line 60:
```html
<button class="btn btn-secondary" onclick="startOnsiteMode()">
  📱 Start On-Site Readings
</button>
```

### Activation Logic
```javascript
window.startOnsiteMode = function() {
    const openCycle = storage.getAll('cycles').find(c => c.status === 'OPEN');
    if (!openCycle) {
        alert('No open reading cycle found.');
        return;
    }
    window.location.href = 'reader.html?mode=onsite';
};
```

### Reader Detection
[reader.html](reader.html) line 116:
```javascript
if (mode === 'onsite' || onSiteMode.isActive()) {
    onSiteMode.renderOnSiteCapture('onsite-container', openCycle.id);
}
```

## Branding

### Fuzio Colors
- **Primary:** `#0b4da2` (Fuzio Blue)
- **Accent:** `#d4a12a` (Fuzio Gold)
- **Dark:** `#083a7a` (Fuzio Blue Dark)

### Logo
`assets/images/Fuzio logo.jpg` displayed at:
- Navigation bar (40px height)
- Reader header (60px height)

### Visual Identity
- **Header:** White background, blue text, gold bottom border
- **Progress bar:** Gold gradient fill
- **Primary button:** Blue gradient with hover lift
- **Context cards:** Blue left border

## Testing Checklist

### Functional
- [ ] Open cycle exists before starting on-site mode
- [ ] Queue sorts by building → unit → unread first
- [ ] Progress bar updates correctly
- [ ] Real-time validation shows consumption
- [ ] Submit advances to next meter
- [ ] Flag issue opens modal with 4 options
- [ ] Flagged readings move to end of queue
- [ ] Completion screen shows accurate stats
- [ ] Pause & Return exits cleanly
- [ ] State persists across page refreshes

### Visual
- [ ] Fuzio logo displays correctly
- [ ] Blue/gold branding consistent
- [ ] Large input field is touch-friendly
- [ ] Mobile responsive (text scales)
- [ ] Progress bar fills smoothly
- [ ] Completion icon renders as green checkmark

### Edge Cases
- [ ] No open cycle - shows error message
- [ ] All meters already read - shows completion immediately
- [ ] Last reading null - shows "First reading"
- [ ] Consumption negative - shows warning
- [ ] Photo ref empty - validation prevents submit
- [ ] Browser refresh mid-capture - resumes at same position

## Comparison: Before vs. After

### Before (Traditional)
```
1. Open Reading Cycle page
2. Scan table of 48 meters
3. Search for "Building A, Unit 3B"
4. Click "Capture" button
5. Enter reading in modal
6. Close modal
7. Repeat steps 3-6 for each meter
```

**Cognitive load:** High (navigation, search, context switching)

### After (On-Site Mode)
```
1. Open Reading Cycle page
2. Click "Start On-Site Readings"
3. See "Meter 1 of 48: Building A, Unit 1A"
4. Enter reading
5. Tap "Submit & Next"
6. Repeat steps 4-5 for each meter
```

**Cognitive load:** Minimal (one meter, one input, one action)

## Future Enhancements

### Possible Additions
1. **Voice Input** - Speak readings instead of typing
2. **Camera Integration** - Auto-capture meter photo
3. **Offline Mode** - Queue submissions until online
4. **GPS Validation** - Confirm field worker location
5. **Time Tracking** - Measure readings per hour
6. **Barcode Scan** - Verify meter number with scan
7. **Undo Last** - Revert previous submission
8. **Skip Meter** - Temporarily skip without flagging
9. **Notes Templates** - Quick-select common issues
10. **Multi-Language** - Support for field workers' languages

### Database Considerations
Currently uses `localStorage`. For production:
- Move to backend API
- Sync queue across devices
- Real-time collaboration (multiple field workers)
- Audit trail (who captured what, when)

## Dependencies

### Required Modules
- `storage.js` - Data persistence
- `validation.js` - Reading validation
- `app.js` - `getCurrentDateTime()` utility

### Optional Enhancements
- `reading-capture-enhanced.js` - Falls back gracefully
- `cycle-close-ritual.js` - Post-capture validation

### Browser Requirements
- ES6 modules support
- localStorage API
- CSS Grid & Flexbox
- Modern input types (`type="number"`, `inputmode="decimal"`)

## Support

### Common Issues

**Q: "Start On-Site Readings" button does nothing**
A: Ensure a reading cycle is OPEN. Check Reading Cycle page status.

**Q: Progress bar stuck at 0%**
A: Refresh page. Queue position stored in `localStorage`.

**Q: Logo not displaying**
A: Verify `assets/images/Fuzio logo.jpg` exists and path is correct.

**Q: Can't go back to previous meter**
A: By design - on-site mode is forward-only. Use "Pause & Return" to exit, then use traditional table view for corrections.

**Q: Flagged meters reappear**
A: Flagged meters are recorded with `issue_type` and marked complete. Review them later in the Review page.

### Developer Notes

To test without real data:
```javascript
// Create test scheme
const scheme = storage.create('schemes', { name: 'Test Scheme' });

// Create test building
const building = storage.create('buildings', { scheme_id: scheme.id, name: 'Test Building' });

// Create test units and meters
for (let i = 1; i <= 10; i++) {
    const unit = storage.create('units', {
        building_id: building.id,
        unit_number: `${i}A`
    });
    storage.create('meters', {
        meter_type: 'UNIT',
        unit_id: unit.id,
        meter_number: `SM-TEST-${i.toString().padStart(3, '0')}`
    });
}

// Create open cycle
storage.create('cycles', {
    scheme_id: scheme.id,
    start_date: '2024-01-01',
    end_date: '2024-01-31',
    status: 'OPEN'
});
```

To reset on-site mode:
```javascript
localStorage.removeItem('fuzio_onsite_mode');
localStorage.removeItem('fuzio_onsite_queue_position');
```

---

**Last Updated:** January 2024  
**Version:** 1.0  
**Author:** Fuzio Properties Development Team
