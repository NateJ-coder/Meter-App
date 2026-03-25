param(
    [string]$BuildingsRoot = ".\Buildings",
    [string]$OutputDir = ".\source-documents\03-extracted-outputs\buildings-archive"
)

$ErrorActionPreference = 'Stop'

function Get-UtilityType {
    param([string]$RelativePath)

    $path = $RelativePath.ToLowerInvariant()
    if ($path -match 'electric') { return 'electricity' }
    if ($path -match 'water|sanitation') { return 'water_sanitation' }
    if ($path -match 'utility read|meter read|readings') { return 'meter_readings' }
    if ($path -match 'rates|tax|refuse|csos|levy') { return 'non-electric-admin' }
    return 'other'
}

function Get-RelevanceCategory {
    param([string]$RelativePath)

    $path = $RelativePath.ToLowerInvariant()
    if ($path -match 'meter read|utility read|electricity reading|bulk ') { return 'meter-evidence' }
    if ($path -match 'wcu utilities|electricity.*\.xlsx|bc vs council|recon|output') { return 'billing-workbook' }
    if ($path -match 'electricity.*\.pdf') { return 'billing-pdf' }
    if ($path -match 'photo|\.jpg$|\.jpeg$|\.png$') { return 'photo-evidence' }
    if ($path -match 'pop|payment|authority|arrangement|disconnect|query|feedback|email|letter') { return 'admin-correspondence' }
    if ($path -match 'water|sanitation|rates|tax|refuse|levy') { return 'non-electric-utility' }
    return 'uncategorized'
}

function Get-ImportPriority {
    param(
        [string]$UtilityType,
        [string]$RelevanceCategory,
        [string]$Extension
    )

    if ($RelevanceCategory -in @('meter-evidence', 'billing-workbook', 'photo-evidence')) {
        return 'high'
    }

    if ($UtilityType -eq 'electricity' -and $Extension -in @('.pdf', '.xlsx', '.xls', '.xlsm', '.csv')) {
        return 'medium'
    }

    if ($RelevanceCategory -in @('billing-pdf', 'non-electric-utility')) {
        return 'low'
    }

    return 'review'
}

$resolvedBuildingsRoot = Resolve-Path $BuildingsRoot
$resolvedOutputDir = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

$files = Get-ChildItem -Path $resolvedBuildingsRoot.Path -Recurse -File

$inventory = foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($resolvedBuildingsRoot.Path.Length + 1).Replace('\', '/')
    $parts = $relativePath.Split('/')
    $buildingName = $parts[0]
    $utilityType = Get-UtilityType -RelativePath $relativePath
    $category = Get-RelevanceCategory -RelativePath $relativePath
    $priority = Get-ImportPriority -UtilityType $utilityType -RelevanceCategory $category -Extension $file.Extension.ToLowerInvariant()

    [PSCustomObject]@{
        building_name = $buildingName
        relative_path = $relativePath
        extension = $file.Extension.ToLowerInvariant()
        size_kb = [math]::Round($file.Length / 1KB, 2)
        utility_type = $utilityType
        relevance_category = $category
        import_priority = $priority
    }
}

$inventoryPath = Join-Path $resolvedOutputDir 'buildings-archive-inventory.csv'
$summaryPath = Join-Path $resolvedOutputDir 'buildings-archive-summary.csv'
$notesPath = Join-Path $resolvedOutputDir 'buildings-archive-notes.md'

$inventory | Export-Csv -NoTypeInformation -Path $inventoryPath -Encoding UTF8

$summary = $inventory |
    Group-Object building_name |
    ForEach-Object {
        $group = $_.Group
        [PSCustomObject]@{
            building_name = $_.Name
            total_files = $group.Count
            high_priority_files = ($group | Where-Object import_priority -eq 'high').Count
            medium_priority_files = ($group | Where-Object import_priority -eq 'medium').Count
            low_priority_files = ($group | Where-Object import_priority -eq 'low').Count
            review_files = ($group | Where-Object import_priority -eq 'review').Count
        }
    } |
    Sort-Object building_name

$summary | Export-Csv -NoTypeInformation -Path $summaryPath -Encoding UTF8

$notes = @(
    '# Buildings Archive Triage',
    '',
    'This file is a filename-based triage only. It is suitable for staging and cleanup planning, not for irreversible deletion.',
    '',
    'Heuristic rules:',
    '- high: meter reading photos, utility reading folders, electricity workbooks, reconciliation workbooks',
    '- medium: electricity PDFs and related structured source files',
    '- low: water/sanitation, rates, taxes, POPs, payment/admin correspondence',
    '- review: filenames that need human review before classification',
    '',
    'Use the CSV files in this folder to filter by building and priority before deleting anything.'
)

$notes | Set-Content -Path $notesPath -Encoding UTF8

Write-Host "Archive inventory written to $resolvedOutputDir"
Write-Host "Inventory CSV: $inventoryPath"
Write-Host "Summary CSV: $summaryPath"
Write-Host "Notes: $notesPath"