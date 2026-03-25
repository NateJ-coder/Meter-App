param(
    [string]$WorkbookPath = ".\ud\Utility Dash 9 Mar 2026.xlsm",
    [PSCredential]$WorkbookCredential,
    [string]$OutputDir = ".\source-documents\03-extracted-outputs\utility-dash"
)

$ErrorActionPreference = 'Stop'

function Get-WorkbookPassword {
    param([PSCredential]$Credential)

    if ($null -eq $Credential) {
        return $null
    }

    return $Credential.GetNetworkCredential().Password
}

if ($null -eq $WorkbookCredential -and -not [string]::IsNullOrWhiteSpace($env:UTILITY_DASH_PASSWORD)) {
    $securePassword = ConvertTo-SecureString -String $env:UTILITY_DASH_PASSWORD -AsPlainText -Force
    $WorkbookCredential = New-Object System.Management.Automation.PSCredential ('utility-dash', $securePassword)
}

if ($null -eq $WorkbookCredential) {
    throw "Workbook password required. Pass -WorkbookCredential or set UTILITY_DASH_PASSWORD before running this script."
}

$plainTextPassword = Get-WorkbookPassword -Credential $WorkbookCredential

function Convert-CellValue {
    param(
        [object]$Value,
        [string]$Text
    )

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [double] -or $Value -is [single] -or $Value -is [decimal] -or $Value -is [int] -or $Value -is [long]) {
        return [double]$Value
    }

    $trimmed = [string]$Text
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return $null
    }

    $normalized = $trimmed.Replace(',', '')
    $number = 0.0
    if ([double]::TryParse($normalized, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
        return $number
    }

    return $trimmed.Trim()
}

function Get-MonthColumns {
    param($Sheet)

    $columns = @()
    $columnIndex = 5
    while ($true) {
        $dateLabel = [string]$Sheet.Cells.Item(2, $columnIndex).Text
        if ([string]::IsNullOrWhiteSpace($dateLabel)) {
            break
        }

        $columns += [PSCustomObject]@{
            ColumnIndex = $columnIndex
            DisplayLabel = ([string]$Sheet.Cells.Item(1, $columnIndex).Text).Trim()
            ReadingDate = $dateLabel.Trim()
            TariffTable = ([string]$Sheet.Cells.Item(3, $columnIndex).Text).Trim()
        }

        $columnIndex++
    }

    return $columns
}

function Get-SectionRows {
    param(
        $Sheet,
        [string]$SectionHeader,
        [int]$UsedRows
    )

    $headerRow = $null
    for ($rowIndex = 1; $rowIndex -le $UsedRows; $rowIndex++) {
        $label = ([string]$Sheet.Cells.Item($rowIndex, 1).Text).Trim()
        if ($label -eq $SectionHeader) {
            $headerRow = $rowIndex
            break
        }
    }

    if ($null -eq $headerRow) {
        return @()
    }

    $rows = @()
    for ($rowIndex = $headerRow + 1; $rowIndex -le $UsedRows; $rowIndex++) {
        $label = ([string]$Sheet.Cells.Item($rowIndex, 1).Text).Trim()
        if ([string]::IsNullOrWhiteSpace($label)) {
            continue
        }

        if ($label -match '^[A-Z\s]+$' -and $label -ne $SectionHeader) {
            break
        }

        $rows += $rowIndex
    }

    return $rows
}

function Export-BuildingSheet {
    param($Sheet)

    $usedRange = $Sheet.UsedRange
    $usedRows = $usedRange.Rows.Count
    $monthColumns = Get-MonthColumns -Sheet $Sheet
    $electricityRows = Get-SectionRows -Sheet $Sheet -SectionHeader 'ELECTRICITY' -UsedRows $usedRows
    $waterRows = Get-SectionRows -Sheet $Sheet -SectionHeader 'WATER' -UsedRows $usedRows

    $meters = foreach ($rowIndex in $electricityRows) {
        $unitLabel = ([string]$Sheet.Cells.Item($rowIndex, 1).Text).Trim()
        if ([string]::IsNullOrWhiteSpace($unitLabel)) {
            continue
        }

        $history = foreach ($month in $monthColumns) {
            $cell = $Sheet.Cells.Item($rowIndex, $month.ColumnIndex)
            $value = Convert-CellValue -Value $cell.Value2 -Text $cell.Text
            if ($null -eq $value -or $value -isnot [double]) {
                continue
            }

            [PSCustomObject]@{
                reading_date = $month.ReadingDate
                reading_label = $month.DisplayLabel
                tariff_table = $month.TariffTable
                reading_value = $value
            }
        }

        $latestReading = $history | Select-Object -Last 1
        [PSCustomObject]@{
            scheme_name = $Sheet.Name
            source_sheet = $Sheet.Name
            unit_label = $unitLabel
            meter_type = 'UNIT'
            prepaid = ([string]$Sheet.Cells.Item($rowIndex, 2).Text).Trim()
            pq_factor = Convert-CellValue -Value $Sheet.Cells.Item($rowIndex, 3).Value2 -Text $Sheet.Cells.Item($rowIndex, 3).Text
            provisional_meter_key = ($unitLabel -replace '[^A-Za-z0-9]+', '_').Trim('_')
            latest_reading = $latestReading.reading_value
            latest_reading_date = $latestReading.reading_date
            reading_history = @($history)
        }
    }

    $charges = @()
    for ($rowIndex = 4; $rowIndex -lt 16; $rowIndex++) {
        $label = ([string]$Sheet.Cells.Item($rowIndex, 1).Text).Trim()
        if ([string]::IsNullOrWhiteSpace($label)) {
            continue
        }

        $values = foreach ($month in $monthColumns) {
            $cell = $Sheet.Cells.Item($rowIndex, $month.ColumnIndex)
            $value = Convert-CellValue -Value $cell.Value2 -Text $cell.Text
            if ($null -eq $value) {
                continue
            }

            [PSCustomObject]@{
                reading_date = $month.ReadingDate
                tariff_table = $month.TariffTable
                value = $value
            }
        }

        $charges += [PSCustomObject]@{
            scheme_name = $Sheet.Name
            charge_name = $label
            distribution_mode = ([string]$Sheet.Cells.Item($rowIndex, 3).Text).Trim()
            values = @($values)
        }
    }

    return [PSCustomObject]@{
        scheme_name = $Sheet.Name
        month_columns = @($monthColumns)
        electricity_meters = @($meters)
        water_rows_found = $waterRows.Count
        charge_components = @($charges)
    }
}

function Export-FlatSheet {
    param($Sheet)

    $usedRange = $Sheet.UsedRange
    $rows = @()
    for ($rowIndex = 1; $rowIndex -le $usedRange.Rows.Count; $rowIndex++) {
        $rowValues = @()
        $hasValue = $false
        for ($columnIndex = 1; $columnIndex -le $usedRange.Columns.Count; $columnIndex++) {
            $text = ([string]$Sheet.Cells.Item($rowIndex, $columnIndex).Text).Trim()
            if ($text) {
                $hasValue = $true
            }
            $rowValues += $text
        }

        if ($hasValue) {
            $rows += ,$rowValues
        }
    }

    return $rows
}

function Write-NdjsonFile {
    param(
        [string]$Path,
        [object[]]$Records
    )

    if (Test-Path $Path) {
        Remove-Item $Path -Force
    }

    foreach ($record in $Records) {
        ($record | ConvertTo-Json -Compress -Depth 6) | Add-Content -Path $Path -Encoding UTF8
    }
}

$resolvedWorkbook = Resolve-Path $WorkbookPath
$resolvedOutputDir = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

$supportSheetNames = @(
    'CheckList', 'ReadableReport', 'BuildingReport', 'BuildingReportTemplate', 'Variable_List',
    'ReadableReportTemplate (3)', 'ReadableReportTemplate (2)', 'Home', 'Help', 'Settings', 'Tariffs',
    'UnitHistory', 'ElecBreakDown', 'WaterBreakdown', 'ReadableReportTemplate', 'ReadableReportTemplate Water',
    'Invoice', 'WCU Output', 'BCM Output', 'Sheet2'
)

$excel = $null
$workbook = $null

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($resolvedWorkbook.Path, 0, $true, 5, $plainTextPassword)

    $buildingSheets = @($workbook.Worksheets | Where-Object { $supportSheetNames -notcontains $_.Name })
    $buildingExports = foreach ($sheet in $buildingSheets) {
        Export-BuildingSheet -Sheet $sheet
    }

    $jsonPath = Join-Path $resolvedOutputDir 'utility-dash-import.json'
    $summaryPath = Join-Path $resolvedOutputDir 'utility-dash-summary.csv'
    $readingsPath = Join-Path $resolvedOutputDir 'utility-dash-latest-electricity-readings.csv'
    $chargesPath = Join-Path $resolvedOutputDir 'utility-dash-charge-components.csv'
    $historyPath = Join-Path $resolvedOutputDir 'utility-dash-electricity-history.ndjson'
    $tariffsPath = Join-Path $resolvedOutputDir 'utility-dash-tariffs.json'
    $exportsPath = Join-Path $resolvedOutputDir 'utility-dash-export-sheets.json'

    $summaryRows = foreach ($building in $buildingExports) {
        [PSCustomObject]@{
            scheme_name = $building.scheme_name
            months_available = $building.month_columns.Count
            electricity_meter_rows = $building.electricity_meters.Count
            charge_components = $building.charge_components.Count
            latest_period = ($building.month_columns | Select-Object -Last 1).ReadingDate
        }
    }

    $metadata = [PSCustomObject]@{
        source_file = $resolvedWorkbook.Path
        extracted_at = (Get-Date).ToString('s')
        sheet_count = $workbook.Worksheets.Count
        building_sheet_count = $buildingSheets.Count
        building_summaries = @($summaryRows)
    }

    $metadata | ConvertTo-Json -Depth 4 | Set-Content -Path $jsonPath -Encoding UTF8
    $summaryRows | Export-Csv -NoTypeInformation -Path $summaryPath -Encoding UTF8

    $latestReadings = foreach ($building in $buildingExports) {
        foreach ($meter in $building.electricity_meters) {
            if ($null -eq $meter.latest_reading) {
                continue
            }

            [PSCustomObject]@{
                scheme_name = $meter.scheme_name
                source_sheet = $meter.source_sheet
                unit_label = $meter.unit_label
                provisional_meter_key = $meter.provisional_meter_key
                prepaid = $meter.prepaid
                pq_factor = $meter.pq_factor
                latest_reading_date = $meter.latest_reading_date
                latest_reading = $meter.latest_reading
            }
        }
    }
    $latestReadings | Export-Csv -NoTypeInformation -Path $readingsPath -Encoding UTF8

    $chargeRows = foreach ($building in $buildingExports) {
        foreach ($charge in $building.charge_components) {
            foreach ($value in $charge.values) {
                [PSCustomObject]@{
                    scheme_name = $building.scheme_name
                    charge_name = $charge.charge_name
                    distribution_mode = $charge.distribution_mode
                    reading_date = $value.reading_date
                    tariff_table = $value.tariff_table
                    value = $value.value
                }
            }
        }
    }
    $chargeRows | Export-Csv -NoTypeInformation -Path $chargesPath -Encoding UTF8

    $historyRecords = foreach ($building in $buildingExports) {
        foreach ($meter in $building.electricity_meters) {
            [PSCustomObject]@{
                scheme_name = $meter.scheme_name
                source_sheet = $meter.source_sheet
                unit_label = $meter.unit_label
                provisional_meter_key = $meter.provisional_meter_key
                prepaid = $meter.prepaid
                pq_factor = $meter.pq_factor
                latest_reading = $meter.latest_reading
                latest_reading_date = $meter.latest_reading_date
                reading_history = @($meter.reading_history)
            }
        }
    }
    Write-NdjsonFile -Path $historyPath -Records $historyRecords

    @(Export-FlatSheet -Sheet $workbook.Worksheets.Item('Tariffs')) | ConvertTo-Json -Depth 4 | Set-Content -Path $tariffsPath -Encoding UTF8

    $exportSheets = [PSCustomObject]@{
        wcu_output_rows = @(Export-FlatSheet -Sheet $workbook.Worksheets.Item('WCU Output'))
        bcm_output_rows = @(Export-FlatSheet -Sheet $workbook.Worksheets.Item('BCM Output'))
    }
    $exportSheets | ConvertTo-Json -Depth 4 | Set-Content -Path $exportsPath -Encoding UTF8

    Write-Host "Exported Utility Dash data to $resolvedOutputDir"
    Write-Host "JSON: $jsonPath"
    Write-Host "Summary CSV: $summaryPath"
    Write-Host "Latest readings CSV: $readingsPath"
    Write-Host "Charge CSV: $chargesPath"
    Write-Host "History NDJSON: $historyPath"
}
finally {
    if ($workbook) {
        $workbook.Close($false)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null
    }

    if ($excel) {
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    }

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}