Attribute VB_Name = "F_BCM_Transfer"
Sub BcmTransferA()
Attribute BcmTransferA.VB_ProcData.VB_Invoke_Func = "X\n14"

    ' Get Building abreviation
    ' Open BCM Template
    ' Run DownBMC Template Rows
    '   Read First Row:  Col 4 AccountNo, then get same Row , Col:7 get first 3 character or Description
    '  EG: "QG 01 ELE"
    ' Run down the rows in Dash's BCM output and find a matching AccountNo = UNIT Col:1
    ' If it matches the copy across:  Description and VAT INCL Amount to selPrice = Col 9
    WorkBookName = ActiveWorkbook.Name
    SheetName = ActiveSheet.Name
    If ActiveSheet.Name <> "BCM Output" Then Exit Sub
    
    ' Get Building abreviation
    ABR = Mid(Cells(3, 1).Value, 1, 2)
    
    BMCTempPath = Application.ActiveWorkbook.Path & "\BCM Templates"
    BMCOutputPath = Application.ActiveWorkbook.Path & "\BCM Output"
    
    
    
    ' Check If BCM Template Folder Exists
    
    If Dir(BMCTempPath, vbDirectory) = "" Then
        
        MsgBox ("The BCM TEMPLATE folder does not exist, OR it is not where it should be.  The folder will be created now and opened in explorer.  Once opened, please be sure to copy all the BCM TEMPLATES in to this folder")
        MkDir BMCTempPath
        ThisWorkbook.FollowHyperlink (BMCTempPath)
        Exit Sub
        
    End If
    
    If Dir(BMCOutputPath, vbDirectory) = "" Then
        MkDir BMCOutputPath
        ThisWorkbook.FollowHyperlink (BMCTempPath)
    End If
    
    Dim TemplateFileName  As String
    TemplateFileName = ABR & ".xlsx"
    Dim FullTemplateFileName  As String
    FullTemplateFileName = BMCTempPath & "\" & TemplateFileName
    
     If Dir(FullTemplateFileName) = "" Then
       Ans = MsgBox("The BCM TEMPLATE file: <" & TemplateFileName & "> is not in the BCM TEMPLATE folder.  Please copy it there, then try again", vbCritical)
        'ThisWorkbook.FollowHyperlink (BMCTempPath)
        Exit Sub
    End If
    
    
    
    ' Check if workbook is open
    If CheckFileIsOpen(TemplateFileName) = False Then
        Workbooks.Open FullTemplateFileName
    End If
    '           if not then Open
    If CheckFileIsOpen(TemplateFileName) = False Then
        MsgBox ("This file <" & TemplateFileName & "> could not be opened.  Please check and try again.")
        Exit Sub
    End If
    
     MsgBox ("The Descriptions and amount will now be transfered across to the BCM TEMPLATE file, <" & TemplateFileName & ">.  This should take less than 1 minute.  The results will be highlighted in yellow." & vbCrLf & "Click OK to start")
    
    Dim wb As Workbook
        ThisSheetName = "BCM Output"
        For Each wb In Application.Workbooks
            If wb.Name = TemplateFileName Then
                ThatUnitCount = 2
                ThatUnitName = wb.Worksheets(1).Cells(ThatUnitCount, 4).Value
                
                While ThatUnitName > ""
                    ThatDesc = Mid(wb.Worksheets(1).Cells(ThatUnitCount, 7).Value, 1, 3)
                    ThatData = UCase(ThatUnitName & ThatDesc)
                    
                    ThisRowCount = 3
                    ThisUnitName = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 1).Value
                    ThisDesc = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 2)
                    ThisCostExcl = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 3)
                    ThisCostIncl = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 4)
                    
                    ThisData = UCase(ThisUnitName & Mid(ThisDesc, 1, 3))
                  ' WorkBookName = Workbooks(WorkBookName).Sheets(WorkBookName).Name
                   Found = 0
                   
                    While ThisData > "" And Found = 0
              '   ************************************************************
                        If ThisData = ThatData Then
                            wb.Worksheets(1).Cells(ThatUnitCount, 7).Value = ThisDesc
                            wb.Worksheets(1).Cells(ThatUnitCount, 7).Interior.ColorIndex = 6 ' vbYellow
                            
                            wb.Worksheets(1).Cells(ThatUnitCount, 9).Value = ThisCostIncl
                            wb.Worksheets(1).Cells(ThatUnitCount, 9).Interior.ColorIndex = 6 ' vbYellow
                            Found = 1
                        End If
              
                        ThisRowCount = ThisRowCount + 1
                        ThisUnitName = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 1)
                        ThisDesc = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 2)
                        ThisData = UCase(ThisUnitName & Mid(ThisDesc, 1, 3))
                        ThisCostExcl = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 3)
                        ThisCostIncl = Workbooks(WorkBookName).Sheets(ThisSheetName).Cells(ThisRowCount, 4)
                  
                    Wend
              
                    ThatUnitCount = ThatUnitCount + 1
                    ThatUnitName = wb.Worksheets(1).Cells(ThatUnitCount, 4).Value
                    ThisRowCount = ThisRowCount + 1
                Wend
             
            End If
        Next wb
     On Error GoTo SaveAsAnotherName
        FullOutputFileName = BMCOutputPath & "\" & TemplateFileName
        Application.DisplayAlerts = False
        ActiveWorkbook.SaveAs Filename:=FullOutputFileName, FileFormat:=xlOpenXMLWorkbook, CreateBackup:=False
        Application.DisplayAlerts = True
       ' Ans = MsgBox("The template file <" & TemplateFileName & "> will now be closed, if you want to review it, do so now, then return to this message and click <OK> to continue")
       ' Workbooks(TemplateFileName).Close SaveChanges:=False
    
    On Error Resume Next
      '  ThisWorkbook.FollowHyperlink (BMCOutputPath)
        
        
    Exit Sub
    
SaveAsAnotherName:
    On Error Resume Next
    TimeStamp = Format(Now, "hhmmss")
    TemplateFileName = ABR & " " & TimeStamp & ".xlsx"
    FullOutputFileName = BMCOutputPath & "\" & TemplateFileName



End Sub

Function IsFileOpen(TemplateFileName) As Boolean
    Dim i As Long, msg As String
    IsFileOpen = False
    WBCount = Workbooks.Count
    For i = 1 To WBCount
        WBName = Workbooks(i).Name
        
        If TemplateFileName = WBName Then BcmTemp = Workbooks(i): IsFileOpen = True
    Next
End Function



















