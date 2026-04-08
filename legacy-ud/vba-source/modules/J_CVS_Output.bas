Attribute VB_Name = "J_CVS_Output"
'' HANDLE INVOICES %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
'Public RemRow As Integer
'Public RemCol As Integer
'
'Sub ExportCSV()
'' ExportCSV Macro
'' Exports ALL Data into CVS Format
'' Keyboard Shortcut: Ctrl+t
'
'         Dim WS_Count As Integer
'         Dim i As Integer
'         Dim ThisDate As String
'         Dim BuildingName As String
'         Dim Filename As String
'
'         Dim FolderName As String
'         Dim FileCount As Integer:      FileCount = 0
'         Dim ReadingCount As Integer:   ReadingCount = 0
'
'         Dim ThisRow As Integer:
'         Dim UnitColumn  As Integer:
'         Dim ThisColumn As Integer:
'         Dim DateRow As Integer:
'         Dim ThisUnit As String
'
'         On Error GoTo Skip:
'
'
'        For ThisWorksheet = 3 To ActiveWorkbook.Worksheets.Count   ' SHEET LOOP ----------------------------
'
'            BuildingName = ActiveWorkbook.Worksheets(ThisWorksheet).Range("A1")
'            FolderName = OutputPath & "\" & BuildingName
'            If Dir(FolderName, vbDirectory) = "" Then MkDir FolderName
'            ThisColumn = 2
'            DateRow = 2
'            ThisDate = Format(ActiveWorkbook.Worksheets(ThisWorksheet).Cells(DateRow, ThisColumn), "YYYY-MM")
'         '-----------------------------------------------------------------
'                While ThisDate <> ""
'                    ThisRow = 3
'                    UnitColumn = 1
'
'                    Filename = FolderName & "\" & ThisDate & " " & BuildingName & ".csv"
'
'                    Open Filename For Output As #1
'                        ThisUnit = ActiveWorkbook.Worksheets(ThisWorksheet).Cells(ThisRow, UnitColumn)
'                        While ThisUnit <> ""
'                            ThisReading = ActiveWorkbook.Worksheets(ThisWorksheet).Cells(ThisRow, ThisColumn)
'                            ThisLine = ThisUnit & "," & ThisReading
'                            Write #1, ThisLine
'                            ThisRow = ThisRow + 1
'                            ThisUnit = ActiveWorkbook.Worksheets(ThisWorksheet).Cells(ThisRow, UnitColumn)
'                            ReadingCount = ReadingCount + 1
'                        Wend
'                    Close #1
'
'                    FileCount = FileCount + 1
'
'                    ThisColumn = ThisColumn + 1
'                    ThisDate = Format(ActiveWorkbook.Worksheets(ThisWorksheet).Cells(DateRow, ThisColumn), "YYYY-MM")
'                Wend
'         Next ThisWorksheet
'         MsgBox (FileCount & " Visits to buildings" & vbCrLf & ReadingCount & " Readings taken")
'
'End
'Skip:
'Close #1
'    MsgBox ("Error found in: " & Filename & vbCrLf _
'        & "Column: " & ThisColumn & "    Row: " & ThisRow & vbCrLf _
'        & "Unit: " & ThisUnit & "  This Date: " & ThisDate & vbCrLf _
'        & FileCount & " Visits to buildings" & vbCrLf _
'        & ReadingCount & " Readings taken")
'
'End Sub




 
