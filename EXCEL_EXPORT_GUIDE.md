# Excel Export System - Documentation

## Overview

The Fuzio Meter Reading App now includes professional Excel (XLSX) export functionality with two main report types:

1. **Individual Meter Reports** - Detailed reports for dispute packs
2. **Comprehensive Scheme Reports** - Full analytics with bulk reconciliation

---

## 🎯 Key Features

### What's Been Implemented

✅ **SheetJS Integration** - Professional Excel generation with formatting  
✅ **Multi-Sheet Workbooks** - Organized data across multiple sheets  
✅ **Bulk Reconciliation** - Automatic calculation of common property usage  
✅ **Top Consumers Analytics** - Identifies highest consumption units  
✅ **Consumption Distribution** - Groups units by usage ranges  
✅ **User Tracking** - Shows who captured each reading  
✅ **Dispute Pack Integration** - Export from dispute page with 6-month history  
✅ **Review Integration** - Export meter reports directly from review modal  

---

## 📊 Report Types

### 1. Comprehensive Scheme Report

**Location:** Export page → "📈 Export Complete Scheme Report" button

**Contents:** 4-sheet Excel workbook

#### Sheet 1: Summary (Executive Overview)
- Report metadata (generated date, user)
- Scheme details (name, address, period)
- **Bulk Reconciliation:**
  - Bulk Meter Reading (kWh)
  - Sum of Unit Meters (kWh)
  - **Common Property Usage (kWh)** = Bulk - Sum of Units
  - Loss Percentage
- Reading statistics (total, captured, flagged, completion rate)
- Data quality metrics

**Formula:**
```
Common Property Usage = Bulk Meter kWh - Σ(All Unit Meters kWh)
```

This represents:
- Common area electricity consumption
- Electrical losses in distribution
- Meter drift/inaccuracies
- Unmetered or missing readings

#### Sheet 2: Unit Readings (Detailed Data)
- Building, Unit, Meter Number
- Previous Reading, Current Reading, Consumption
- Reading Date, Captured By
- Flags, Review Status
- Full audit trail for every meter

#### Sheet 3: Analytics (Business Intelligence)

**Statistics:**
- Total units and consumption
- Average consumption per unit
- Highest and lowest consumption

**Top 10 Consumers:**
- Ranked by consumption (highest first)
- Shows percentage of total consumption
- Useful for identifying high-usage tenants

**Consumption Distribution:**
Breaks down units into ranges:
- 0-100 kWh
- 101-200 kWh
- 201-300 kWh
- 301-500 kWh
- 500+ kWh

Shows number of units and percentage in each range.

#### Sheet 4: Flags & Issues
- Lists all flagged readings
- Groups by unit and flag type
- Includes descriptions for each issue
- Empty if no flags detected

---

### 2. Individual Meter Report (Dispute Pack)

**Locations:**
- Dispute page → "📄 Download Dispute Pack (Excel)" button
- Review page → "📄 Export Meter Report (Excel)" button (in review modal)

**Contents:** 3-sheet workbook for single meter

#### Sheet 1: Meter Details & Current Reading
- Property details (scheme, building, unit, owner)
- Meter details (number, type, location, installation date)
- Current reading (period, date, captured by, consumption)
- Flags and issues
- Review status and notes
- **Reading history** (last 6 cycles)
- Photo evidence indicator

#### Sheet 2: Reading History (from Dispute Pack)
- Last 6 closed cycles
- Period, status, readings, consumption
- Flags, review status, photo indicator
- Captured by user tracking

#### Sheet 3: Flags & Issues
- Detailed flag information per cycle
- Flag type and descriptions
- Review status for each

**Use Cases:**
- Tenant disputes consumption charges
- Owner questions meter accuracy
- Body corporate investigation
- Auditor requests proof of readings
- Historical consumption tracking

---

## 🚀 Usage Guide

### Exporting Scheme Report

1. Navigate to **Export** page (from navbar)
2. Select a **reading cycle** from dropdown
3. Review the preview tables (optional)
4. Click **"📈 Export Complete Scheme Report"**
5. Excel file downloads: `Scheme-Report-[SchemeName]-[Date].xlsx`

**When to use:**
- End of billing cycle
- Monthly reporting to trustees
- Financial reconciliation
- Auditing and compliance
- Business analytics and forecasting

---

### Exporting Meter Reports (Individual)

#### From Review Page:
1. Go to **Review** page
2. Click **"Review"** on any reading
3. In the modal, click **"📄 Export Meter Report (Excel)"**
4. Excel file downloads: `Meter-Report-[MeterNumber]-[Date].xlsx`

#### From Dispute Page:
1. Go to **Dispute** page
2. Search for a unit or select from list
3. Click **"📄 Download Dispute Pack (Excel)"**
4. Excel file downloads: `Dispute-Pack-[UnitNumber]-[Timestamp].xlsx`

**When to use:**
- Tenant raises a dispute
- Owner requests consumption history
- Meter accuracy investigation
- Legal/compliance documentation
- Individual unit audit

---

## 📐 Bulk Reconciliation Explained

### The Problem
In multi-unit properties, the **bulk meter** (main supply) should equal the sum of all **unit meters**. In reality, there's usually a difference.

### The Formula
```
Bulk Meter Reading = Sum of All Unit Meters + Common Property Usage
```

Or rearranged:
```
Common Property Usage = Bulk Meter - Σ(Unit Meters)
```

### What Common Property Usage Represents

1. **Common Area Consumption** (legitimate)
   - Lifts, lights, pumps, security systems
   - Foyer, stairwell, parking lighting
   - Shared facilities (gym, pool, laundry)

2. **Electrical Losses** (expected)
   - Transmission losses in cables
   - Transformer efficiency losses
   - Typical range: 2-8% of total

3. **Meter Drift** (technical)
   - Unit meters running fast/slow
   - Bulk meter calibration issues
   - Should be minimal with modern meters

4. **Data Issues** (problematic if high)
   - Missing readings (estimated as 0 or previous)
   - Incorrect readings (human error)
   - Unmetered usage

### Interpreting the Results

**Good Scenarios:**
- Common usage: 5-15% of bulk meter
- Consistent month-to-month
- Aligns with expected common area loads

**Warning Signs:**
- Common usage >20% (investigate losses)
- Common usage <0% (unit meters reading too high)
- Large month-to-month variations
- Unexplained increases

### Example
```
Bulk Meter: 10,000 kWh
Unit Meters Sum: 8,500 kWh
Common Property: 1,500 kWh (15%)

Interpretation: Normal range. Common areas using 15% of total supply.
```

---

## 🎨 Excel File Structure

### File Naming Convention
- Scheme Report: `Scheme-Report-[SchemeName]-[Date].xlsx`
- Meter Report: `Meter-Report-[MeterNumber]-[Date].xlsx`
- Dispute Pack: `Dispute-Pack-[UnitNumber]-[Timestamp].xlsx`

### Column Widths (Optimized)
All sheets have pre-set column widths for readability:
- Short columns (status, flags): 12-15 characters
- Medium columns (dates, numbers): 15-20 characters
- Long columns (descriptions, notes): 25-40 characters

### Data Formatting
- Numbers: Fixed to 2 decimal places
- Dates: ISO format (YYYY-MM-DD) or localized
- Status: Text (OPEN, CLOSED, Approved, Pending)
- Percentages: Shown with % symbol

---

## 🔧 Technical Details

### Technology Stack
- **Library:** SheetJS (xlsx v0.20.1)
- **Loading:** Dynamically from CDN
- **File Format:** XLSX (Excel 2007+)
- **Browser Support:** All modern browsers

### Dependencies
```javascript
import { xlsxExport } from './assets/xlsx-export.js';
```

External CDN:
```
https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js
```

### Key Functions

#### `exportSchemeReport(cycleId)`
Generates comprehensive 4-sheet scheme report.

**Parameters:**
- `cycleId` (string) - The reading cycle ID

**Returns:**
- `Promise<string>` - Filename of downloaded file

**Usage:**
```javascript
await xlsxExport.exportSchemeReport('cycle-123');
```

---

#### `exportMeterReport(meterId, cycleId)`
Generates individual meter report with history.

**Parameters:**
- `meterId` (string) - The meter ID
- `cycleId` (string) - The current cycle ID

**Returns:**
- `Promise<string>` - Filename of downloaded file

**Usage:**
```javascript
await xlsxExport.exportMeterReport('meter-456', 'cycle-123');
```

---

#### `exportDisputePackReport(disputePack)`
Generates dispute pack from pre-assembled data.

**Parameters:**
- `disputePack` (object) - Dispute pack data structure (from `getDisputePack()`)

**Returns:**
- `Promise<string>` - Filename of downloaded file

**Usage:**
```javascript
const pack = getDisputePack('unit-789');
await xlsxExport.exportDisputePackReport(pack);
```

---

### Internal Helper Functions

#### `buildSummarySheet(cycle, scheme, readings, meters, currentUser)`
Constructs executive summary data array.

#### `buildUnitReadingsSheet(cycle, scheme, readings)`
Constructs detailed unit readings data array.

#### `buildAnalyticsSheet(cycle, scheme, readings, meters)`
Constructs analytics with top consumers and distribution.

#### `buildFlagsSheet(readings)`
Constructs flags and issues data array.

#### `loadSheetJS()`
Dynamically loads SheetJS library if not already loaded.

---

## 📝 CSV vs XLSX Comparison

| Feature | CSV | XLSX |
|---------|-----|------|
| Multiple sheets | ❌ No | ✅ Yes |
| Formatting | ❌ No | ✅ Yes |
| Formulas | ❌ No | ✅ Yes |
| Column widths | ❌ Manual | ✅ Auto |
| Professional look | ⚠️ Basic | ✅ Professional |
| File size | ✅ Smaller | ⚠️ Larger |
| Universal support | ✅ All systems | ⚠️ Excel/compatible |
| Analytics | ❌ No | ✅ Built-in |
| Recommended for | Imports | Reports |

**When to use CSV:**
- Importing to other systems
- Automated processing
- Simple data exchange
- Legacy system compatibility

**When to use XLSX:**
- Professional reports
- Management presentations
- Trustee meetings
- Dispute resolution
- Comprehensive analytics

---

## 🎯 Best Practices

### For Administrators

1. **Export scheme reports monthly**
   - Keep historical records
   - Track trends over time
   - Archive for compliance

2. **Review reconciliation before exporting**
   - Check common property percentage
   - Investigate large variances
   - Ensure all readings captured

3. **Use meter reports for disputes**
   - Export immediately when dispute raised
   - Include in communication with tenant
   - Keep on file for reference

4. **Share analytics with trustees**
   - Export after cycle closes
   - Present top consumers data
   - Discuss common area usage

### For Field Workers

1. **Ensure user tracking**
   - Always log in before capturing readings
   - Use consistent naming
   - Complete all required fields

2. **Flag issues immediately**
   - Mark suspicious readings
   - Add detailed notes
   - Take photos when possible

### For Property Managers

1. **Regular reporting**
   - Export scheme report after each cycle
   - Present to body corporate meetings
   - Keep annual archives

2. **Dispute preparation**
   - Export meter report when tenant questions bill
   - Provide 6-month history
   - Highlight any flags or estimates

---

## 🐛 Troubleshooting

### Issue: Export button doesn't work
**Solution:** Check browser console for errors. Ensure SheetJS library loaded successfully.

### Issue: File downloads but won't open in Excel
**Solution:** Ensure file extension is `.xlsx`. Try opening with LibreOffice or Google Sheets to verify.

### Issue: Common property usage is negative
**Solution:** Unit meters are reading higher than bulk meter. Check:
- Meter accuracy
- Missing unit meter readings
- Bulk meter issues

### Issue: Missing user tracking in exports
**Solution:** Ensure users log in before capturing readings. Older readings may show "Unknown".

### Issue: Analytics show "0" for everything
**Solution:** Select a cycle with readings captured. Check that meters have consumption data.

---

## 🔮 Future Enhancements (Not Yet Implemented)

These features are planned for future updates:

- **Charts and graphs** in Excel sheets
- **Conditional formatting** (red for high consumption, green for low)
- **Paid/Arrears tracking** integration
- **Email reports** directly from app
- **Scheduled exports** (automatic monthly)
- **Custom report templates**
- **Bulk meter comparison** (month-over-month)
- **Cost calculations** (if tariff rates added)

---

## 📞 Support & Feedback

If you encounter issues or have suggestions for the Excel export system:
1. Check browser console for errors
2. Verify all readings are properly captured
3. Test with a small dataset first
4. Contact support with specific error messages

---

**Version:** 1.0  
**Last Updated:** January 5, 2026  
**Maintainer:** Fuzio Development Team
